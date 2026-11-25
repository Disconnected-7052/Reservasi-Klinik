# Deploy dan Operasional

## Lokal
```bash
npm install
npm run setup:env      # membuat .env berisi secret acak
npm start              # gateway di http://localhost:8080
npm test
```
Dengan Docker: `docker compose up` (RabbitMQ, registry, layanan, gateway).

## Environment variable
Salin `.env.example` menjadi `.env`. Semua nilai di file contoh adalah placeholder; jangan pernah commit `.env`. Yang wajib di deployment: `DATABASE_URL`, `JWT_SECRET` (min. 32 karakter), `DATA_KEY` (64 karakter hex), `EVENT_SECRET`, `REGISTRY_SECRET`, `CLINIC_CLIENT_SECRET`, `AUTH_URL`, `CLINIC_URL`, `NOTIFICATION_URL`, opsional `AMQP_URL` dan `CORS_ORIGINS`.

## Database
```bash
export DATABASE_URL=postgresql://...
npm run db:setup       # skema + seed
npm run db:reset       # kosongkan data + seed ulang (hanya untuk database uji)
```
Detail Render: [README_DATABASE_RENDER.md](../README_DATABASE_RENDER.md).

## Rilis (code freeze)
```bash
git tag -a v1.0.0-code-freeze -m "Code freeze"
git push origin v1.0.0-code-freeze
git rev-parse --short v1.0.0-code-freeze    # hash untuk formulir serah-terima
```
