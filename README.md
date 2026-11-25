<<<<<<< HEAD
# Reservasi Klinik

Sistem reservasi klinik berbasis layanan (gateway, auth, clinic, notification, registry) dengan REST, GraphQL, OAuth 2.0/JWT, dan penyimpanan PostgreSQL.

- **URL deployment:** https://reservasiklinik.vercel.app
- **Dokumentasi API interaktif:** `/api-docs` (spesifikasi: `/openapi.yaml`, file `docs/openapi.yaml`)
- **Versi code freeze:** tag `v1.0.0-code-freeze` (hash commit: [ISI setelah tag dibuat])
- **Kontak teknis:** [ISI: nama - WhatsApp/email]

## Dokumentasi
| Dokumen | Isi |
|---|---|
| [docs/API.md](docs/API.md) | Autentikasi, daftar endpoint, aturan bisnis, contoh REST dan GraphQL |
| [docs/openapi.yaml](docs/openapi.yaml) | Spesifikasi OpenAPI 3 |
| [docs/schema.graphql](docs/schema.graphql) | Skema GraphQL |
| [docs/PANDUAN-PENGUJI.md](docs/PANDUAN-PENGUJI.md) | Akun uji, skenario uji asap, reset data, batasan |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Menjalankan, environment variable, database, rilis |
| [.env.example](.env.example) | Daftar environment variable (placeholder) |

## Menjalankan lokal
```bash
npm install
npm run setup:env
npm start          # http://localhost:8080
npm test           # tes otomatis
npm run smoke      # uji asap ke BASE_URL (default localhost:8080)
```

## Cara mengakses dan autentikasi
Rute `/api`, `/graphql`, dan `/notifications` wajib token; tanpa token jawabannya **401** (disengaja). Ambil token:

```bash
curl -s -X POST https://reservasiklinik.vercel.app/auth/oauth/token \
  -H "content-type: application/json" \
  -d '{"grant_type":"password","client_id":"web","username":"penguji@klinik.id","password":"Penguji#2026"}'
```
Pakai `access_token` sebagai `Authorization: Bearer <token>`.

## Akun uji
| Email | Peran | Catatan |
|---|---|---|
| penguji@klinik.id | patient | Khusus penguji, password `Penguji#2026` |
| pasien@klinik.id, sari@klinik.id, budi@klinik.id, maya@klinik.id, admin@klinik.id | patient / doctor / admin | Akun demo pembangun |

## Endpoint ringkas
| Method | Path | Autentikasi |
|---|---|---|
| GET | /health, /status | - |
| POST | /auth/register, /auth/oauth/token, /auth/oauth/revoke | - |
| GET | /auth/oauth/userinfo | Bearer |
| GET | /api/doctors, /api/doctors/{id}/slots | doctors:read |
| POST/GET | /api/appointments | reservations:write / read |
| GET | /api/appointments/{id} | reservations:read |
| PATCH | /api/appointments/{id}/cancel | reservations:read |
| PATCH | /api/appointments/{id}/complete | records:write |
| GET/PATCH | /notifications, /notifications/{id}/read | notifications:read |
| POST | /graphql | Bearer |

Detail lengkap dan contoh: [docs/API.md](docs/API.md).

## Reset data uji
```bash
export DATABASE_URL=postgresql://...
npm run db:reset    # kosongkan data lalu seed ulang akun
```
=======
Link Deploy: reservasiklinik.vercel.app  
  
Sekilas API, lebih lengkap pada dokumentation:  
Method, Path, Autentikasi/scope, Kegunaan  
- GET, "/health", Tidak perlu token, Memeriksa kesehatan Gateway.  
- GET, ""/status", Tidak perlu token, Melihat status Gateway dan service discovery.  
- POST, "/auth/register", Tidak perlu token, Registrasi pasien.  
- POST, "/auth/oauth/token", Tidak perlu token, Login / memperoleh token OAuth.  
- POST, "/auth/oauth/revoke", Tidak perlu token, Mencabut refresh token.  
- GET, "/auth/oauth/userinfo", Bearer JWT, Informasi pengguna dari token.  
- GET, "/api/doctors", doctors:read, Daftar dokter; filter specialty opsional.  
- GET, "/api/doctors/{id}/slots", doctors:read, Jadwal dan ketersediaan slot dokter.  
- POST, "/api/appointments", reservations:write, Membuat reservasi.  
- GET, "/api/appointments", reservations:read, Daftar reservasi milik/terkait pengguna.  
- GET, "/api/appointments/{id}", reservations:read, Detail reservasi.  
- PATCH, "/api/appointments/{id}/cancel", reservations:read, Membatalkan reservasi sesuai aturan.  
- PATCH, "/api/appointments/{id}/complete", records:write, Menyelesaikan pemeriksaan.  
- GET, "/notifications", notifications:read, Daftar notifikasi.  
- PATCH, "/notifications/{id}/read", notifications:read, Menandai notifikasi telah dibaca.  

>>>>>>> 9816fbda00f8323c9574b62a6a8ab12ef44cbd94
