import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRegistry, createRegistryApp } from '../services/registry/app.js'
import { signEvent } from '../shared/crypto.js'
import { createResolver, startRegistrar } from '../shared/discovery.js'
import { config } from '../shared/config.js'
import { listen } from './helpers.js'

function signedCall(url, method, path, body = '', secret = config.registry.secret) {
  const { timestamp, signature } = signEvent(secret, body)
  return fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature': signature },
    body: body || undefined
  })
}

test('registry: instance kedaluwarsa tanpa heartbeat', () => {
  const clock = { now: 1000 }
  const registry = createRegistry({ ttlMs: 100, clock: () => clock.now })
  const item = registry.register('clinic', 'http://a:4002')
  assert.equal(registry.list('clinic').length, 1)
  clock.now += 90
  assert.equal(registry.heartbeat(item.id), true)
  clock.now += 90
  assert.equal(registry.list('clinic').length, 1)
  clock.now += 200
  assert.equal(registry.list('clinic').length, 0)
  assert.equal(registry.heartbeat(item.id), false)
})

test('registry: pendaftaran ulang url yang sama tidak menggandakan instance', () => {
  const registry = createRegistry()
  const a = registry.register('clinic', 'http://a:4002')
  const b = registry.register('clinic', 'http://a:4002')
  registry.register('clinic', 'http://b:4002')
  assert.equal(a.id, b.id)
  assert.equal(registry.list('clinic').length, 2)
})

test('registry API: wajib bertanda tangan, validasi input, daftar dan hapus', async () => {
  const server = await listen(createRegistryApp(createRegistry()))
  const unsigned = await fetch(`${server.url}/services`)
  assert.equal(unsigned.status, 401)
  const wrong = await signedCall(server.url, 'GET', '/services', '', 'rahasia-lain')
  assert.equal(wrong.status, 401)

  const badName = await signedCall(server.url, 'POST', '/register', JSON.stringify({ name: 'Bad Name', url: 'http://x:1' }))
  assert.equal(badName.status, 400)
  const badUrl = await signedCall(server.url, 'POST', '/register', JSON.stringify({ name: 'clinic', url: 'ftp://x:1' }))
  assert.equal(badUrl.status, 400)
  const notJson = await signedCall(server.url, 'POST', '/register', '{rusak')
  assert.equal(notJson.status, 400)

  const created = await signedCall(server.url, 'POST', '/register', JSON.stringify({ name: 'clinic', url: 'http://x:4002/path' }))
  assert.equal(created.status, 201)
  const { id } = await created.json()
  const listed = await (await signedCall(server.url, 'GET', '/services/clinic')).json()
  assert.deepEqual(listed.instances.map(i => i.url), ['http://x:4002'])
  assert.equal((await signedCall(server.url, 'PUT', `/heartbeat/${id}`)).status, 204)
  assert.equal((await signedCall(server.url, 'PUT', '/heartbeat/tidak-ada')).status, 404)
  assert.equal((await signedCall(server.url, 'DELETE', `/instances/${id}`)).status, 204)
  const empty = await (await signedCall(server.url, 'GET', '/services')).json()
  assert.deepEqual(empty.services, {})
  await server.close()
})

test('registry API: tanda tangan kedaluwarsa ditolak', async () => {
  const server = await listen(createRegistryApp(createRegistry()))
  const { timestamp, signature } = signEvent(config.registry.secret, '', Date.now() - 600_000)
  const res = await fetch(`${server.url}/services`, { headers: { 'x-timestamp': timestamp, 'x-signature': signature } })
  assert.equal(res.status, 401)
  await server.close()
})

test('discovery: registrar mendaftar, resolver round-robin, dan deregistrasi', async () => {
  const server = await listen(createRegistryApp(createRegistry()))
  const a = startRegistrar({ name: 'clinic', port: 5001, host: '127.0.0.1', registryUrl: server.url, heartbeatMs: 50 })
  const b = startRegistrar({ name: 'clinic', port: 5002, host: '127.0.0.1', registryUrl: server.url, heartbeatMs: 50 })
  const resolver = createResolver({ registryUrl: server.url, cacheMs: 0, fallback: { clinic: 'http://fallback:1' } })

  let seen = []
  for (let i = 0; i < 40 && seen.length < 2; i++) {
    seen = await resolver.instances('clinic')
    if (seen.length < 2) await new Promise(r => setTimeout(r, 25))
  }
  assert.equal(seen.length, 2)
  const picks = []
  for (let i = 0; i < 4; i++) picks.push(await resolver.pick('clinic'))
  assert.equal(new Set(picks).size, 2)
  assert.equal(picks[0], picks[2])
  assert.equal(picks[1], picks[3])

  resolver.markDown(picks[0])
  for (let i = 0; i < 4; i++) assert.equal(await resolver.pick('clinic'), picks[1])

  await a.stop()
  await b.stop()
  assert.equal((await resolver.instances('clinic')).length, 0)
  assert.equal(await resolver.pick('clinic'), 'http://fallback:1')
  await server.close()
})

test('discovery: resolver memakai rute statis bila registry tidak dikonfigurasi atau mati', async () => {
  const off = createResolver({ registryUrl: '', fallback: { auth: 'http://static:4001' } })
  assert.equal(off.enabled, false)
  assert.equal(await off.pick('auth'), 'http://static:4001')
  const dead = createResolver({ registryUrl: 'http://127.0.0.1:1', cacheMs: 0, fallback: { auth: 'http://static:4001' } })
  assert.equal(await dead.pick('auth'), 'http://static:4001')
})

test('discovery: resolver memakai cache lama saat registry tidak terjangkau', async () => {
  const clock = { now: 0 }
  let healthy = true
  const request = async () => {
    if (!healthy) throw new Error('mati')
    return { ok: true, json: async () => ({ instances: [{ url: 'http://a:1' }] }) }
  }
  const resolver = createResolver({ registryUrl: 'http://reg', request, cacheMs: 10, clock: () => clock.now, fallback: { clinic: 'http://fallback:1' } })
  assert.equal(await resolver.pick('clinic'), 'http://a:1')
  healthy = false
  clock.now = 1000
  assert.equal(await resolver.pick('clinic'), 'http://a:1')
})
