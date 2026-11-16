import { createNotificationApp } from './app.js'
import { createNotifier } from './logic.js'
import { createPostgresStore, closeDatabase } from '../../shared/postgres-store.js'
import { startConsumer } from '../../shared/queue.js'
import { startRegistrar } from '../../shared/discovery.js'
import { config } from '../../shared/config.js'

async function main() {

  const store = await createPostgresStore('notification', { notifications: [], processed: [] })
  const notifier = createNotifier({ store })
  const app = createNotificationApp(notifier)

  const server = app.listen(config.ports.notification, () => {
    console.log(`notification-service berjalan di port ${config.ports.notification}`)
  })

  const timer = setInterval(() => notifier.deliverDue(), 30_000)
  const registrar = startRegistrar({ name: 'notification', port: config.ports.notification })
  let consumer = null

  async function connectQueue() {
    try {
      consumer = await startConsumer(event => notifier.handle(event), { onClose: () => setTimeout(connectQueue, 5000) })
      if (consumer) console.log(`notification-service mengonsumsi antrean ${config.queueName}`)
    } catch (err) {
      console.error(`[queue] koneksi RabbitMQ gagal: ${err.message}, mencoba lagi dalam 5 detik`)
      setTimeout(connectQueue, 5000)
    }
  }
  connectQueue()

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      clearInterval(timer)
      await registrar.stop()
      if (consumer) await consumer.close().catch(() => {})
      await store.flush()
      server.close(async () => { await closeDatabase(); process.exit(0) })
      setTimeout(() => process.exit(0), 8000).unref()
    })
  }
}

main().catch(err => { console.error(err); process.exit(1) })
