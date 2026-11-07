import os from 'node:os'

const prod = process.env.NODE_ENV === 'production'

function secret(name, fallback) {
  const value = process.env[name]
  if (value) return value
  if (prod) throw new Error(`Environment variable ${name} wajib diisi di production`)
  return fallback
}

export const config = {
  prod,
  ports: {
    registry: Number(process.env.REGISTRY_PORT || 4000),
    auth: Number(process.env.AUTH_PORT || 4001),
    clinic: Number(process.env.CLINIC_PORT || 4002),
    notification: Number(process.env.NOTIFICATION_PORT || 4003),
    gateway: Number(process.env.PORT || process.env.GATEWAY_PORT || 8080)
  },
  urls: {
    auth: process.env.AUTH_URL || 'http://localhost:4001',
    clinic: process.env.CLINIC_URL || 'http://localhost:4002',
    notification: process.env.NOTIFICATION_URL || 'http://localhost:4003'
  },
  registry: {
    url: process.env.REGISTRY_URL || '',
    secret: secret('REGISTRY_SECRET', 'dev-only-registry-secret'),
    ttlMs: Number(process.env.REGISTRY_TTL_MS || 15000),
    heartbeatMs: Number(process.env.REGISTRY_HEARTBEAT_MS || 5000),
    cacheMs: Number(process.env.DISCOVERY_CACHE_MS || 3000),
    downMs: Number(process.env.DISCOVERY_DOWN_MS || 10000),
    advertiseHost: process.env.ADVERTISE_HOST || (prod ? os.hostname() : 'localhost')
  },
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  gatewayLimit: Number(process.env.GATEWAY_RATE_LIMIT || 600),
  jwt: {
    secret: secret('JWT_SECRET', 'dev-only-jwt-secret-change-me-0123456789'),
    issuer: process.env.JWT_ISSUER || 'klinik-auth',
    audience: process.env.JWT_AUDIENCE || 'klinik-api',
    accessTtl: Number(process.env.ACCESS_TOKEN_TTL || 900),
    refreshTtl: Number(process.env.REFRESH_TOKEN_TTL || 604800)
  },
  dataKey: secret('DATA_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  eventSecret: secret('EVENT_SECRET', 'dev-only-event-secret'),
  amqpUrl: process.env.AMQP_URL || '',
  queueName: process.env.QUEUE_NAME || 'klinik.events',
  dataDir: process.env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
  clients: {
    web: { secret: null },
    'clinic-service': { secret: secret('CLINIC_CLIENT_SECRET', 'dev-clinic-client-secret') }
  },
  seedPassword: process.env.SEED_PASSWORD || 'Klinik#2026',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
}
