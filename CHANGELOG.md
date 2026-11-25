# Changelog

## 1.0.0 (code freeze)

### Ditambahkan
- Registry service discovery (registrasi, heartbeat, TTL), load balancing round-robin di gateway.
- Penyimpanan PostgreSQL ternormalisasi dengan migrasi `migrations/001_schema.sql` dan seed `002_seed_data.sql`.
- Validasi JWT di gateway untuk rute `/api`, `/graphql`, dan `/notifications`; rate limit, request id, log akses JSON, `/status`.
- Antrean pesan dengan dead letter queue, tanda tangan HMAC bertimestamp untuk event internal.
- Dokumentasi: README, `docs/API.md`, `docs/openapi.yaml` (juga di `/openapi.yaml` dan `/api-docs`), `docs/schema.graphql`, `docs/PANDUAN-PENGUJI.md`, `docs/DEPLOY.md`.
- Akun khusus penguji (`penguji@klinik.id`) dan perintah reset data `npm run db:reset`.
- Skrip smoke test `npm run smoke`.

### Diperbaiki
- Rate limit layanan kini membaca IP asli lewat `X-Forwarded-For`.
- Percobaan login gagal dan rotasi refresh token kini atomik.
- Port RabbitMQ management di Compose hanya dibuka ke localhost.
- `.env.example` tidak lagi memuat password bawaan; folder `data/` dan `README_OLD.md` dihapus.

### Dasar (sebelum code freeze)
- Autentikasi OAuth 2.0 dan JWT, kontrol akses berbasis scope dan peran.
- REST dan GraphQL untuk dokter, jadwal, dan reservasi.
- Enkripsi AES-256-GCM untuk keluhan dan catatan medis.
- Notifikasi konfirmasi, pengingat H-1, dan pembatalan.
