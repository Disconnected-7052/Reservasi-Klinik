import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { config } from '../shared/config.js'
import { requireAuth } from '../shared/auth.js'

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/
const SERVICES = ['auth', 'clinic', 'notification']

export function createGatewayApp({ resolver, log = line => console.log(JSON.stringify(line)), limit = config.gatewayLimit, frontendDir } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)

  app.use((req, res, next) => {
    const incoming = req.get('x-request-id')
    req.id = incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
    res.set('x-request-id', req.id)
    const started = process.hrtime.bigint()
    res.on('finish', () => {
      log({
        time: new Date().toISOString(),
        id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        ip: req.ip,
        target: req.target || null
      })
    })
    next()
  })

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }
  }))

  app.get('/health', (req, res) => res.json({ service: 'gateway', status: 'ok', time: new Date().toISOString() }))

  app.get('/status', async (req, res) => {
    const services = await resolver.snapshot(SERVICES)
    res.json({ gateway: 'ok', discovery: resolver.enabled ? 'registry' : 'static', services })
  })

  app.use(rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: req => req.path === '/health',
    message: { error: 'rate_limited', message: 'Terlalu banyak permintaan, coba lagi sebentar lagi' }
  }))

  const forward = (name, pathFilter, { pathRewrite, protect = false } = {}) => {
    const guard = requireAuth()
    const proxy = createProxyMiddleware({
      target: config.urls[name],
      router: async req => {
        const target = await resolver.pick(name)
        req.target = target
        return target
      },
      pathFilter,
      pathRewrite,
      changeOrigin: true,
      xfwd: true,
      proxyTimeout: 15_000,
      timeout: 20_000,
      on: {
        proxyReq: (proxyReq, req) => proxyReq.setHeader('x-request-id', req.id),
        error: (err, req, res) => {
          if (req.target) resolver.markDown(req.target)
          if (res.headersSent || typeof res.writeHead !== 'function') return res.end?.()
          res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad_gateway', message: 'Layanan tujuan tidak dapat dihubungi' }))
        }
      }
    })
    const matches = req => [].concat(pathFilter).some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))
    app.use((req, res, next) => {
      if (!matches(req)) return next()
      if (protect && req.method !== 'OPTIONS') return guard(req, res, err => err ? next(err) : proxy(req, res, next))
      return proxy(req, res, next)
    })
  }

  forward('auth', '/auth', { pathRewrite: { '^/auth': '' } })
  forward('clinic', ['/api', '/graphql'], { protect: true })
  forward('notification', '/notifications', { protect: true })

  const frontend = frontendDir || path.resolve(new URL('../frontend', import.meta.url).pathname)
  app.use(express.static(frontend, { maxAge: config.prod ? '1h' : 0 }))
  app.get('*', (req, res) => res.sendFile(path.join(frontend, 'index.html')))

  return app
}
