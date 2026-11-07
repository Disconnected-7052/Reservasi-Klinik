import { buildSchema, GraphQLError } from 'graphql'
import { createHandler } from 'graphql-http/lib/use/express'
import { typeDefs } from './schema.js'
import { DOCTORS } from './logic.js'
import { authenticate, hasScope } from '../../shared/auth.js'
import { HttpError } from '../../shared/http.js'

export const schema = buildSchema(typeDefs)

function guard(ctx, scope) {
  if (!ctx.user) throw new GraphQLError('Token tidak valid atau kedaluwarsa', { extensions: { code: 'UNAUTHENTICATED' } })
  if (!hasScope(ctx.user, scope)) throw new GraphQLError(`Scope dibutuhkan: ${scope}`, { extensions: { code: 'FORBIDDEN' } })
}

function run(fn) {
  try {
    return fn()
  } catch (err) {
    if (err instanceof HttpError) throw new GraphQLError(err.message, { extensions: { code: err.code.toUpperCase(), status: err.status } })
    throw err
  }
}

export function createGraphqlHandler(clinic) {
  const rootValue = {
    doctors: ({ specialty }, ctx) => {
      guard(ctx, 'doctors:read')
      return specialty ? DOCTORS.filter(d => d.specialty === specialty) : DOCTORS
    },
    doctor: ({ id }, ctx) => {
      guard(ctx, 'doctors:read')
      return DOCTORS.find(d => d.id === id) || null
    },
    availability: ({ doctorId, date }, ctx) => {
      guard(ctx, 'doctors:read')
      return run(() => clinic.availability(doctorId, date))
    },
    appointments: ({ status }, ctx) => {
      guard(ctx, 'reservations:read')
      return clinic.list(ctx.user, { status })
    },
    appointment: ({ id }, ctx) => {
      guard(ctx, 'reservations:read')
      return run(() => clinic.get(id, ctx.user))
    },
    bookAppointment: ({ input }, ctx) => {
      guard(ctx, 'reservations:write')
      return run(() => clinic.book(ctx.user, input))
    },
    cancelAppointment: ({ id }, ctx) => {
      guard(ctx, 'reservations:read')
      return run(() => clinic.cancel(ctx.user, id))
    },
    completeAppointment: ({ id, note }, ctx) => {
      guard(ctx, 'records:write')
      return run(() => clinic.complete(ctx.user, id, note))
    }
  }

  return createHandler({
    schema,
    rootValue,
    context: req => ({ user: authenticate(req.raw) })
  })
}
