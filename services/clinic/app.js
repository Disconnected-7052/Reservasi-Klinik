import express from 'express'
import { baseApp, finish, HttpError } from '../../shared/http.js'
import { requireAuth } from '../../shared/auth.js'
import { DOCTORS, SLOTS } from './logic.js'
import { createGraphqlHandler } from './graphql.js'

export function createClinicApp(clinic) {
  const app = baseApp('clinic-service')
  app.use(express.json({ limit: '20kb' }))

  app.get('/api/doctors', requireAuth('doctors:read'), (req, res) => {
    const { specialty } = req.query
    res.json(specialty ? DOCTORS.filter(d => d.specialty === specialty) : DOCTORS)
  })

  app.get('/api/doctors/:id/slots', requireAuth('doctors:read'), (req, res) => {
    res.json({ doctorId: req.params.id, date: req.query.date, hours: SLOTS, slots: clinic.availability(req.params.id, req.query.date) })
  })

  app.post('/api/appointments', requireAuth('reservations:write'), (req, res) => {
    res.status(201).json(clinic.book(req.user, req.body || {}))
  })

  app.get('/api/appointments', requireAuth('reservations:read'), (req, res) => {
    res.json(clinic.list(req.user, { status: req.query.status }))
  })

  app.get('/api/appointments/:id', requireAuth('reservations:read'), (req, res) => {
    res.json(clinic.get(req.params.id, req.user))
  })

  app.patch('/api/appointments/:id/cancel', requireAuth('reservations:read'), (req, res) => {
    res.json(clinic.cancel(req.user, req.params.id))
  })

  app.patch('/api/appointments/:id/complete', requireAuth('records:write'), (req, res) => {
    res.json(clinic.complete(req.user, req.params.id, req.body?.note))
  })

  app.all('/graphql', createGraphqlHandler(clinic))

  app.use('/api', (req, res, next) => next(new HttpError(404, 'not_found', 'Endpoint tidak ditemukan')))

  return finish(app)
}
