import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createStore } from '../shared/store.js'

const storeUrl = new URL('../shared/store.js', import.meta.url).href

function worker(dir, rounds) {
  const code = `
    import { createStore } from '${storeUrl}'
    const s = createStore('counter', { n: 0, list: [] }, '${dir}')
    for (let i = 0; i < ${rounds}; i++) s.atomic(() => { s.data.n += 1; s.data.list.push(process.pid); s.save() })
  `
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'inherit' })
    child.on('exit', c => c === 0 ? resolve() : reject(new Error(`worker keluar dengan kode ${c}`)))
  })
}

test('store: proses paralel tidak saling menimpa saat atomic', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klinik-store-'))
  await Promise.all([worker(dir, 60), worker(dir, 60), worker(dir, 60), worker(dir, 60)])
  const store = createStore('counter', { n: 0, list: [] }, dir)
  assert.equal(store.data.n, 240)
  assert.equal(store.data.list.length, 240)
  assert.equal(fs.existsSync(path.join(dir, 'counter.lock')), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('store: perubahan instance lain terlihat pada transaksi berikutnya', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klinik-store-'))
  const a = createStore('shared', { items: [] }, dir)
  const b = createStore('shared', { items: [] }, dir)
  a.atomic(() => { a.data.items.push('dari-a'); a.save() })
  const seen = b.atomic(() => [...b.data.items])
  assert.deepEqual(seen, ['dari-a'])
  b.atomic(() => { b.data.items.push('dari-b'); b.save() })
  assert.deepEqual(a.atomic(() => [...a.data.items]), ['dari-a', 'dari-b'])
  fs.rmSync(dir, { recursive: true, force: true })
})

test('store: error dalam transaksi tidak menulis dan melepas kunci', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klinik-store-'))
  const s = createStore('err', { n: 0 }, dir)
  s.atomic(() => { s.data.n = 1; s.save() })
  assert.throws(() => s.atomic(() => { s.data.n = 99; s.save(); throw new Error('gagal') }), /gagal/)
  assert.equal(fs.existsSync(path.join(dir, 'err.lock')), false)
  assert.equal(createStore('err', { n: 0 }, dir).data.n, 1)
  assert.equal(s.atomic(() => s.data.n), 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('store: kunci basi diambil alih dan berkas rusak dicadangkan', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klinik-store-'))
  fs.writeFileSync(path.join(dir, 'x.json'), '{rusak')
  const s = createStore('x', { n: 0 }, dir)
  assert.equal(s.data.n, 0)
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('x.json.corrupt-')))
  const lock = path.join(dir, 'x.lock')
  fs.mkdirSync(lock)
  const old = new Date(Date.now() - 60_000)
  fs.utimesSync(lock, old, old)
  assert.equal(s.atomic(() => { s.data.n = 5; s.save(); return s.data.n }), 5)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('store: tanpa direktori atomic hanya menjalankan fungsi', () => {
  const s = createStore('mem', { n: 0 })
  assert.equal(s.atomic(() => { s.data.n = 3; s.save(); return s.data.n }), 3)
  const wrapped = s.wrap({ read: () => s.data.n })
  assert.equal(wrapped.read(), 3)
})
