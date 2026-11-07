import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertTopology, deadLetterName, createPublisher, startConsumer } from '../shared/queue.js'

test('queue: topologi mendeklarasikan antrean utama dengan dead letter queue', async () => {
  const calls = []
  const ch = { assertQueue: async (name, options) => { calls.push({ name, options }) } }
  await assertTopology(ch, 'klinik.events')
  assert.equal(deadLetterName('klinik.events'), 'klinik.events.dead')
  assert.equal(calls[0].name, 'klinik.events.dead')
  assert.equal(calls[1].name, 'klinik.events')
  assert.equal(calls[1].options.durable, true)
  assert.equal(calls[1].options.arguments['x-dead-letter-routing-key'], 'klinik.events.dead')
})

test('queue: consumer tidak aktif tanpa AMQP_URL dan publisher gagal dengan tenang', async () => {
  assert.equal(await startConsumer(() => {}, { amqpUrl: '' }), null)
  const publisher = createPublisher({ amqpUrl: '', notifyUrl: 'http://127.0.0.1:1' })
  const originalError = console.error
  console.error = () => {}
  const started = Date.now()
  const ok = await publisher.publish('appointment.booked', { appointmentId: 'x' })
  console.error = originalError
  assert.equal(ok, false)
  assert.ok(Date.now() - started >= 2000)
  await publisher.close()
})
