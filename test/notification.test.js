import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../shared/store.js'
import { createNotifier } from '../services/notification/logic.js'
import { createNotificationApp } from '../services/notification/app.js'
import { sign } from '../shared/crypto.js'
import { config } from '../shared/config.js'
import { listen, call } from './helpers.js'

const payload = (over = {}) => ({
  appointmentId: 'rsv_1',
  patientId: 'pasien-1',
  patientName: 'Rina',
  doctorId: 'dr-sari',
  doctorName: 'dr. Sari',
  date: '2026-11-10',
  slot: '09:00',
  startsAt: '2026-11-10T02:00:00.000Z',
  ...over
})

function setup(now = new Date('2026-11-02T03:00:00Z')) {
  const store = createStore('n', { notifications: [], processed: [] })
  const clock = { now }
  const notifier = createNotifier({ store, clock: () => clock.now })
  return { store, notifier, clock }
}

test('booked membuat konfirmasi, pengingat terjadwal, dan notifikasi dokter', () => {
  const { store, notifier } = setup()
  assert.equal(notifier.handle({ type: 'appointment.booked', payload: payload() }), true)
  const kinds = store.data.notifications.map(n => n.kind).sort()
  assert.deepEqual(kinds, ['CONFIRMATION', 'NEW_PATIENT', 'REMINDER'])
})

test('pengingat belum tampil sebelum waktunya dan tampil setelahnya', () => {
  const { notifier, clock } = setup()
  notifier.handle({ type: 'appointment.booked', payload: payload() })
  assert.equal(notifier.listFor('pasien-1').length, 1)
  clock.now = new Date('2026-11-09T03:00:00Z')
  assert.equal(notifier.deliverDue(), 1)
  assert.equal(notifier.listFor('pasien-1').length, 2)
})

test('event yang sama diproses sekali saja', () => {
  const { store, notifier } = setup()
  const event = { type: 'appointment.booked', payload: payload() }
  notifier.handle(event)
  assert.equal(notifier.handle(event), false)
  assert.equal(store.data.notifications.length, 3)
})

test('pembatalan menghapus pengingat yang belum terkirim', () => {
  const { notifier, clock } = setup()
  notifier.handle({ type: 'appointment.booked', payload: payload() })
  notifier.handle({ type: 'appointment.cancelled', payload: payload() })
  clock.now = new Date('2026-11-09T03:00:00Z')
  notifier.deliverDue()
  const kinds = notifier.listFor('pasien-1').map(n => n.kind)
  assert.ok(!kinds.includes('REMINDER'))
  assert.ok(kinds.includes('CANCELLATION'))
})

test('jadwal kurang dari 24 jam tidak membuat pengingat', () => {
  const { store, notifier } = setup(new Date('2026-11-09T20:00:00Z'))
  notifier.handle({ type: 'appointment.booked', payload: payload() })
  assert.equal(store.data.notifications.some(n => n.kind === 'REMINDER'), false)
})

test('tipe event tidak dikenal diabaikan', () => {
  const { notifier } = setup()
  assert.equal(notifier.handle({ type: 'x.y', payload: payload() }), false)
})

test('endpoint event menolak tanda tangan salah dan menerima yang benar', async () => {
  const { notifier } = setup()
  const server = await listen(createNotificationApp(notifier))
  const body = JSON.stringify({ type: 'appointment.booked', payload: payload() })
  const bad = await fetch(`${server.url}/internal/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': 'salah' }, body })
  assert.equal(bad.status, 401)
  const none = await fetch(`${server.url}/internal/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  assert.equal(none.status, 401)
  const good = await fetch(`${server.url}/internal/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sign(config.eventSecret, body) }, body })
  assert.equal(good.status, 202)
  const open = await call(`${server.url}/notifications`)
  assert.equal(open.status, 401)
  await server.close()
})
