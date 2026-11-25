import fs from 'node:fs'
import path from 'node:path'

const sleeper = new Int32Array(new SharedArrayBuffer(4))
const LOCK_STALE_MS = 10_000
const LOCK_WAIT_MS = 8_000

function pause(ms) {
  Atomics.wait(sleeper, 0, 0, ms)
}

export function createStore(name, defaults, dir) {
  const data = structuredClone(defaults)
  let file = null
  let lock = null
  let timer = null
  let depth = 0
  let dirty = false
  let signature = ''

  function replace(next) {
    for (const key of Object.keys(data)) delete data[key]
    Object.assign(data, structuredClone(defaults), next)
  }

  function stamp() {
    try {
      const s = fs.statSync(file)
      return `${s.ino}:${s.size}:${s.mtimeMs}`
    } catch {
      return ''
    }
  }

  function load() {
    if (!fs.existsSync(file)) return
    try {
      replace(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`)
    }
    signature = stamp()
  }

  function write() {
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, file)
    signature = stamp()
    dirty = false
  }

  function acquire() {
    const started = Date.now()
    for (;;) {
      try {
        fs.mkdirSync(lock)
        return
      } catch (err) {
        if (err.code !== 'EEXIST') throw err
        try {
          if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmdirSync(lock)
        } catch {}
        if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`Gagal mengunci penyimpanan ${name}`)
        pause(5)
      }
    }
  }

  function release() {
    try {
      fs.rmdirSync(lock)
    } catch {}
  }

  if (dir) {
    fs.mkdirSync(dir, { recursive: true })
    file = path.join(dir, `${name}.json`)
    lock = path.join(dir, `${name}.lock`)
    load()
  }

  function atomic(fn) {
    if (!file) return fn()
    if (depth > 0) return fn()
    clearTimeout(timer)
    acquire()
    depth = 1
    try {
      if (stamp() !== signature) load()
      dirty = false
      const result = fn()
      if (dirty) write()
      return result
    } catch (err) {
      dirty = false
      replace({})
      load()
      throw err
    } finally {
      depth = 0
      release()
    }
  }

  function flush() {
    if (!file) return
    clearTimeout(timer)
    if (depth > 0) return
    if (dirty) {
      acquire()
      try {
        write()
      } finally {
        release()
      }
    }
  }

  function save() {
    if (!file) return
    dirty = true
    if (depth > 0) return
    clearTimeout(timer)
    timer = setTimeout(flush, 50)
    timer.unref?.()
  }

  function wrap(methods) {
    const wrapped = {}
    for (const [key, fn] of Object.entries(methods)) wrapped[key] = (...args) => atomic(() => fn(...args))
    return wrapped
  }

  return { data, save, flush, atomic, wrap }
}
