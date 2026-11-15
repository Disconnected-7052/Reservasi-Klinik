import { createGatewayApp } from './app.js'
import { createResolver } from '../shared/discovery.js'
import { config } from '../shared/config.js'

const resolver = createResolver()
const app = createGatewayApp({ resolver })

const server = app.listen(config.ports.gateway, () => {
  const mode = resolver.enabled ? `service discovery ${config.registry.url}` : 'rute statis'
  console.log(`gateway dan front end berjalan di http://localhost:${config.ports.gateway} (${mode})`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 8000).unref()
  })
}
