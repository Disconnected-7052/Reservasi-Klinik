import fs from 'node:fs'
import crypto from 'node:crypto'

const random = bytes => crypto.randomBytes(bytes).toString('hex')
const source = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
const values = {
  JWT_SECRET: random(32),
  DATA_KEY: random(32),
  EVENT_SECRET: random(24),
  CLINIC_CLIENT_SECRET: random(24),
  REGISTRY_SECRET: random(24)
}

const output = source.split('\n').map(line => {
  const [key] = line.split('=')
  return key in values ? `${key}=${values[key]}` : line
}).join('\n')

const target = new URL('../.env', import.meta.url)
if (fs.existsSync(target)) {
  console.error('.env sudah ada, hapus dulu jika ingin membuat ulang')
  process.exit(1)
}
fs.writeFileSync(target, output, { mode: 0o600 })
console.log('.env dibuat dengan secret acak')
