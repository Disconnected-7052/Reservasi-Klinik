import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'

export function baseApp(name, { limit = 300 } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    allowedHeaders: ['content-type', 'authorization'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  }))
  app.use(rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Terlalu banyak permintaan, coba lagi sebentar lagi' }
  }))
  app.get('/health', (req, res) => res.json({ service: name, status: 'ok', time: new Date().toISOString() }))
  return app
}

export function finish(app) {
  app.use((req, res) => res.status(404).json({ error: 'not_found', message: 'Endpoint tidak ditemukan' }))
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'JSON tidak valid' })
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.code || 'bad_request', message: err.message })
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: 'Terjadi kesalahan pada server' })
  })
  return app
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}
