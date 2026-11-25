# Changelog

## 1.0.0 (code freeze)

### Ditambahkan
<<<<<<< HEAD
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
=======
- Registry service discovery dengan registrasi, heartbeat, TTL, dan deregistrasi saat shutdown.
- Load balancing round-robin di gateway dengan penandaan instance gagal secara pasif.
- Replika ganda untuk auth, clinic, dan notification di Docker Compose dan di `npm run dev`.
- Penyimpanan bersama dengan transaksi atomik dan kunci berkas lintas proses sehingga replika tidak saling menimpa data.
- Validasi JWT di gateway untuk rute `/api`, `/graphql`, dan `/notifications`.
- Rate limit di gateway, request id yang diteruskan ke semua layanan, log akses berformat JSON, dan endpoint `/status`.
- Dead letter queue `klinik.events.dead`, publisher confirm, dan koneksi ulang konsumen RabbitMQ.
- Tanda tangan HMAC bertimestamp untuk event internal dan registrasi layanan, dengan penolakan replay.
- Healthcheck, batas log, `init`, grace period, dan pembatasan capability container pada Compose.
- Dokumentasi lengkap, spesifikasi OpenAPI, skema GraphQL, koleksi Postman, dan skrip smoke test.

### Diperbaiki
- Rate limit layanan sebelumnya menghitung semua pengguna sebagai satu klien karena IP asli tidak diteruskan. Gateway kini meneruskan `X-Forwarded-For`.
- Pencatatan percobaan login gagal dan rotasi refresh token kini atomik terhadap akses bersamaan.
- Transaksi penyimpanan yang gagal dikembalikan ke keadaan terakhir yang tersimpan.
- Port RabbitMQ management di Compose hanya dibuka ke localhost.
>>>>>>> 9816fbda00f8323c9574b62a6a8ab12ef44cbd94

### Dasar (sebelum code freeze)
- Autentikasi OAuth 2.0 dan JWT, kontrol akses berbasis scope dan peran.
- REST dan GraphQL untuk dokter, jadwal, dan reservasi.
- Enkripsi AES-256-GCM untuk keluhan dan catatan medis.
<<<<<<< HEAD
- Notifikasi konfirmasi, pengingat H-1, dan pembatalan.
=======
- Notifikasi konfirmasi, pengingat H-1, dan pembatalan lewat antrean pesan.
>>>>>>> 9816fbda00f8323c9574b62a6a8ab12ef44cbd94
