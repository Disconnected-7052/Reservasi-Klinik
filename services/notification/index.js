import { createNotificationApp } from './app.js'
import { createNotifier } from './logic.js'
import { createStore } from '../../shared/store.js'
import { startConsumer } from '../../shared/queue.js'
import { config } from '../../shared/config.js'

const store = createStore('notification', { notifications: [], processed: [] }, config.dataDir)
const notifier = createNotifier({ store })
const app = createNotificationApp(notifier)

const server = app.listen(config.ports.notification, () => {
  console.log(`notification-service berjalan di port ${config.ports.notification}`)
})

const timer = setInterval(() => notifier.deliverDue(), 30_000)

async function connectQueue() {
  try {
    const conn = await startConsumer(event => notifier.handle(event))
    if (conn) console.log(`notification-service mengonsumsi antrean ${config.queueName}`)
  } catch (err) {
    console.error(`[queue] koneksi RabbitMQ gagal: ${err.message}, mencoba lagi dalam 5 detik`)
    setTimeout(connectQueue, 5000)
  }
}
connectQueue()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer)
    store.flush()
    server.close(() => process.exit(0))
  })
}
