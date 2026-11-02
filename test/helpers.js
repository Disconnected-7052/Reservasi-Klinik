import { createStore } from '../shared/store.js'
import { createCipher } from '../shared/crypto.js'
import { createClinic } from '../services/clinic/logic.js'
import { config } from '../shared/config.js'

export const NOW = new Date('2026-11-02T03:00:00Z')

export function fakePublisher() {
  const events = []
  return { events, publish: async (type, payload) => { events.push({ type, payload }); return true } }
}

export function makeClinic(clock = () => NOW) {
  const store = createStore('clinic', { appointments: [] })
  const publisher = fakePublisher()
  const cipher = createCipher(config.dataKey)
  const clinic = createClinic({ store, cipher, publisher, clock })
  return { clinic, store, publisher, cipher }
}

export const patient = { id: 'pasien-1', name: 'Rina', role: 'patient', scopes: [] }
export const patient2 = { id: 'pasien-2', name: 'Doni', role: 'patient', scopes: [] }
export const doctor = { id: 'dr-sari', name: 'dr. Sari', role: 'doctor', scopes: [] }
export const otherDoctor = { id: 'dr-budi', name: 'dr. Budi', role: 'doctor', scopes: [] }
export const admin = { id: 'admin', name: 'Admin', role: 'admin', scopes: [] }

export const booking = (overrides = {}) => ({ doctorId: 'dr-sari', date: '2026-11-03', slot: '09:00', complaint: 'Demam tiga hari', ...overrides })

export function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(r => server.close(r))
    }))
  })
}

export async function call(url, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}
