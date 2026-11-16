import { createClinicApp } from './app.js'
import { createClinic } from './logic.js'
import { createPostgresStore, closeDatabase } from '../../shared/postgres-store.js'
import { createCipher } from '../../shared/crypto.js'
import { createPublisher } from '../../shared/queue.js'
import { createResolver, startRegistrar } from '../../shared/discovery.js'
import { config } from '../../shared/config.js'

async function main() {

  const store = await createPostgresStore('clinic', { appointments: [] })
  const publisher = createPublisher({ resolver: createResolver() })
  const clinic = createClinic({ store, cipher: createCipher(config.dataKey), publisher })
  const app = createClinicApp(clinic)

  const server = app.listen(config.ports.clinic, () => {
    console.log(`clinic-service berjalan di port ${config.ports.clinic}`)
  })

  const registrar = startRegistrar({ name: 'clinic', port: config.ports.clinic })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await registrar.stop()
      await store.flush()
      await publisher.close()
      server.close(async () => { await closeDatabase(); process.exit(0) })
      setTimeout(() => process.exit(0), 8000).unref()
    })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
