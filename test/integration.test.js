import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createAuthApp } from '../services/auth/app.js'
import { createClinicApp } from '../services/clinic/app.js'
import { createClinic } from '../services/clinic/logic.js'
import { createNotificationApp } from '../services/notification/app.js'
import { createNotifier } from '../services/notification/logic.js'
import { createStore } from '../shared/store.js'
import { createCipher } from '../shared/crypto.js'
import { createPublisher } from '../shared/queue.js'
import { config } from '../shared/config.js'
import { listen, call, NOW } from './helpers.js'

let auth, clinicServer, notifyServer, tokens

async function login(email) {
  const res = await call(`${auth.url}/oauth/token`, { method: 'POST', body: { grant_type: 'password', client_id: 'web', username: email, password: config.seedPassword } })
  return res.body.access_token
}

async function gql(token, query, variables) {
  return call(`${clinicServer.url}/graphql`, { method: 'POST', token, body: { query, variables } })
}

async function eventually(fn, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const value = await fn()
    if (value) return value
    await new Promise(r => setTimeout(r, 50))
  }
  return null
}

before(async () => {
  auth = await listen(createAuthApp({ store: createStore('auth', { users: [], refresh: [] }), tokenLimit: 1000 }))
  const notifier = createNotifier({ store: createStore('n', { notifications: [], processed: [] }), clock: () => NOW })
  notifyServer = await listen(createNotificationApp(notifier))
  const publisher = createPublisher({ amqpUrl: '', notifyUrl: notifyServer.url })
  const clinic = createClinic({ store: createStore('c', { appointments: [] }), cipher: createCipher(config.dataKey), publisher, clock: () => NOW })
  clinicServer = await listen(createClinicApp(clinic))
  tokens = {
    patient: await login('pasien@klinik.id'),
    doctor: await login('sari@klinik.id'),
    admin: await login('admin@klinik.id')
  }
})

after(async () => {
  await auth.close()
  await clinicServer.close()
  await notifyServer.close()
})

test('REST: endpoint dilindungi tanpa token', async () => {
  assert.equal((await call(`${clinicServer.url}/api/doctors`)).status, 401)
  assert.equal((await call(`${clinicServer.url}/api/doctors`, { token: 'palsu' })).status, 401)
})

test('REST: daftar dokter dan slot', async () => {
  const docs = await call(`${clinicServer.url}/api/doctors`, { token: tokens.patient })
  assert.equal(docs.body.length, 3)
  const slots = await call(`${clinicServer.url}/api/doctors/dr-sari/slots?date=2026-11-04`, { token: tokens.patient })
  assert.equal(slots.body.slots.length, 8)
  const bad = await call(`${clinicServer.url}/api/doctors/dr-sari/slots?date=besok`, { token: tokens.patient })
  assert.equal(bad.status, 400)
})

test('REST: dokter tidak boleh memesan (scope)', async () => {
  const res = await call(`${clinicServer.url}/api/appointments`, { method: 'POST', token: tokens.doctor, body: { doctorId: 'dr-sari', date: '2026-11-04', slot: '09:00' } })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, 'insufficient_scope')
})

test('alur lengkap: pesan lewat REST, notifikasi async, selesai oleh dokter', async () => {
  const booked = await call(`${clinicServer.url}/api/appointments`, { method: 'POST', token: tokens.patient, body: { doctorId: 'dr-sari', date: '2026-11-04', slot: '10:00', complaint: 'Batuk berdahak' } })
  assert.equal(booked.status, 201)
  const id = booked.body.id

  const inbox = await eventually(async () => {
    const r = await call(`${notifyServer.url}/notifications`, { token: tokens.patient })
    return r.body.items?.some(n => n.kind === 'CONFIRMATION') ? r.body : null
  })
  assert.ok(inbox, 'notifikasi konfirmasi harus tiba lewat jalur asinkron')

  const doctorInbox = await call(`${notifyServer.url}/notifications`, { token: tokens.doctor })
  assert.ok(doctorInbox.body.items.some(n => n.kind === 'NEW_PATIENT'))

  const adminView = await call(`${clinicServer.url}/api/appointments/${id}`, { token: tokens.admin })
  assert.equal(adminView.body.complaint, null)

  const done = await call(`${clinicServer.url}/api/appointments/${id}/complete`, { method: 'PATCH', token: tokens.doctor, body: { note: 'Resep ambroxol 3x sehari' } })
  assert.equal(done.body.status, 'COMPLETED')
  const patientView = await call(`${clinicServer.url}/api/appointments/${id}`, { token: tokens.patient })
  assert.equal(patientView.body.note, 'Resep ambroxol 3x sehari')
})

test('slot yang sama ditolak dengan 409', async () => {
  const body = { doctorId: 'dr-sari', date: '2026-11-05', slot: '11:00' }
  const a = await call(`${clinicServer.url}/api/appointments`, { method: 'POST', token: tokens.patient, body })
  const b = await call(`${clinicServer.url}/api/appointments`, { method: 'POST', token: tokens.patient, body })
  assert.equal(a.status, 201)
  assert.equal(b.status, 409)
})

test('REST: validasi mengembalikan 400 untuk JSON rusak', async () => {
  const res = await fetch(`${clinicServer.url}/api/appointments`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.patient}` }, body: '{rusak' })
  assert.equal(res.status, 400)
})

test('GraphQL: query tanpa token ditolak', async () => {
  const res = await gql(undefined, '{ doctors { id } }')
  assert.equal(res.body.errors[0].extensions.code, 'UNAUTHENTICATED')
})

test('GraphQL: dokter, ketersediaan, pemesanan, dan pembatalan', async () => {
  const docs = await gql(tokens.patient, '{ doctors { id name specialty } }')
  assert.equal(docs.body.data.doctors.length, 3)

  const book = await gql(tokens.patient, 'mutation($i: BookingInput!){ bookAppointment(input:$i){ id status doctorName slot } }', { i: { doctorId: 'dr-maya', date: '2026-11-03', slot: '14:00', complaint: 'Gigi berlubang' } })
  assert.equal(book.body.data.bookAppointment.status, 'BOOKED')

  const avail = await gql(tokens.patient, '{ availability(doctorId:"dr-maya", date:"2026-11-03"){ time available } }')
  assert.equal(avail.body.data.availability.find(s => s.time === '14:00').available, false)

  const clash = await gql(tokens.patient, 'mutation($i: BookingInput!){ bookAppointment(input:$i){ id } }', { i: { doctorId: 'dr-maya', date: '2026-11-03', slot: '14:00' } })
  assert.equal(clash.body.errors[0].extensions.code, 'SLOT_TAKEN')

  const cancel = await gql(tokens.patient, 'mutation($id: ID!){ cancelAppointment(id:$id){ status } }', { id: book.body.data.bookAppointment.id })
  assert.equal(cancel.body.data.cancelAppointment.status, 'CANCELLED')
})

test('GraphQL: dokter tidak dapat menjalankan bookAppointment', async () => {
  const res = await gql(tokens.doctor, 'mutation{ bookAppointment(input:{doctorId:"dr-sari",date:"2026-11-04",slot:"13:00"}){ id } }')
  assert.equal(res.body.errors[0].extensions.code, 'FORBIDDEN')
})

test('GraphQL: query tidak valid menghasilkan galat validasi', async () => {
  const res = await gql(tokens.patient, '{ doctors { tidakAda } }')
  assert.ok(res.status === 400 || res.body.errors)
})

test('GraphQL: pasien tidak dapat membaca reservasi pasien lain', async () => {
  const reg = await call(`${auth.url}/register`, { method: 'POST', body: { name: 'Pasien Dua', email: 'dua@klinik.id', password: 'rahasia123' } })
  assert.equal(reg.status, 201)
  const login2 = await call(`${auth.url}/oauth/token`, { method: 'POST', body: { grant_type: 'password', client_id: 'web', username: 'dua@klinik.id', password: 'rahasia123' } })
  const mine = await gql(tokens.patient, '{ appointments { id } }')
  const theirs = await gql(login2.body.access_token, `{ appointment(id:"${mine.body.data.appointments[0].id}") { id } }`)
  assert.equal(theirs.body.errors[0].extensions.code, 'APPOINTMENT_NOT_FOUND')
})

test('token kedaluwarsa atau salah audience ditolak', async () => {
  const { default: jwt } = await import('jsonwebtoken')
  const expired = jwt.sign({ role: 'patient', scope: 'doctors:read' }, config.jwt.secret, { subject: 'x', issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn: -10 })
  const wrongAud = jwt.sign({ role: 'patient', scope: 'doctors:read' }, config.jwt.secret, { subject: 'x', issuer: config.jwt.issuer, audience: 'lain' })
  const none = jwt.sign({ role: 'admin', scope: 'doctors:read' }, 'kunci-lain-yang-salah-0123456789', { subject: 'x', issuer: config.jwt.issuer, audience: config.jwt.audience })
  for (const t of [expired, wrongAud, none]) {
    assert.equal((await call(`${clinicServer.url}/api/doctors`, { token: t })).status, 401)
  }
})
