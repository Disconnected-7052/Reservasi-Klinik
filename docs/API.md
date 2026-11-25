# Referensi API

Semua akses lewat **gateway** (`BASE_URL`, lihat README). Dokumentasi interaktif: `{BASE_URL}/api-docs`; spesifikasi mentah: `{BASE_URL}/openapi.yaml` atau `docs/openapi.yaml`. Skema GraphQL: `docs/schema.graphql`.

## Autentikasi

Rute `/api`, `/graphql`, dan `/notifications` **wajib token**; tanpa token jawabannya `401`. Ini perilaku yang disengaja. `/health`, `/status`, `/auth/*` tidak perlu token.

Ambil token (OAuth 2.0 password grant, body JSON):

```bash
curl -s -X POST $BASE_URL/auth/oauth/token \
  -H "content-type: application/json" \
  -d '{"grant_type":"password","client_id":"web","username":"penguji@klinik.id","password":"Penguji#2026"}'
```

Jawaban berisi `access_token` (berlaku 15 menit), `refresh_token`, dan `scope`. Pakai di header `Authorization: Bearer <access_token>`. Perpanjang dengan `grant_type=refresh_token`. Lima kali salah password mengunci akun sementara.

Scope per peran: patient = `doctors:read`, `reservations:read`, `reservations:write`, `notifications:read`; doctor = `doctors:read`, `reservations:read`, `records:write`, `notifications:read`; admin = `doctors:read`, `reservations:read`, `reservations:manage`, `notifications:read`.

## Endpoint REST

| Method | Path | Scope | Fungsi |
|---|---|---|---|
| GET | /health | - | Kesehatan gateway |
| GET | /status | - | Status gateway dan service discovery |
| POST | /auth/register | - | Registrasi pasien (`name`, `email`, `password` min. 8 karakter) |
| POST | /auth/oauth/token | - | Login / refresh token |
| POST | /auth/oauth/revoke | - | Cabut refresh token |
| GET | /auth/oauth/userinfo | Bearer | Info pengguna dari token |
| GET | /api/doctors?specialty= | doctors:read | Daftar dokter |
| GET | /api/doctors/{id}/slots?date=YYYY-MM-DD | doctors:read | Ketersediaan slot |
| POST | /api/appointments | reservations:write | Buat reservasi |
| GET | /api/appointments | reservations:read | Daftar reservasi |
| GET | /api/appointments/{id} | reservations:read | Detail reservasi |
| PATCH | /api/appointments/{id}/cancel | reservations:read | Batalkan reservasi |
| PATCH | /api/appointments/{id}/complete | records:write | Selesaikan pemeriksaan (dokter) |
| GET | /notifications | notifications:read | Daftar notifikasi |
| PATCH | /notifications/{id}/read | notifications:read | Tandai dibaca |
| POST | /graphql | Bearer | Endpoint GraphQL |

Contoh:

```bash
TOKEN=<access_token>
curl -s $BASE_URL/api/doctors -H "authorization: Bearer $TOKEN"
curl -s "$BASE_URL/api/doctors/dr-sari/slots?date=2026-12-01" -H "authorization: Bearer $TOKEN"
curl -s -X POST $BASE_URL/api/appointments -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"doctorId":"dr-sari","date":"2026-12-01","slot":"09:00","complaint":"Demam 3 hari"}'
```

## Aturan bisnis

- Slot: 08:00, 09:00, 10:00, 11:00, 13:00, 14:00, 15:00, 16:00 (WIB).
- Hari praktik: dr-sari Senin-Jumat; dr-budi Senin, Rabu, Jumat, Sabtu; dr-maya Selasa, Kamis, Sabtu.
- Reservasi hanya untuk hari ini sampai 30 hari ke depan; slot yang sudah lewat ditolak (`422`).
- Slot yang sudah dipesan menghasilkan `409 slot_taken`. Pasien tidak bisa memesan dua dokter di jam yang sama.
- Pasien tidak bisa membatalkan kurang dari 1 jam sebelum jadwal.
- Keluhan maksimal 500 karakter; keluhan dan catatan medis disimpan terenkripsi (AES-256-GCM).
- Rate limit gateway: 600 permintaan per menit per IP (default).

## GraphQL

Kirim `POST /graphql` dengan body `{"query": "...", "variables": {...}}` dan header Bearer.

Query:

```graphql
query { doctors { id name specialty room days } }

query { availability(doctorId: "dr-sari", date: "2026-12-01") { time available } }

query { appointments(status: BOOKED) { id doctorName date slot status } }
```

Mutation:

```graphql
mutation {
  bookAppointment(input: { doctorId: "dr-sari", date: "2026-12-01", slot: "10:00", complaint: "Sakit kepala" }) {
    id status date slot
  }
}

mutation { cancelAppointment(id: "ISI_ID_RESERVASI") { id status } }
```

Contoh lewat curl:

```bash
curl -s -X POST $BASE_URL/graphql -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"query":"{ doctors { id name specialty } }"}'
```
