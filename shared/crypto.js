import crypto from 'node:crypto'

export function createCipher(hexKey) {
  const key = Buffer.from(hexKey, 'hex')
  if (key.length !== 32) throw new Error('DATA_KEY harus 64 karakter hex (32 byte)')

  function encrypt(text) {
    if (text === null || text === undefined || text === '') return ''
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [iv, tag, body].map(b => b.toString('base64')).join('.')
  }

  function decrypt(payload) {
    if (!payload) return ''
    const [iv, tag, body] = payload.split('.').map(p => Buffer.from(p, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  }

  return { encrypt, decrypt }
}

export function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

export function signEvent(secret, body, timestamp = Date.now()) {
  return { timestamp: String(timestamp), signature: sign(secret, `${timestamp}.${body}`) }
}

export function verifyEvent(secret, body, timestamp, signature, toleranceMs = 300_000, now = Date.now()) {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceMs) return false
  return safeEqual(sign(secret, `${ts}.${body}`), signature || '')
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}
