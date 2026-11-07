<<<<<<< HEAD
Jangan di push ke branch main dulu
=======
# Klinik Reservasi

Sistem reservasi jadwal dokter berbasis arsitektur microservices untuk mata kuliah Web Service. Pasien memilih dokter dan jam praktik, dokter menyelesaikan pemeriksaan dengan catatan medis, admin memantau seluruh reservasi, dan layanan notifikasi mengirim konfirmasi serta pengingat secara asinkron.

## Ringkasan arsitektur

```
Browser ──► API Gateway :8080 ──► service discovery (Registry :4000)
              │  validasi JWT, rate limit,        ▲  register + heartbeat
              │  request id, load balancing       │
              ├──► auth          x N ─────────────┤
              ├──► clinic        x N ─────────────┤
              └──► notification  x N ─────────────┘
                        ▲
   clinic ── publish ──► RabbitMQ (klinik.events, DLQ klinik.events.dead) ── consume ──► notification
```

| Komponen | Port | Peran |
| --- | --- | --- |
| gateway | 8080 | Satu-satunya pintu masuk: front end statis, reverse proxy, validasi token, rate limit, load balancer round-robin |
| registry | 4000 | Service discovery: layanan mendaftar dan mengirim heartbeat, gateway menanyakan daftar instance sehat |
| auth | 4001 | OAuth 2.0 (password, refresh_token, client_credentials), JWT HS256, registrasi pasien |
| clinic | 4002 | REST dan GraphQL untuk dokter, jadwal, dan reservasi, data medis terenkripsi |
| notification | 4003 | Konsumen antrean, notifikasi konfirmasi, pengingat H-1, pembatalan |
| rabbitmq | 5672, 15672 | Message broker untuk komunikasi asinkron |

Penjelasan lengkap ada di [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md).

## Menjalankan

Prasyarat: Node.js 20 atau lebih baru untuk mode pengembangan, Docker dengan Compose v2 untuk mode produksi.

### Mode pengembangan (tanpa Docker)

```
npm install
npm run dev
```

`npm run dev` menjalankan registry, 2 replika auth, 2 replika clinic, 2 replika notification, lalu gateway. Buka http://localhost:8080. Jumlah replika diatur lewat `AUTH_REPLICAS`, `CLINIC_REPLICAS`, dan `NOTIFICATION_REPLICAS`. Data disimpan di folder `data/`. Tanpa `AMQP_URL`, event dikirim lewat HTTP bertanda tangan ke notification-service.

### Mode produksi (Docker Compose)

```
npm run setup:env
docker compose up -d --build
docker compose ps
```

`setup:env` membuat `.env` berisi secret acak. Compose menjalankan RabbitMQ, registry, 2 replika tiap layanan, dan gateway, lengkap dengan healthcheck. Aplikasi tersedia di http://localhost:8080 dan konsol RabbitMQ di http://127.0.0.1:15672 (guest, guest). Panduan lengkap ada di [docs/DEPLOY.md](docs/DEPLOY.md).

### Akun contoh

Kata sandi semua akun: `Klinik#2026` (ubah lewat `SEED_PASSWORD` sebelum start pertama).

| Peran | Email |
| --- | --- |
| Pasien | pasien@klinik.id |
| Dokter | sari@klinik.id, budi@klinik.id, maya@klinik.id |
| Admin | admin@klinik.id |

## Pengujian

```
npm test
npm run smoke
```

`npm test` menjalankan seluruh pengujian otomatis (unit, integrasi, gateway, registry, penyimpanan, antrean). `npm run smoke` menguji sistem yang sedang berjalan dari luar: kesehatan gateway, discovery, login, pemesanan serentak, notifikasi, dan pembatalan. Argumen opsional: URL dasar, misalnya `npm run smoke -- http://host:8080`.

## Dokumentasi

| Dokumen | Isi |
| --- | --- |
| [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) | Desain sistem, alur data, keputusan desain, keterbatasan |
| [docs/API.md](docs/API.md) | Referensi endpoint REST, GraphQL, dan aturan bisnis |
| [docs/openapi.yaml](docs/openapi.yaml) | Spesifikasi OpenAPI 3 |
| [docs/schema.graphql](docs/schema.graphql) | Skema GraphQL |
| [docs/klinik-reservasi.postman_collection.json](docs/klinik-reservasi.postman_collection.json) | Koleksi Postman |
| [docs/KEAMANAN.md](docs/KEAMANAN.md) | Kontrol keamanan yang diterapkan |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy, konfigurasi, scaling, operasional |
| [docs/PANDUAN-PENGUJI.md](docs/PANDUAN-PENGUJI.md) | Panduan untuk kelompok penguji (akses, skenario, batasan yang diketahui) |
| [docs/PANDUAN-DEMO.md](docs/PANDUAN-DEMO.md) | Skenario demo untuk UAS |
| [docs/TIMELINE.md](docs/TIMELINE.md) | Pemetaan sesi kuliah ke isi proyek |
| [CHANGELOG.md](CHANGELOG.md) | Riwayat perubahan |

## Struktur proyek

```
gateway/        API gateway (app.js dapat diuji, index.js menjalankan server)
services/
  registry/     service discovery
  auth/         OAuth 2.0 dan JWT
  clinic/       REST, GraphQL, logika reservasi
  notification/ konsumen antrean dan notifikasi
shared/         konfigurasi, keamanan, penyimpanan, antrean, discovery
frontend/       aplikasi web statis
scripts/        dev cluster, smoke test, pembuat .env, ekspor skema
test/           pengujian otomatis
docs/           dokumentasi
```
>>>>>>> c3959b0 (update)
