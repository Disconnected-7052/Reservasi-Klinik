# Panduan untuk Kelompok Penguji

## Akses
- URL deployment: https://reservasiklinik.vercel.app (request pertama bisa lambat bila layanan "tertidur").
- Dokumentasi API interaktif: `/api-docs`. Spesifikasi: `/openapi.yaml`.
- Referensi endpoint, autentikasi, dan contoh GraphQL: [API.md](API.md).

## Kredensial uji (khusus penguji)
| Email | Password | Peran |
|---|---|---|
| penguji@klinik.id | Penguji#2026 | patient |

Akun demo lain (`pasien@klinik.id`, `sari@klinik.id`, `budi@klinik.id`, `maya@klinik.id`, `admin@klinik.id`) memakai password demo pembangun; minta ke kontak di bawah bila perlu uji peran dokter/admin.

## Skenario uji asap (15-30 menit)
1. `GET /health` dan `/status` menjawab 200.
2. `GET /api/doctors` tanpa token menjawab 401.
3. Login akun penguji, `GET /auth/oauth/userinfo` dengan token.
4. `GET /api/doctors`, lalu `GET /api/doctors/dr-sari/slots?date=<hari kerja berikutnya>`.
5. `POST /api/appointments` untuk slot kosong; ulangi slot yang sama dan harapkan 409.
6. `PATCH /api/appointments/{id}/cancel`.
7. `GET /notifications` menampilkan notifikasi konfirmasi dan pembatalan.
8. Ulangi langkah 4-5 lewat `POST /graphql`.
9. Otomatis: `BASE_URL=<url> npm run smoke`.

## Reset data uji
Perlu `DATABASE_URL` database uji dan `psql`. Jalankan `npm run db:reset`: mengosongkan semua tabel lalu memuat ulang akun seed (migrations/000_reset_data.sql + 002_seed_data.sql). Jangan jalankan terhadap database produksi.

## Batasan yang diketahui
- `/status` bisa melaporkan 0 instance sehat karena discovery berjenis `static` di deployment; ini tidak berarti layanan mati. Buktinya: endpoint `/api/*` tetap menjawab.
- Penyimpanan memuat data ke memori, jadi auth, clinic, dan notification dijalankan satu instance di deployment (lihat README_DATABASE_RENDER.md).
- Notifikasi pengingat H-1 membutuhkan antrean pesan (`AMQP_URL`); tanpa itu hanya notifikasi langsung yang tersedia.

## Kontak teknis
- [ISI: nama pembangun] - [ISI: WhatsApp / email]
