import { id } from '../../shared/crypto.js'

const DAY_MS = 86400000

function formatDate(date) {
  const [y, m, d] = date.split('-')
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}

export function createNotifier({ store, clock = () => new Date() }) {
  function add(userId, kind, title, message, appointmentId, deliverAt) {
    const item = {
      id: id('ntf'),
      userId,
      kind,
      title,
      message,
      appointmentId,
      deliverAt: deliverAt.toISOString(),
      delivered: deliverAt <= clock(),
      read: false,
      createdAt: clock().toISOString()
    }
    store.data.notifications.push(item)
    return item
  }

  function handle(event) {
    const { type, payload: p } = event
    const when = `${formatDate(p.date)} pukul ${p.slot} WIB`
    const seen = store.data.processed
    const key = `${type}:${p.appointmentId}`
    if (seen.includes(key)) return false
    seen.push(key)
    if (seen.length > 5000) seen.splice(0, seen.length - 5000)

    if (type === 'appointment.booked') {
      add(p.patientId, 'CONFIRMATION', 'Reservasi dikonfirmasi', `Jadwal Anda dengan ${p.doctorName} pada ${when} telah tercatat.`, p.appointmentId, clock())
      const remindAt = new Date(new Date(p.startsAt).getTime() - DAY_MS)
      if (remindAt > clock()) {
        add(p.patientId, 'REMINDER', 'Pengingat jadwal besok', `Besok Anda ada jadwal dengan ${p.doctorName} pada ${when}. Mohon hadir 15 menit lebih awal.`, p.appointmentId, remindAt)
      }
      add(p.doctorId, 'NEW_PATIENT', 'Pasien baru terjadwal', `${p.patientName} memesan jadwal pada ${when}.`, p.appointmentId, clock())
    } else if (type === 'appointment.cancelled') {
      for (const n of store.data.notifications) {
        if (n.appointmentId === p.appointmentId && n.kind === 'REMINDER' && !n.delivered) n.delivered = true
      }
      for (const n of store.data.notifications) {
        if (n.appointmentId === p.appointmentId && n.kind === 'REMINDER') n.cancelled = true
      }
      add(p.patientId, 'CANCELLATION', 'Reservasi dibatalkan', `Jadwal dengan ${p.doctorName} pada ${when} telah dibatalkan.`, p.appointmentId, clock())
      add(p.doctorId, 'CANCELLATION', 'Jadwal dibatalkan', `Jadwal ${p.patientName} pada ${when} dibatalkan.`, p.appointmentId, clock())
    } else if (type === 'appointment.completed') {
      add(p.patientId, 'COMPLETED', 'Pemeriksaan selesai', `Pemeriksaan dengan ${p.doctorName} telah selesai. Catatan medis dapat dilihat di riwayat reservasi.`, p.appointmentId, clock())
    } else {
      seen.pop()
      return false
    }
    store.save()
    return true
  }

  function deliverDue() {
    const now = clock()
    let count = 0
    for (const n of store.data.notifications) {
      if (!n.delivered && !n.cancelled && new Date(n.deliverAt) <= now) {
        n.delivered = true
        count += 1
      }
    }
    if (count) store.save()
    return count
  }

  function listFor(userId) {
    return store.data.notifications
      .filter(n => n.userId === userId && n.delivered && !n.cancelled)
      .sort((a, b) => b.deliverAt.localeCompare(a.deliverAt))
  }

  function markRead(userId, notificationId) {
    const n = store.data.notifications.find(x => x.id === notificationId && x.userId === userId)
    if (!n) return null
    n.read = true
    store.save()
    return n
  }

  return { handle, deliverDue, listFor, markRead }
}
