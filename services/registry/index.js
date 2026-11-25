import { createRegistry, createRegistryApp } from './app.js'
import { config } from '../../shared/config.js'

const registry = createRegistry()
const app = createRegistryApp(registry)

const server = app.listen(config.ports.registry, () => {
  console.log(`registry-service berjalan di port ${config.ports.registry}`)
})

const sweeper = setInterval(() => registry.sweep(), 5000)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(sweeper)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
