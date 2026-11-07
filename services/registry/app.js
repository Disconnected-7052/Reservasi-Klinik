import express from 'express'
import { baseApp, finish, HttpError } from '../../shared/http.js'
import { verifyEvent, id } from '../../shared/crypto.js'
import { config } from '../../shared/config.js'

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/

export function createRegistry({ ttlMs = config.registry.ttlMs, clock = () => Date.now() } = {}) {
  const instances = new Map()

  function sweep() {
    const now = clock()
    for (const [key, item] of instances) {
      if (now - item.lastSeen > ttlMs) instances.delete(key)
    }
  }

  function register(name, url) {
    sweep()
    for (const item of instances.values()) {
      if (item.name === name && item.url === url) {
        item.lastSeen = clock()
        return item
      }
    }
    const item = { id: id('inst'), name, url, registeredAt: new Date(clock()).toISOString(), lastSeen: clock() }
    instances.set(item.id, item)
    return item
  }

  function heartbeat(instanceId) {
    sweep()
    const item = instances.get(instanceId)
    if (!item) return false
    item.lastSeen = clock()
    return true
  }

  function remove(instanceId) {
    return instances.delete(instanceId)
  }

  function list(name) {
    sweep()
    return [...instances.values()]
      .filter(i => !name || i.name === name)
      .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt) || a.id.localeCompare(b.id))
      .map(({ id: instanceId, name: n, url, registeredAt }) => ({ id: instanceId, name: n, url, registeredAt }))
  }

  return { register, heartbeat, remove, list, sweep }
}

export function createRegistryApp(registry = createRegistry(), { secret = config.registry.secret } = {}) {
  const app = baseApp('registry-service', { limit: 1200 })

  app.use(express.raw({ type: '*/*', limit: '2kb' }))
  app.use((req, res, next) => {
    if (req.path === '/health') return next()
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
    if (!verifyEvent(secret, raw, req.get('x-timestamp'), req.get('x-signature'), 60_000)) {
      return next(new HttpError(401, 'invalid_signature', 'Tanda tangan registry tidak valid'))
    }
    req.raw = raw
    next()
  })

  app.post('/register', (req, res) => {
    let body
    try {
      body = JSON.parse(req.raw)
    } catch {
      throw new HttpError(400, 'bad_request', 'Body bukan JSON valid')
    }
    if (typeof body?.name !== 'string' || !NAME_PATTERN.test(body.name)) throw new HttpError(400, 'validation_error', 'Nama layanan tidak valid')
    let parsed
    try {
      parsed = new URL(body.url)
    } catch {
      throw new HttpError(400, 'validation_error', 'URL layanan tidak valid')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new HttpError(400, 'validation_error', 'URL layanan harus http atau https')
    const item = registry.register(body.name, parsed.origin)
    res.status(201).json({ id: item.id, ttlMs: config.registry.ttlMs })
  })

  app.put('/heartbeat/:id', (req, res) => {
    if (!registry.heartbeat(req.params.id)) throw new HttpError(404, 'instance_not_found', 'Instance tidak terdaftar')
    res.status(204).end()
  })

  app.delete('/instances/:id', (req, res) => {
    registry.remove(req.params.id)
    res.status(204).end()
  })

  app.get('/services', (req, res) => {
    const grouped = {}
    for (const item of registry.list()) (grouped[item.name] ||= []).push(item)
    res.json({ services: grouped })
  })

  app.get('/services/:name', (req, res) => {
    res.json({ name: req.params.name, instances: registry.list(req.params.name) })
  })

  return finish(app)
}
