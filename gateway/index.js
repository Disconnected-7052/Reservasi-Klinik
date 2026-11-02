import path from 'node:path'
import express from 'express'
import helmet from 'helmet'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { config } from '../shared/config.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
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

app.get('/health', (req, res) => res.json({ service: 'gateway', status: 'ok' }))

const forward = (target, pathFilter, pathRewrite) => app.use(createProxyMiddleware({
  target,
  pathFilter,
  pathRewrite,
  changeOrigin: true,
  on: { error: (err, req, res) => res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad_gateway', message: 'Layanan tujuan tidak dapat dihubungi' })) }
}))

forward(config.urls.auth, '/auth', { '^/auth': '' })
forward(config.urls.clinic, ['/api', '/graphql'])
forward(config.urls.notification, '/notifications')

const frontend = path.resolve(new URL('../frontend', import.meta.url).pathname)
app.use(express.static(frontend, { maxAge: config.prod ? '1h' : 0 }))
app.get('*', (req, res) => res.sendFile(path.join(frontend, 'index.html')))

app.listen(config.ports.gateway, () => {
  console.log(`gateway dan front end berjalan di http://localhost:${config.ports.gateway}`)
})
