import fs from 'node:fs'
import { printSchema } from 'graphql'
import { schema } from '../services/clinic/graphql.js'

const target = process.argv[2] || 'schema.graphql'
fs.writeFileSync(target, `${printSchema(schema)}\n`)
console.log(`schema ditulis ke ${target}`)
