import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createGatewayApp } from '../gateway/app.js'
import { createRegistry, createRegistryApp } from '../services/registry/app.js'
import { createResolver, startRegistrar } from '../shared/discovery.js'
import { config } from '../shared/config.js'
import { listen, call } from './helpers.js'

let registry, backends, registrars, gateway, resolver, logs

function backend(name) {
  const app = express()
  app.use((req, res) => res.json({ name, url: req.url, forwarded: req.headers['x-forwarded-for'] || null, requestId: req.headers['x-request-id'] }))
  return listen(app)
}

function token() {
  return jwt.sign({ name: 'Uji', role: 'patient', scope: 'doctors:read' }, config.jwt.secret, {
    algorithm: 'HS256', subject: 'u1', issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: 300
  })
}

before(async () => {
  logs = []
  registry = await listen(createRegistryApp(createRegistry()))
  backends = [await backend('clinic-1'), await backend('clinic-2')]
  const other = await backend('single')
  registrars = backends.map(b => startRegistrar({ name: 'clinic', port: new URL(b.url).port, host: '127.0.0.1', registryUrl: registry.url, heartbeatMs: 50 }))
  registrars.push(startRegistrar({ name: 'auth', port: new URL(other.url).port, host: '127.0.0.1', registryUrl: registry.url, heartbeatMs: 50 }))
  backends.push(other)
  resolver = createResolver({ registryUrl: registry.url, cacheMs: 0, downMs: 60_000, fallback: { clinic: 'http://127.0.0.1:1', auth: 'http://127.0.0.1:1', notification: 'http://127.0.0.1:1' } })
  for (let i = 0; i < 80; i++) {
    const snap = await resolver.snapshot(['clinic', 'auth'])
    if (snap.clinic.instances === 2 && snap.auth.instances === 1) break
    await new Promise(r => setTimeout(r, 25))
  }
  gateway = await listen(createGatewayApp({ resolver, log: line => logs.push(line) }))
})

after(async () => {
  for (const r of registrars) await r.stop()
  await gateway.close()
  await registry.close()
  for (const b of backends) await b.close().catch(() => {})
})

test('gateway: rute dilindungi menolak permintaan tanpa token yang sah', async () => {
  assert.equal((await call(`${gateway.url}/api/doctors`)).status, 401)
  assert.equal((await call(`${gateway.url}/api/doctors`, { token: 'palsu' })).status, 401)
  assert.equal((await call(`${gateway.url}/graphql`, { method: 'POST', body: { query: '{ doctors { id } }' } })).status, 401)
  assert.equal((await call(`${gateway.url}/notifications`)).status, 401)
})

test('gateway: rute auth tidak butuh token dan awalan /auth dibuang', async () => {
  const res = await call(`${gateway.url}/auth/oauth/userinfo`)
  assert.equal(res.status, 200)
  assert.equal(res.body.name, 'single')
  assert.equal(res.body.url, '/oauth/userinfo')
})

test('gateway: beban dibagi bergantian ke semua instance clinic', async () => {
  const names = []
  for (let i = 0; i < 6; i++) names.push((await call(`${gateway.url}/api/doctors`, { token: token() })).body.name)
  assert.equal(names.filter(n => n === 'clinic-1').length, 3)
  assert.equal(names.filter(n => n === 'clinic-2').length, 3)
})

test('gateway: meneruskan request id dan IP klien', async () => {
  const res = await call(`${gateway.url}/api/doctors`, { token: token(), headers: { 'x-request-id': 'req-uji-12345' } })
  assert.equal(res.body.requestId, 'req-uji-12345')
  assert.ok(res.body.forwarded)
  const generated = await call(`${gateway.url}/api/doctors`, { token: token(), headers: { 'x-request-id': 'x y' } })
  assert.match(generated.body.requestId, /^[0-9a-f-]{36}$/)
  assert.ok(logs.some(l => l.id === 'req-uji-12345' && l.status === 200 && l.path === '/api/doctors'))
})

test('gateway: instance yang mati dilewati setelah satu kegagalan', async () => {
  await backends[0].close()
  const statuses = []
  const names = []
  for (let i = 0; i < 8; i++) {
    const res = await call(`${gateway.url}/api/doctors`, { token: token() })
    statuses.push(res.status)
    if (res.status === 200) names.push(res.body.name)
  }
  assert.ok(statuses.filter(s => s === 502).length <= 1)
  assert.ok(names.length >= 7)
  assert.ok(names.every(n => n === 'clinic-2'))
  const snap = await (await fetch(`${gateway.url}/status`)).json()
  assert.equal(snap.discovery, 'registry')
})

test('gateway: status hanya memuat jumlah instance dan /health terbuka', async () => {
  const snap = await (await fetch(`${gateway.url}/status`)).json()
  assert.equal(typeof snap.services.clinic.instances, 'number')
  assert.ok(!JSON.stringify(snap).includes('127.0.0.1'))
  assert.equal((await fetch(`${gateway.url}/health`)).status, 200)
})

test('gateway: rate limit di pintu masuk', async () => {
  const limited = await listen(createGatewayApp({ resolver, limit: 3, log: () => {} }))
  const codes = []
  for (let i = 0; i < 5; i++) codes.push((await fetch(`${limited.url}/api/x`)).status)
  assert.deepEqual(codes.slice(0, 3), [401, 401, 401])
  assert.equal(codes[4], 429)
  assert.equal((await fetch(`${limited.url}/health`)).status, 200)
  await limited.close()
})

test('gateway: front end disajikan dan rute tak dikenal jatuh ke index', async () => {
  const res = await fetch(`${gateway.url}/halaman-apa-saja`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /<div id="app">/)
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/)
})
