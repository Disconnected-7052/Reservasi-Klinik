# Changelog

## 1.0.0 (code freeze)

### Ditambahkan
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

### Dasar (sebelum code freeze)
- Autentikasi OAuth 2.0 dan JWT, kontrol akses berbasis scope dan peran.
- REST dan GraphQL untuk dokter, jadwal, dan reservasi.
- Enkripsi AES-256-GCM untuk keluhan dan catatan medis.
- Notifikasi konfirmasi, pengingat H-1, dan pembatalan lewat antrean pesan.
