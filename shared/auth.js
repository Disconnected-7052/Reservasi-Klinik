import jwt from 'jsonwebtoken'
import { config } from './config.js'

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience
  })
}

export function readBearer(req) {
  const header = req.headers.authorization || ''
  const [type, token] = header.split(' ')
  return type && type.toLowerCase() === 'bearer' && token ? token : null
}

export function authenticate(req) {
  const token = readBearer(req)
  if (!token) return null
  try {
    const claims = verifyToken(token)
    return {
      id: claims.sub,
      name: claims.name,
      role: claims.role,
      scopes: String(claims.scope || '').split(' ').filter(Boolean)
    }
  } catch {
    return null
  }
}

export function hasScope(user, scope) {
  return Boolean(user) && user.scopes.includes(scope)
}

export function requireAuth(...scopes) {
  return (req, res, next) => {
    const user = authenticate(req)
    if (!user) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"')
      return res.status(401).json({ error: 'unauthorized', message: 'Token tidak valid atau kedaluwarsa' })
    }
    const missing = scopes.filter(s => !hasScope(user, s))
    if (missing.length) {
      return res.status(403).json({ error: 'insufficient_scope', message: `Scope dibutuhkan: ${missing.join(' ')}` })
    }
    req.user = user
    next()
  }
}
