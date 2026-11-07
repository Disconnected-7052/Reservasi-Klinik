import { spawn } from 'node:child_process'

const base = {
  registry: Number(process.env.REGISTRY_PORT || 4000),
  auth: Number(process.env.AUTH_PORT || 4001),
  clinic: Number(process.env.CLINIC_PORT || 4002),
  notification: Number(process.env.NOTIFICATION_PORT || 4003)
}
const replicas = {
  auth: Number(process.env.AUTH_REPLICAS || 2),
  clinic: Number(process.env.CLINIC_REPLICAS || 2),
  notification: Number(process.env.NOTIFICATION_REPLICAS || 2)
}
const registryUrl = process.env.REGISTRY_URL || `http://localhost:${base.registry}`
const common = { ...process.env, REGISTRY_URL: registryUrl, ADVERTISE_HOST: process.env.ADVERTISE_HOST || 'localhost' }

const children = []

function start(file, env) {
  const child = spawn(process.execPath, [file], { stdio: 'inherit', env: { ...common, ...env } })
  children.push(child)
  child.on('exit', code => {
    if (code) {
      stop()
      process.exitCode = code
    }
  })
}

function stop() {
  for (const child of children) child.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

start('services/registry/index.js', { REGISTRY_PORT: String(base.registry) })

setTimeout(() => {
  for (let i = 0; i < replicas.auth; i++) start('services/auth/index.js', { AUTH_PORT: String(base.auth + i * 10) })
  for (let i = 0; i < replicas.clinic; i++) start('services/clinic/index.js', { CLINIC_PORT: String(base.clinic + i * 10) })
  for (let i = 0; i < replicas.notification; i++) start('services/notification/index.js', { NOTIFICATION_PORT: String(base.notification + i * 10) })
  setTimeout(() => start('gateway/index.js', {}), 800)
}, 500)
