import { config } from './config.js'
import { signEvent } from './crypto.js'

function signedHeaders(secret, body) {
  const { timestamp, signature } = signEvent(secret, body)
  return { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature': signature }
}

export function createResolver({
  registryUrl = config.registry.url,
  secret = config.registry.secret,
  fallback = config.urls,
  cacheMs = config.registry.cacheMs,
  downMs = config.registry.downMs,
  clock = () => Date.now(),
  request = fetch
} = {}) {
  const cache = new Map()
  const counters = new Map()
  const down = new Map()

  async function instances(name) {
    if (!registryUrl) return []
    const hit = cache.get(name)
    if (hit && clock() - hit.at < cacheMs) return hit.list
    try {
      const res = await request(`${registryUrl}/services/${name}`, { headers: signedHeaders(secret, ''), signal: AbortSignal.timeout(2000) })
      if (!res.ok) throw new Error(`registry membalas ${res.status}`)
      const list = (await res.json()).instances.map(i => i.url)
      cache.set(name, { at: clock(), list })
      return list
    } catch {
      return hit ? hit.list : []
    }
  }

  function isDown(url) {
    const until = down.get(url)
    if (!until) return false
    if (until <= clock()) {
      down.delete(url)
      return false
    }
    return true
  }

  async function pick(name) {
    const all = await instances(name)
    const healthy = all.filter(url => !isDown(url))
    const pool = healthy.length ? healthy : all
    if (!pool.length) return fallback[name]
    const next = counters.get(name) || 0
    counters.set(name, next + 1)
    return pool[next % pool.length]
  }

  function markDown(url) {
    down.set(url, clock() + downMs)
  }

  async function snapshot(names) {
    const result = {}
    for (const name of names) {
      const list = await instances(name)
      result[name] = { instances: list.length, healthy: list.filter(url => !isDown(url)).length }
    }
    return result
  }

  return { pick, markDown, snapshot, instances, enabled: Boolean(registryUrl) }
}

export function startRegistrar({
  name,
  port,
  host = config.registry.advertiseHost,
  registryUrl = config.registry.url,
  secret = config.registry.secret,
  heartbeatMs = config.registry.heartbeatMs,
  request = fetch
}) {
  if (!registryUrl) return { stop: async () => {}, enabled: false }
  const url = `http://${host}:${port}`
  let instanceId = null
  let timer = null
  let stopped = false

  async function call(method, path, body = '') {
    return request(`${registryUrl}${path}`, {
      method,
      headers: signedHeaders(secret, body),
      body: body || undefined,
      signal: AbortSignal.timeout(3000)
    })
  }

  async function tick() {
    if (stopped) return
    try {
      if (!instanceId) {
        const res = await call('POST', '/register', JSON.stringify({ name, url }))
        if (!res.ok) throw new Error(`registry membalas ${res.status}`)
        instanceId = (await res.json()).id
        console.log(`[discovery] ${name} terdaftar di ${url}`)
      } else {
        const res = await call('PUT', `/heartbeat/${instanceId}`)
        if (res.status === 404) instanceId = null
      }
    } catch (err) {
      console.error(`[discovery] ${err.message}`)
    }
    if (!stopped) {
      timer = setTimeout(tick, instanceId ? heartbeatMs : 2000)
      timer.unref?.()
    }
  }

  tick()

  async function stop() {
    stopped = true
    clearTimeout(timer)
    if (instanceId) {
      try {
        await call('DELETE', `/instances/${instanceId}`)
      } catch {}
    }
  }

  return { stop, enabled: true, url }
}
