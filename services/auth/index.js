import { createAuthApp } from './app.js'
import { createPostgresStore, closeDatabase } from '../../shared/postgres-store.js'
import { startRegistrar } from '../../shared/discovery.js'
import { config } from '../../shared/config.js'

async function main() {

  const store = await createPostgresStore('auth', { users: [], refresh: [] })
  const app = createAuthApp({ store })

  const server = app.listen(config.ports.auth, () => {
    console.log(`auth-service berjalan di port ${config.ports.auth}`)
  })

  const registrar = startRegistrar({ name: 'auth', port: config.ports.auth })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await registrar.stop()
      await store.flush()
      server.close(async () => { await closeDatabase(); process.exit(0) })
      setTimeout(() => process.exit(0), 8000).unref()
    })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
