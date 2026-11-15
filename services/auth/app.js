import crypto from 'node:crypto'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../../shared/config.js'
import { createStore } from '../../shared/store.js'
import { id, safeEqual } from '../../shared/crypto.js'
import { baseApp, finish, HttpError } from '../../shared/http.js'
import { authenticate } from '../../shared/auth.js'
import rateLimit from 'express-rate-limit'

export const ROLE_SCOPES = {
  patient: ['doctors:read', 'reservations:read', 'reservations:write', 'notifications:read'],
  doctor: ['doctors:read', 'reservations:read', 'records:write', 'notifications:read'],
  admin: ['doctors:read', 'reservations:read', 'reservations:manage', 'notifications:read']
}

const MAX_FAILED = 5
const LOCK_MS = 15 * 60 * 1000
const DUMMY_HASH = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

export function seedUsers(store, password = config.seedPassword) {
  store.atomic(() => seedLocked(store, password))
}

function seedLocked(store, password) {
  if (store.data.users.length) return
  const digest = bcrypt.hashSync(password, 10)
  const seeds = [
    ['admin', 'Admin Klinik', 'admin@klinik.id', 'admin'],
    ['dr-sari', 'dr. Sari Wulandari, Sp.PD', 'sari@klinik.id', 'doctor'],
    ['dr-budi', 'dr. Budi Hartono, Sp.A', 'budi@klinik.id', 'doctor'],
    ['dr-maya', 'drg. Maya Puspita', 'maya@klinik.id', 'doctor'],
    ['pasien-demo', 'Rina Anggraini', 'pasien@klinik.id', 'patient']
  ]
  for (const [uid, name, email, role] of seeds) {
    store.data.users.push({ id: uid, name, email, role, passwordHash: digest, failed: 0, lockedUntil: 0, createdAt: new Date().toISOString() })
  }
  store.save()
}

export function createAuthApp({ store = createStore('auth', { users: [], refresh: [] }), tokenLimit = 20 } = {}) {
  seedUsers(store)
  const app = baseApp('auth-service', { limit: 600 })
  app.use(express.json({ limit: '10kb' }))
  app.use(express.urlencoded({ extended: false, limit: '10kb' }))

  const strict = rateLimit({
    windowMs: 60_000,
    limit: tokenLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Terlalu banyak percobaan, coba lagi sebentar lagi' }
  })

  function issue(subject) {
    const scope = subject.scopes.join(' ')
    const accessToken = jwt.sign(
      { name: subject.name, role: subject.role, scope },
      config.jwt.secret,
      { algorithm: 'HS256', subject: subject.id, issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: config.jwt.accessTtl, jwtid: id('jti') }
    )
    return { access_token: accessToken, token_type: 'Bearer', expires_in: config.jwt.accessTtl, scope }
  }

  function issueWithRefresh(user) {
    const tokens = issue({ id: user.id, name: user.name, role: user.role, scopes: ROLE_SCOPES[user.role] })
    const refresh = crypto.randomBytes(32).toString('base64url')
    store.data.refresh = store.data.refresh.filter(r => r.expiresAt > Date.now())
    store.data.refresh.push({ hash: hash(refresh), userId: user.id, expiresAt: Date.now() + config.jwt.refreshTtl * 1000 })
    store.save()
    return { ...tokens, refresh_token: refresh }
  }

  function oauthError(res, status, error, description) {
    res.set('Cache-Control', 'no-store')
    return res.status(status).json({ error, error_description: description })
  }

  app.post('/oauth/token', strict, async (req, res, next) => {
    try {
      const { grant_type: grant } = req.body || {}
      res.set('Cache-Control', 'no-store')

      if (grant === 'password') {
        const { username, password, client_id: clientId } = req.body
        if (clientId !== 'web') return oauthError(res, 401, 'invalid_client', 'Client tidak dikenal')
        if (typeof username !== 'string' || typeof password !== 'string') return oauthError(res, 400, 'invalid_request', 'username dan password wajib diisi')
        const email = username.trim().toLowerCase()
        const snapshot = store.atomic(() => {
          const found = store.data.users.find(u => u.email === email)
          return found ? { passwordHash: found.passwordHash, lockedUntil: found.lockedUntil } : null
        })
        if (snapshot && snapshot.lockedUntil > Date.now()) return oauthError(res, 429, 'account_locked', 'Akun dikunci sementara, coba lagi nanti')
        const ok = await bcrypt.compare(password, snapshot ? snapshot.passwordHash : DUMMY_HASH)
        const outcome = store.atomic(() => {
          const user = store.data.users.find(u => u.email === email)
          if (!user) return null
          if (!ok) {
            user.failed += 1
            if (user.failed >= MAX_FAILED) {
              user.lockedUntil = Date.now() + LOCK_MS
              user.failed = 0
            }
            store.save()
            return null
          }
          user.failed = 0
          user.lockedUntil = 0
          return issueWithRefresh(user)
        })
        if (!outcome) return oauthError(res, 400, 'invalid_grant', 'Email atau kata sandi salah')
        return res.json(outcome)
      }

      if (grant === 'refresh_token') {
        const token = req.body.refresh_token
        if (typeof token !== 'string') return oauthError(res, 400, 'invalid_request', 'refresh_token wajib diisi')
        const digest = hash(token)
        const outcome = store.atomic(() => {
          const index = store.data.refresh.findIndex(r => r.hash === digest && r.expiresAt > Date.now())
          if (index < 0) return { error: 'Refresh token tidak valid' }
          const [record] = store.data.refresh.splice(index, 1)
          const user = store.data.users.find(u => u.id === record.userId)
          if (!user) {
            store.save()
            return { error: 'Pengguna tidak ditemukan' }
          }
          return { tokens: issueWithRefresh(user) }
        })
        if (outcome.error) return oauthError(res, 400, 'invalid_grant', outcome.error)
        return res.json(outcome.tokens)
      }

      if (grant === 'client_credentials') {
        const { client_id: clientId, client_secret: clientSecret } = req.body
        const client = config.clients[clientId]
        if (!client || !client.secret || typeof clientSecret !== 'string' || !safeEqual(client.secret, clientSecret)) {
          return oauthError(res, 401, 'invalid_client', 'Kredensial client salah')
        }
        return res.json(issue({ id: clientId, name: clientId, role: 'service', scopes: ['service:internal'] }))
      }

      return oauthError(res, 400, 'unsupported_grant_type', 'grant_type tidak didukung')
    } catch (err) {
      next(err)
    }
  })

  app.post('/oauth/revoke', (req, res) => {
    const token = req.body?.token
    if (typeof token === 'string') {
      const digest = hash(token)
      store.atomic(() => {
        store.data.refresh = store.data.refresh.filter(r => r.hash !== digest)
        store.save()
      })
    }
    res.status(200).json({ revoked: true })
  })

  app.get('/oauth/userinfo', (req, res) => {
    const user = authenticate(req)
    if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Token tidak valid' })
    const record = store.atomic(() => store.data.users.find(u => u.id === user.id))
    res.json({ id: user.id, name: user.name, role: user.role, email: record?.email, scopes: user.scopes })
  })

  app.post('/register', strict, async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {}
      if (typeof name !== 'string' || name.trim().length < 3 || name.length > 80) throw new HttpError(400, 'validation_error', 'Nama minimal 3 karakter')
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new HttpError(400, 'validation_error', 'Format email tidak valid')
      if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new HttpError(400, 'validation_error', 'Kata sandi minimal 8 karakter dengan huruf dan angka')
      }
      const normalized = email.trim().toLowerCase()
      const passwordHash = await bcrypt.hash(password, 10)
      const created = store.atomic(() => {
        if (store.data.users.some(u => u.email === normalized)) return null
        const user = {
          id: id('pasien'),
          name: name.trim(),
          email: normalized,
          role: 'patient',
          passwordHash,
          failed: 0,
          lockedUntil: 0,
          createdAt: new Date().toISOString()
        }
        store.data.users.push(user)
        store.save()
        return user
      })
      if (!created) throw new HttpError(409, 'email_taken', 'Email sudah terdaftar')
      res.status(201).json({ id: created.id, name: created.name, email: created.email, role: created.role })
    } catch (err) {
      next(err)
    }
  })

  return finish(app)
}
