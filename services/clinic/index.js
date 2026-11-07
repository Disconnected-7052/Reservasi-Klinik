import { createClinicApp } from './app.js'
import { createClinic } from './logic.js'
import { createStore } from '../../shared/store.js'
import { createCipher } from '../../shared/crypto.js'
import { createPublisher } from '../../shared/queue.js'
import { createResolver, startRegistrar } from '../../shared/discovery.js'
import { config } from '../../shared/config.js'

const store = createStore('clinic', { appointments: [] }, config.dataDir)
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
    store.flush()
    await publisher.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 8000).unref()
  })
}
