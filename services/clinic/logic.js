import { id } from '../../shared/crypto.js'
import { HttpError } from '../../shared/http.js'

export const SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']
export const MAX_DAYS_AHEAD = 30

export const DOCTORS = [
  { id: 'dr-sari', name: 'dr. Sari Wulandari, Sp.PD', specialty: 'Penyakit Dalam', days: [1, 2, 3, 4, 5], room: 'Ruang 1' },
  { id: 'dr-budi', name: 'dr. Budi Hartono, Sp.A', specialty: 'Anak', days: [1, 3, 5, 6], room: 'Ruang 2' },
  { id: 'dr-maya', name: 'drg. Maya Puspita', specialty: 'Gigi dan Mulut', days: [2, 4, 6], room: 'Ruang 3' }
]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) throw new HttpError(400, 'validation_error', 'Tanggal harus berformat YYYY-MM-DD')
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpError(400, 'validation_error', 'Tanggal tidak valid')
  return date
}

export function startOfDay(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function slotStart(date, slot) {
  return new Date(`${date}T${slot}:00+07:00`)
}

export function validateBooking({ doctorId, date, slot, complaint }, now = new Date()) {
  const doctor = DOCTORS.find(d => d.id === doctorId)
  if (!doctor) throw new HttpError(404, 'doctor_not_found', 'Dokter tidak ditemukan')
  const day = parseDate(date)
  if (!SLOTS.includes(slot)) throw new HttpError(400, 'validation_error', 'Jam praktik tidak valid')
  if (!doctor.days.includes(day.getUTCDay())) throw new HttpError(422, 'doctor_off', 'Dokter tidak praktik pada hari tersebut')
  const wibNow = new Date(now.getTime() + 7 * 3600 * 1000)
  const today = startOfDay(wibNow)
  const limit = new Date(today.getTime() + MAX_DAYS_AHEAD * 86400000)
  if (day < today || day > limit) throw new HttpError(422, 'date_out_of_range', `Reservasi hanya untuk hari ini sampai ${MAX_DAYS_AHEAD} hari ke depan`)
  if (slotStart(date, slot) <= now) throw new HttpError(422, 'slot_passed', 'Jam praktik sudah lewat')
  if (complaint !== undefined && complaint !== null && (typeof complaint !== 'string' || complaint.length > 500)) {
    throw new HttpError(400, 'validation_error', 'Keluhan maksimal 500 karakter')
  }
  return doctor
}

export function createClinic({ store, cipher, publisher, clock = () => new Date() }) {
  function takenSlots(doctorId, date) {
    return new Set(store.data.appointments.filter(a => a.doctorId === doctorId && a.date === date && a.status === 'BOOKED').map(a => a.slot))
  }

  function availability(doctorId, date) {
    const doctor = DOCTORS.find(d => d.id === doctorId)
    if (!doctor) throw new HttpError(404, 'doctor_not_found', 'Dokter tidak ditemukan')
    const day = parseDate(date)
    const taken = takenSlots(doctorId, date)
    const now = clock()
    const works = doctor.days.includes(day.getUTCDay())
    return SLOTS.map(slot => ({
      time: slot,
      available: works && !taken.has(slot) && slotStart(date, slot) > now
    }))
  }

  function view(appointment, viewer) {
    const doctor = DOCTORS.find(d => d.id === appointment.doctorId)
    const sensitive = viewer.role === 'patient' || viewer.role === 'doctor'
    return {
      id: appointment.id,
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      doctorId: appointment.doctorId,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      room: doctor.room,
      date: appointment.date,
      slot: appointment.slot,
      status: appointment.status,
      complaint: sensitive ? cipher.decrypt(appointment.complaint) : null,
      note: viewer.role === 'patient' || viewer.role === 'doctor' ? cipher.decrypt(appointment.note) : null,
      createdAt: appointment.createdAt
    }
  }

  function canSee(appointment, viewer) {
    if (viewer.role === 'admin') return true
    if (viewer.role === 'doctor') return appointment.doctorId === viewer.id
    return appointment.patientId === viewer.id
  }

  function list(viewer, { status } = {}) {
    return store.data.appointments
      .filter(a => canSee(a, viewer) && (!status || a.status === status))
      .sort((a, b) => `${a.date}${a.slot}`.localeCompare(`${b.date}${b.slot}`))
      .map(a => view(a, viewer))
  }

  function get(appointmentId, viewer) {
    const found = store.data.appointments.find(a => a.id === appointmentId)
    if (!found || !canSee(found, viewer)) throw new HttpError(404, 'appointment_not_found', 'Reservasi tidak ditemukan')
    return view(found, viewer)
  }

  function eventPayload(a) {
    const doctor = DOCTORS.find(d => d.id === a.doctorId)
    return {
      appointmentId: a.id,
      patientId: a.patientId,
      patientName: a.patientName,
      doctorId: a.doctorId,
      doctorName: doctor.name,
      date: a.date,
      slot: a.slot,
      startsAt: slotStart(a.date, a.slot).toISOString()
    }
  }

  function book(viewer, input) {
    if (viewer.role !== 'patient') throw new HttpError(403, 'forbidden', 'Hanya pasien yang dapat membuat reservasi')
    validateBooking(input, clock())
    const clash = store.data.appointments.some(a => a.doctorId === input.doctorId && a.date === input.date && a.slot === input.slot && a.status === 'BOOKED')
    if (clash) throw new HttpError(409, 'slot_taken', 'Jam tersebut baru saja dipesan, pilih jam lain')
    const duplicate = store.data.appointments.some(a => a.patientId === viewer.id && a.date === input.date && a.slot === input.slot && a.status === 'BOOKED')
    if (duplicate) throw new HttpError(409, 'patient_busy', 'Anda sudah punya reservasi di jam yang sama')
    const appointment = {
      id: id('rsv'),
      patientId: viewer.id,
      patientName: viewer.name,
      doctorId: input.doctorId,
      date: input.date,
      slot: input.slot,
      status: 'BOOKED',
      complaint: cipher.encrypt(input.complaint?.trim() || ''),
      note: '',
      createdAt: clock().toISOString()
    }
    store.data.appointments.push(appointment)
    store.save()
    publisher.publish('appointment.booked', eventPayload(appointment))
    return view(appointment, viewer)
  }

  function cancel(viewer, appointmentId) {
    const found = store.data.appointments.find(a => a.id === appointmentId)
    if (!found || !canSee(found, viewer)) throw new HttpError(404, 'appointment_not_found', 'Reservasi tidak ditemukan')
    if (viewer.role === 'doctor') throw new HttpError(403, 'forbidden', 'Dokter tidak dapat membatalkan reservasi')
    if (found.status !== 'BOOKED') throw new HttpError(409, 'invalid_state', 'Hanya reservasi aktif yang dapat dibatalkan')
    if (viewer.role === 'patient' && slotStart(found.date, found.slot).getTime() - clock().getTime() < 3600 * 1000) {
      throw new HttpError(422, 'too_late', 'Pembatalan minimal 1 jam sebelum jadwal')
    }
    found.status = 'CANCELLED'
    store.save()
    publisher.publish('appointment.cancelled', eventPayload(found))
    return view(found, viewer)
  }

  function complete(viewer, appointmentId, note) {
    const found = store.data.appointments.find(a => a.id === appointmentId)
    if (viewer.role !== 'doctor') throw new HttpError(403, 'forbidden', 'Hanya dokter yang dapat menyelesaikan pemeriksaan')
    if (!found || found.doctorId !== viewer.id) throw new HttpError(404, 'appointment_not_found', 'Reservasi tidak ditemukan')
    if (found.status !== 'BOOKED') throw new HttpError(409, 'invalid_state', 'Hanya reservasi aktif yang dapat diselesaikan')
    if (typeof note !== 'string' || note.trim().length < 3 || note.length > 1000) throw new HttpError(400, 'validation_error', 'Catatan medis 3 sampai 1000 karakter')
    found.status = 'COMPLETED'
    found.note = cipher.encrypt(note.trim())
    store.save()
    publisher.publish('appointment.completed', eventPayload(found))
    return view(found, viewer)
  }

  return store.wrap({ availability, list, get, book, cancel, complete })
}
