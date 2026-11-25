import { config } from './config.js'
import { signEvent } from './crypto.js'

export function deadLetterName(queueName) {
  return `${queueName}.dead`
}

export async function assertTopology(ch, queueName) {
  const dead = deadLetterName(queueName)
  await ch.assertQueue(dead, { durable: true })
  await ch.assertQueue(queueName, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': dead }
  })
}

export function createPublisher(options = {}) {
  const amqpUrl = options.amqpUrl ?? config.amqpUrl
  const queueName = options.queueName ?? config.queueName
  const notifyUrl = options.notifyUrl ?? config.urls.notification
  const secret = options.secret ?? config.eventSecret
  const resolver = options.resolver ?? null
  let channelPromise = null
  let connection = null

  async function channel() {
    if (!channelPromise) {
      channelPromise = (async () => {
        const amqp = await import('amqplib')
        const conn = await amqp.connect(amqpUrl)
        connection = conn
        conn.on('close', () => { channelPromise = null })
        conn.on('error', () => { channelPromise = null })
        const ch = await conn.createConfirmChannel()
        await assertTopology(ch, queueName)
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
    await new Promise((resolve, reject) => {
      ch.sendToQueue(queueName, Buffer.from(JSON.stringify(event)), { persistent: true, contentType: 'application/json' }, err => err ? reject(err) : resolve())
    })
  }

  async function viaHttp(event) {
    const body = JSON.stringify(event)
    const { timestamp, signature } = signEvent(secret, body)
    const target = resolver ? await resolver.pick('notification') : notifyUrl
    const res = await fetch(`${target}/internal/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-timestamp': timestamp, 'x-signature': signature },
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

  async function close() {
    if (connection) await connection.close().catch(() => {})
  }

  return { publish, close }
}

export async function startConsumer(handler, options = {}) {
  const amqpUrl = options.amqpUrl ?? config.amqpUrl
  const queueName = options.queueName ?? config.queueName
  if (!amqpUrl) return null
  const amqp = await import('amqplib')
  const conn = await amqp.connect(amqpUrl)
  conn.on('error', () => {})
  conn.on('close', () => options.onClose?.())
  const ch = await conn.createChannel()
  await assertTopology(ch, queueName)
  await ch.prefetch(10)
  await ch.consume(queueName, async msg => {
    if (!msg) return
    try {
      await handler(JSON.parse(msg.content.toString()))
      ch.ack(msg)
    } catch (err) {
      console.error(`[queue] pesan dipindahkan ke ${deadLetterName(queueName)}: ${err.message}`)
      ch.nack(msg, false, false)
    }
  })
  return conn
}
