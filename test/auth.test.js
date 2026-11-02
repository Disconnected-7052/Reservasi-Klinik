import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { createAuthApp } from '../services/auth/app.js'
import { createStore } from '../shared/store.js'
import { config } from '../shared/config.js'
import { listen, call } from './helpers.js'

let server
let url

before(async () => {
  const store = createStore('auth', { users: [], refresh: [] })
  server = await listen(createAuthApp({ store, tokenLimit: 1000 }))
  url = server.url
})

after(() => server.close())

const login = (username, password) => call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'password', client_id: 'web', username, password } })

test('login pasien berhasil dan token berisi scope pasien', async () => {
  const res = await login('pasien@klinik.id', config.seedPassword)
  assert.equal(res.status, 200)
  const claims = jwt.verify(res.body.access_token, config.jwt.secret)
  assert.equal(claims.role, 'patient')
  assert.match(claims.scope, /reservations:write/)
  assert.equal(claims.aud, config.jwt.audience)
})

test('scope dokter tidak memiliki reservations:write', async () => {
  const res = await login('sari@klinik.id', config.seedPassword)
  assert.equal(res.body.scope.includes('reservations:write'), false)
  assert.match(res.body.scope, /records:write/)
})

test('kata sandi salah ditolak', async () => {
  const res = await login('pasien@klinik.id', 'salah-total')
  assert.equal(res.status, 400)
  assert.equal(res.body.error, 'invalid_grant')
})

test('email tidak terdaftar menghasilkan galat yang sama', async () => {
  const res = await login('tidakada@klinik.id', 'apapun123')
  assert.equal(res.status, 400)
  assert.equal(res.body.error_description, 'Email atau kata sandi salah')
})

test('client_id tidak dikenal ditolak', async () => {
  const res = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'password', client_id: 'x', username: 'a', password: 'b' } })
  assert.equal(res.status, 401)
})

test('grant_type tidak didukung ditolak', async () => {
  const res = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'implicit' } })
  assert.equal(res.body.error, 'unsupported_grant_type')
})

test('refresh token berotasi dan token lama tidak dapat dipakai lagi', async () => {
  const first = await login('pasien@klinik.id', config.seedPassword)
  const second = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'refresh_token', refresh_token: first.body.refresh_token } })
  assert.equal(second.status, 200)
  assert.notEqual(second.body.refresh_token, first.body.refresh_token)
  const replay = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'refresh_token', refresh_token: first.body.refresh_token } })
  assert.equal(replay.status, 400)
})

test('revoke mencabut refresh token', async () => {
  const first = await login('pasien@klinik.id', config.seedPassword)
  await call(`${url}/oauth/revoke`, { method: 'POST', body: { token: first.body.refresh_token } })
  const res = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'refresh_token', refresh_token: first.body.refresh_token } })
  assert.equal(res.status, 400)
})

test('client_credentials memerlukan secret yang benar', async () => {
  const bad = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'client_credentials', client_id: 'clinic-service', client_secret: 'salah' } })
  assert.equal(bad.status, 401)
  const good = await call(`${url}/oauth/token`, { method: 'POST', body: { grant_type: 'client_credentials', client_id: 'clinic-service', client_secret: config.clients['clinic-service'].secret } })
  assert.equal(good.status, 200)
  assert.equal(good.body.scope, 'service:internal')
})

test('registrasi pasien baru lalu login', async () => {
  const reg = await call(`${url}/register`, { method: 'POST', body: { name: 'Joko Widodo', email: 'Joko@Contoh.id', password: 'rahasia123' } })
  assert.equal(reg.status, 201)
  assert.equal(reg.body.role, 'patient')
  const res = await login('joko@contoh.id', 'rahasia123')
  assert.equal(res.status, 200)
})

test('registrasi menolak email ganda, sandi lemah, dan email tidak valid', async () => {
  const dup = await call(`${url}/register`, { method: 'POST', body: { name: 'Rina A', email: 'pasien@klinik.id', password: 'rahasia123' } })
  assert.equal(dup.status, 409)
  const weak = await call(`${url}/register`, { method: 'POST', body: { name: 'Rina A', email: 'baru@klinik.id', password: 'abcdefgh' } })
  assert.equal(weak.status, 400)
  const mail = await call(`${url}/register`, { method: 'POST', body: { name: 'Rina A', email: 'bukan-email', password: 'rahasia123' } })
  assert.equal(mail.status, 400)
})

test('userinfo memerlukan token valid', async () => {
  assert.equal((await call(`${url}/oauth/userinfo`)).status, 401)
  const t = await login('admin@klinik.id', config.seedPassword)
  const info = await call(`${url}/oauth/userinfo`, { token: t.body.access_token })
  assert.equal(info.body.role, 'admin')
})

test('akun terkunci setelah 5 kali gagal', async () => {
  for (let i = 0; i < 5; i++) await login('budi@klinik.id', 'salah-lagi-1')
  const res = await login('budi@klinik.id', config.seedPassword)
  assert.equal(res.status, 429)
  assert.equal(res.body.error, 'account_locked')
})

test('endpoint token dibatasi laju permintaannya', async () => {
  const limited = await listen(createAuthApp({ store: createStore('auth', { users: [], refresh: [] }), tokenLimit: 3 }))
  const statuses = []
  for (let i = 0; i < 5; i++) {
    const res = await call(`${limited.url}/oauth/token`, { method: 'POST', body: { grant_type: 'password', client_id: 'web', username: 'a@b.c', password: 'x' } })
    statuses.push(res.status)
  }
  await limited.close()
  assert.deepEqual(statuses, [400, 400, 400, 429, 429])
})
