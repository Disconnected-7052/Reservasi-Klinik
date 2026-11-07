const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:8080'
const password = process.env.SEED_PASSWORD || 'Klinik#2026'

let failed = 0

function check(label, ok, detail = '') {
  console.log(`${ok ? 'OK   ' : 'GAGAL'} ${label}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed += 1
}

async function json(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data, headers: res.headers }
}

async function login(email) {
  const res = await json('/auth/oauth/token', { method: 'POST', body: { grant_type: 'password', client_id: 'web', username: email, password } })
  return res.data.access_token
}

function nextWeekday(day) {
  const d = new Date(Date.now() + 7 * 3600 * 1000)
  for (let i = 1; i < 14; i++) {
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i))
    if (c.getUTCDay() === day) return c.toISOString().slice(0, 10)
  }
}

const health = await json('/health')
check('gateway sehat', health.status === 200)

const status = await json('/status')
check('discovery aktif', status.status === 200, status.data.discovery)
for (const [name, info] of Object.entries(status.data.services || {})) check(`instance ${name}`, info.healthy >= 1, `${info.healthy}/${info.instances}`)

check('API menolak tanpa token', (await json('/api/doctors')).status === 401)

const patient = await login('pasien@klinik.id')
const doctor = await login('sari@klinik.id')
check('login pasien dan dokter', Boolean(patient && doctor))

const doctors = await json('/api/doctors', { token: patient })
check('daftar dokter', doctors.status === 200 && doctors.data.length === 3)

const served = new Set()
for (let i = 0; i < 6; i++) {
  const res = await json('/api/doctors', { token: patient })
  served.add(res.headers.get('x-request-id'))
}
check('x-request-id unik per permintaan', served.size === 6)

const date = nextWeekday(2)
const slot = `${String(8 + Math.floor(Math.random() * 3)).padStart(2, '0')}:00`
const attempts = await Promise.all(Array.from({ length: 6 }, () => json('/api/appointments', { method: 'POST', token: patient, body: { doctorId: 'dr-sari', date, slot, complaint: 'Uji smoke' } })))
const created = attempts.filter(r => r.status === 201)
const conflicts = attempts.filter(r => r.status === 409 || r.status === 422)
check('pemesanan bersamaan hanya berhasil satu kali', created.length <= 1 && created.length + conflicts.length === 6, `berhasil ${created.length}, ditolak ${conflicts.length}`)

if (created.length === 1) {
  const id = created[0].data.id
  const mine = await json('/api/appointments', { token: patient })
  check('reservasi muncul di jadwal pasien', mine.data.some(a => a.id === id))
  let notified = false
  for (let i = 0; i < 20 && !notified; i++) {
    const notes = await json('/notifications', { token: patient })
    notified = notes.status === 200 && notes.data.items.some(n => n.appointmentId === id)
    if (!notified) await new Promise(r => setTimeout(r, 250))
  }
  check('notifikasi konfirmasi diterima', notified)
  const cancel = await json(`/api/appointments/${id}/cancel`, { method: 'PATCH', token: patient })
  check('pembatalan', cancel.status === 200 && cancel.data.status === 'CANCELLED')
}

process.exit(failed ? 1 : 0)
