import pg from 'pg'
const { Pool } = pg
let pool
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi')
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, max: Number(process.env.PG_POOL_MAX || 5) })
  return pool
}

const specs = {
  auth: {
    users: ['users', 'id', ['id','name','email','role','password_hash','failed_attempts','locked_until','created_at'], u => [u.id,u.name,u.email,u.role,u.passwordHash,u.failed,u.lockedUntil ? new Date(u.lockedUntil) : null,new Date(u.createdAt)], r => ({ id:r.id,name:r.name,email:r.email,role:r.role,passwordHash:r.password_hash,failed:r.failed_attempts,lockedUntil:r.locked_until ? new Date(r.locked_until).getTime() : 0,createdAt:new Date(r.created_at).toISOString() })],
    refresh: ['refresh_tokens', 'token_hash', ['token_hash','user_id','expires_at'], t => [t.hash,t.userId,new Date(t.expiresAt)], r => ({ hash:r.token_hash,userId:r.user_id,expiresAt:new Date(r.expires_at).getTime() })]
  },
  clinic: {
    appointments: ['appointments', 'id', ['id','patient_id','patient_name','doctor_id','appointment_date','slot','status','complaint_ciphertext','note_ciphertext','created_at'], a => [a.id,a.patientId,a.patientName,a.doctorId,a.date,a.slot,a.status,a.complaint,a.note,new Date(a.createdAt)], r => ({ id:r.id,patientId:r.patient_id,patientName:r.patient_name,doctorId:r.doctor_id,date:r.appointment_date.toISOString().slice(0,10),slot:r.slot,status:r.status,complaint:r.complaint_ciphertext,note:r.note_ciphertext,createdAt:new Date(r.created_at).toISOString() })]
  },
  notification: {
    notifications: ['notifications', 'id', ['id','user_id','kind','title','message','appointment_id','deliver_at','delivered','read','cancelled','created_at'], n => [n.id,n.userId,n.kind,n.title,n.message,n.appointmentId || null,new Date(n.deliverAt),!!n.delivered,!!n.read,!!n.cancelled,new Date(n.createdAt)], r => ({ id:r.id,userId:r.user_id,kind:r.kind,title:r.title,message:r.message,appointmentId:r.appointment_id,deliverAt:new Date(r.deliver_at).toISOString(),delivered:r.delivered,read:r.read,cancelled:r.cancelled,createdAt:new Date(r.created_at).toISOString() })],
    processed: ['processed_events', 'event_key', ['event_key'], x => [x], r => r.event_key]
  }
}

export async function createPostgresStore(name, defaults) {
  const db = getPool(), spec = specs[name]
  if (!spec) throw new Error(`Store tidak dikenal: ${name}`)
  const data = structuredClone(defaults)
  for (const [key, [table, , , decode]] of Object.entries(spec)) {
    const result = await db.query(`SELECT * FROM ${table}`)
    data[key] = result.rows.map(decode)
  }
  let pending = Promise.resolve()
  async function persist() {
    const snapshot = structuredClone(data)
    pending = pending.then(async () => {
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        for (const [key, [table, primaryKey, columns, encode]] of Object.entries(spec)) {
          const rows = snapshot[key] || []
          if (rows.length) {
            const placeholders = rows.map((_, i) => `(${columns.map((__, j) => `$${i*columns.length+j+1}`).join(',')})`).join(',')
            const updates = columns.filter(c => c !== primaryKey).map(c => `${c}=EXCLUDED.${c}`).join(',')
            await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders} ON CONFLICT (${primaryKey}) DO UPDATE SET ${updates}`, rows.flatMap(encode))
          }
          const keep = rows.map(r => encode(r)[0])
          if (table !== 'users') {
            if (keep.length) await client.query(`DELETE FROM ${table} WHERE NOT (${primaryKey} = ANY($1))`, [keep])
            else await client.query(`DELETE FROM ${table}`)
          }
        }
        await client.query('COMMIT')
      } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    })
    return pending
  }
  let timer
  function save() { clearTimeout(timer); timer = setTimeout(() => persist().catch(e => console.error('[database] persist failed:', e)), 30); timer.unref?.() }
  function flush() { clearTimeout(timer); return persist() }
  function atomic(fn) { return fn() }
  function wrap(methods) { return Object.fromEntries(Object.entries(methods).map(([k, fn]) => [k, (...args) => fn(...args)])) }
  return { data, save, flush, atomic, wrap }
}
export async function closeDatabase() { if (pool) { await pool.end(); pool = null } }
