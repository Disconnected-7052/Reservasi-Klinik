import { config } from './config.js'
import { sign } from './crypto.js'

export function createPublisher(options = {}) {
  const amqpUrl = options.amqpUrl ?? config.amqpUrl
  const queueName = options.queueName ?? config.queueName
  const notifyUrl = options.notifyUrl ?? config.urls.notification
  const secret = options.secret ?? config.eventSecret
  let channelPromise = null

  async function channel() {
    if (!channelPromise) {
      channelPromise = (async () => {
        const amqp = await import('amqplib')
        const conn = await amqp.connect(amqpUrl)
        conn.on('close', () => { channelPromise = null })
        conn.on('error', () => { channelPromise = null })
        const ch = await conn.createChannel()
        await ch.assertQueue(queueName, { durable: true })
        return ch
      })().catch(err => {
        channelPromise = null
        throw err
      })
    }
    return channelPromise
  }

  async function viaAmqp(event) {
    const ch = await channel()
    ch.sendToQueue(queueName, Buffer.from(JSON.stringify(event)), { persistent: true, contentType: 'application/json' })
  }

  async function viaHttp(event) {
    const body = JSON.stringify(event)
    const res = await fetch(`${notifyUrl}/internal/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': sign(secret, body) },
      body
    })
    if (!res.ok) throw new Error(`notification-service membalas ${res.status}`)
  }

  async function publish(type, payload) {
    const event = { type, payload, occurredAt: new Date().toISOString() }
    const send = amqpUrl ? viaAmqp : viaHttp
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await send(event)
        return true
      } catch (err) {
        if (attempt === 4) {
          console.error(`[queue] gagal mengirim ${type}: ${err.message}`)
          return false
        }
        await new Promise(r => setTimeout(r, 400 * attempt))
      }
    }
  }

  return { publish }
}

export async function startConsumer(handler, options = {}) {
  const amqpUrl = options.amqpUrl ?? config.amqpUrl
  const queueName = options.queueName ?? config.queueName
  if (!amqpUrl) return null
  const amqp = await import('amqplib')
  const conn = await amqp.connect(amqpUrl)
  const ch = await conn.createChannel()
  await ch.assertQueue(queueName, { durable: true })
  await ch.prefetch(10)
  await ch.consume(queueName, async msg => {
    if (!msg) return
    try {
      await handler(JSON.parse(msg.content.toString()))
      ch.ack(msg)
    } catch (err) {
      console.error(`[queue] gagal memproses pesan: ${err.message}`)
      ch.nack(msg, false, false)
    }
  })
  return conn
}
