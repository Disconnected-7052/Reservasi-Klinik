import { createAuthApp } from './app.js'
import { createStore } from '../../shared/store.js'
import { startRegistrar } from '../../shared/discovery.js'
import { config } from '../../shared/config.js'

const store = createStore('auth', { users: [], refresh: [] }, config.dataDir)
const app = createAuthApp({ store })

const server = app.listen(config.ports.auth, () => {
  console.log(`auth-service berjalan di port ${config.ports.auth}`)
})

const registrar = startRegistrar({ name: 'auth', port: config.ports.auth })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await registrar.stop()
    store.flush()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 8000).unref()
  })
}
