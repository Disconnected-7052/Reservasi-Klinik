import { createClinicApp } from './app.js'
import { createClinic } from './logic.js'
import { createStore } from '../../shared/store.js'
import { createCipher } from '../../shared/crypto.js'
import { createPublisher } from '../../shared/queue.js'
import { config } from '../../shared/config.js'

const store = createStore('clinic', { appointments: [] }, config.dataDir)
const clinic = createClinic({ store, cipher: createCipher(config.dataKey), publisher: createPublisher() })
const app = createClinicApp(clinic)

const server = app.listen(config.ports.clinic, () => {
  console.log(`clinic-service berjalan di port ${config.ports.clinic}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    store.flush()
    server.close(() => process.exit(0))
  })
}
