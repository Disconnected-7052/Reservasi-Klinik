import express from 'express'
import { baseApp, finish, HttpError } from '../../shared/http.js'
import { requireAuth } from '../../shared/auth.js'
import { sign, safeEqual } from '../../shared/crypto.js'
import { config } from '../../shared/config.js'

export function createNotificationApp(notifier, { secret = config.eventSecret } = {}) {
  const app = baseApp('notification-service')

  app.post('/internal/events', express.raw({ type: '*/*', limit: '20kb' }), (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
    const signature = req.get('x-signature') || ''
    if (!raw || !safeEqual(sign(secret, raw), signature)) {
      throw new HttpError(401, 'invalid_signature', 'Tanda tangan event tidak valid')
    }
    let event
    try {
      event = JSON.parse(raw)
    } catch {
      throw new HttpError(400, 'bad_request', 'Event bukan JSON valid')
    }
    if (!event?.type || !event?.payload?.appointmentId) throw new HttpError(400, 'bad_request', 'Event tidak lengkap')
    const processed = notifier.handle(event)
    res.status(202).json({ accepted: true, processed })
  })

  app.get('/notifications', requireAuth('notifications:read'), (req, res) => {
    notifier.deliverDue()
    const items = notifier.listFor(req.user.id)
    res.json({ unread: items.filter(n => !n.read).length, items })
  })

  app.patch('/notifications/:id/read', requireAuth('notifications:read'), (req, res) => {
    const item = notifier.markRead(req.user.id, req.params.id)
    if (!item) throw new HttpError(404, 'not_found', 'Notifikasi tidak ditemukan')
    res.json(item)
  })

  return finish(app)
}
