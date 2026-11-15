import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipher, sign, safeEqual } from '../shared/crypto.js'

const key = 'ab'.repeat(32)

test('enkripsi lalu dekripsi mengembalikan teks asli', () => {
  const c = createCipher(key)
  assert.equal(c.decrypt(c.encrypt('Nyeri dada sejak pagi')), 'Nyeri dada sejak pagi')
})

test('teks yang sama menghasilkan ciphertext berbeda', () => {
  const c = createCipher(key)
  assert.notEqual(c.encrypt('sama'), c.encrypt('sama'))
})

test('ciphertext yang diubah ditolak', () => {
  const c = createCipher(key)
  const [iv, tag, body] = c.encrypt('rahasia').split('.')
  const tampered = Buffer.from(body, 'base64')
  tampered[0] ^= 1
  assert.throws(() => c.decrypt([iv, tag, tampered.toString('base64')].join('.')))
})

test('kunci dengan panjang salah ditolak', () => {
  assert.throws(() => createCipher('abcd'), /64 karakter hex/)
})

test('string kosong tidak dienkripsi', () => {
  const c = createCipher(key)
  assert.equal(c.encrypt(''), '')
  assert.equal(c.decrypt(''), '')
})

test('HMAC konsisten dan perbandingan aman', () => {
  assert.equal(sign('s', 'isi'), sign('s', 'isi'))
  assert.notEqual(sign('s', 'isi'), sign('t', 'isi'))
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
})
