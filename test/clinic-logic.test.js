import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validateBooking, DOCTORS } from '../services/clinic/logic.js'
import { makeClinic, booking, patient, patient2, doctor, otherDoctor, admin, NOW } from './helpers.js'

const code = fn => { try { fn() } catch (e) { return e.code } return null }

describe('validasi reservasi (BVA tanggal dan jam)', () => {
  test('menerima jadwal besok pada jam praktik', () => {
    assert.equal(validateBooking(booking(), NOW).id, 'dr-sari')
  })

  test('menolak tanggal yang sudah lewat', () => {
    assert.equal(code(() => validateBooking(booking({ date: '2026-10-30' }), NOW)), 'date_out_of_range')
  })

  test('menolak jam yang sudah lewat hari ini', () => {
    assert.equal(code(() => validateBooking(booking({ date: '2026-11-02', slot: '08:00' }), NOW)), 'slot_passed')
  })

  test('menerima jam yang belum lewat hari ini', () => {
    assert.doesNotThrow(() => validateBooking(booking({ date: '2026-11-02', slot: '13:00' }), NOW))
  })

  test('batas 30 hari: hari ke-30 diterima dan hari ke-31 ditolak', () => {
    assert.doesNotThrow(() => validateBooking(booking({ date: '2026-12-02' }), NOW))
    assert.equal(code(() => validateBooking(booking({ date: '2026-12-03' }), NOW)), 'date_out_of_range')
  })

  const invalid = [
    ['format tanggal salah', { date: '03-11-2026' }, 'validation_error'],
    ['tanggal tidak ada di kalender', { date: '2026-02-30' }, 'validation_error'],
    ['jam di luar praktik', { slot: '12:00' }, 'validation_error'],
    ['dokter tidak ada', { doctorId: 'dr-x' }, 'doctor_not_found'],
    ['dokter libur hari Minggu', { date: '2026-11-08' }, 'doctor_off'],
    ['keluhan lebih dari 500 karakter', { complaint: 'x'.repeat(501) }, 'validation_error']
  ]
  for (const [name, patch, expected] of invalid) {
    test(`menolak ${name}`, () => {
      assert.equal(code(() => validateBooking(booking(patch), NOW)), expected)
    })
  }

  test('tiap dokter memiliki hari praktik', () => {
    for (const d of DOCTORS) assert.ok(d.days.length > 0)
  })
})

describe('reservasi', () => {
  test('pasien berhasil memesan dan event dipublikasikan', () => {
    const { clinic, publisher } = makeClinic()
    const result = clinic.book(patient, booking())
    assert.equal(result.status, 'BOOKED')
    assert.equal(result.complaint, 'Demam tiga hari')
    assert.equal(publisher.events[0].type, 'appointment.booked')
    assert.equal('complaint' in publisher.events[0].payload, false)
  })

  test('slot yang sama tidak dapat dipesan dua kali', () => {
    const { clinic } = makeClinic()
    clinic.book(patient, booking())
    assert.equal(code(() => clinic.book(patient2, booking())), 'slot_taken')
  })

  test('pemesanan serentak: hanya satu yang berhasil', async () => {
    const { clinic } = makeClinic()
    const results = await Promise.allSettled([patient, patient2].map(async p => clinic.book(p, booking())))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  })

  test('pasien tidak boleh punya dua reservasi di jam yang sama', () => {
    const { clinic } = makeClinic()
    clinic.book(patient, booking())
    assert.equal(code(() => clinic.book(patient, booking({ doctorId: 'dr-maya' }))), 'patient_busy')
  })

  test('dokter tidak dapat membuat reservasi', () => {
    const { clinic } = makeClinic()
    assert.equal(code(() => clinic.book(doctor, booking())), 'forbidden')
  })

  test('keluhan tersimpan terenkripsi', () => {
    const { clinic, store } = makeClinic()
    clinic.book(patient, booking())
    assert.notEqual(store.data.appointments[0].complaint, 'Demam tiga hari')
    assert.ok(store.data.appointments[0].complaint.split('.').length === 3)
  })

  test('slot kembali tersedia setelah dibatalkan', () => {
    const { clinic } = makeClinic()
    const a = clinic.book(patient, booking())
    clinic.cancel(patient, a.id)
    const slot = clinic.availability('dr-sari', '2026-11-03').find(s => s.time === '09:00')
    assert.equal(slot.available, true)
  })

  test('availability menandai slot terpesan dan jam lewat', () => {
    const { clinic } = makeClinic()
    clinic.book(patient, booking({ date: '2026-11-02', slot: '13:00' }))
    const slots = clinic.availability('dr-sari', '2026-11-02')
    assert.equal(slots.find(s => s.time === '13:00').available, false)
    assert.equal(slots.find(s => s.time === '08:00').available, false)
    assert.equal(slots.find(s => s.time === '14:00').available, true)
  })

  test('pembatalan kurang dari 1 jam sebelum jadwal ditolak untuk pasien', () => {
    let now = NOW
    const { clinic } = makeClinic(() => now)
    const a = clinic.book(patient, booking({ date: '2026-11-02', slot: '13:00' }))
    now = new Date('2026-11-02T06:30:00Z')
    assert.equal(code(() => clinic.cancel(patient, a.id)), 'too_late')
  })

  test('pembatalan lebih dari 1 jam sebelum jadwal diterima', () => {
    let now = NOW
    const { clinic, publisher } = makeClinic(() => now)
    const a = clinic.book(patient, booking({ date: '2026-11-02', slot: '13:00' }))
    now = new Date('2026-11-02T05:00:00Z')
    assert.equal(clinic.cancel(patient, a.id).status, 'CANCELLED')
    assert.equal(publisher.events.at(-1).type, 'appointment.cancelled')
  })
})

describe('hak akses data', () => {
  test('pasien hanya melihat reservasi miliknya', () => {
    const { clinic } = makeClinic()
    const a = clinic.book(patient, booking())
    assert.equal(clinic.list(patient2).length, 0)
    assert.equal(code(() => clinic.get(a.id, patient2)), 'appointment_not_found')
  })

  test('dokter hanya melihat pasiennya sendiri', () => {
    const { clinic } = makeClinic()
    clinic.book(patient, booking())
    assert.equal(clinic.list(doctor).length, 1)
    assert.equal(clinic.list(otherDoctor).length, 0)
  })

  test('admin melihat semua tetapi tanpa data medis', () => {
    const { clinic } = makeClinic()
    clinic.book(patient, booking())
    const [row] = clinic.list(admin)
    assert.equal(row.complaint, null)
    assert.equal(row.note, null)
  })

  test('pasien lain tidak dapat membatalkan reservasi orang lain', () => {
    const { clinic } = makeClinic()
    const a = clinic.book(patient, booking())
    assert.equal(code(() => clinic.cancel(patient2, a.id)), 'appointment_not_found')
  })
})

describe('pemeriksaan selesai', () => {
  test('dokter menyelesaikan reservasi dengan catatan terenkripsi', () => {
    const { clinic, store } = makeClinic()
    const a = clinic.book(patient, booking())
    const done = clinic.complete(doctor, a.id, 'Diberi paracetamol, istirahat cukup')
    assert.equal(done.status, 'COMPLETED')
    assert.equal(clinic.get(a.id, patient).note, 'Diberi paracetamol, istirahat cukup')
    assert.ok(!store.data.appointments[0].note.includes('paracetamol'))
  })

  test('dokter lain tidak dapat menyelesaikan', () => {
    const { clinic } = makeClinic()
    const a = clinic.book(patient, booking())
    assert.equal(code(() => clinic.complete(otherDoctor, a.id, 'catatan')), 'appointment_not_found')
  })

  test('catatan terlalu pendek ditolak', () => {
    const { clinic } = makeClinic()
    const a = clinic.book(patient, booking())
    assert.equal(code(() => clinic.complete(doctor, a.id, 'ok')), 'validation_error')
  })

  test('reservasi yang sudah selesai tidak dapat dibatalkan', () => {
    const { clinic } = makeClinic()
    const a = clinic.book(patient, booking())
    clinic.complete(doctor, a.id, 'Sehat, kontrol rutin')
    assert.equal(code(() => clinic.cancel(patient, a.id)), 'invalid_state')
  })
})
