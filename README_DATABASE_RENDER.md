# PostgreSQL on Render

This revision uses normalized PostgreSQL tables instead of JSON files / JSONB document storage.

## Database setup

Create a Render PostgreSQL database, then set `DATABASE_URL` on the Auth, Clinic, and Notification services to the database's **Internal Database URL** when the services are in the same Render region. Run the SQL scripts once, in this order, using Render's SQL console or `psql`:

1. `migrations/001_schema.sql`
2. `migrations/002_seed_data.sql`

The seed script creates the demo accounts. Demo password: `Klinik#2026`.

## Deployment notes

- Keep one instance each of Auth, Clinic, and Notification while using this compatibility store. It loads table rows into memory and flushes each service's table set on changes to preserve the existing synchronous service logic. Do not scale these services horizontally until the store is replaced with direct asynchronous repository queries/transactions; concurrent replicas could overwrite one another's snapshots.
- PostgreSQL partial unique indexes prevent two active bookings for the same doctor/time or patient/time. Treat a database unique-violation as a conflict at the API boundary before enabling multiple clinic instances.
- The old `data/*.json` files are no longer read by the PostgreSQL services. The seed script only seeds demo users; appointment and notification tables start empty.
- Do not commit `.env` or credentials. Configure `DATABASE_URL`, JWT/data/event/registry secrets, and `AMQP_URL` in Render environment settings.
