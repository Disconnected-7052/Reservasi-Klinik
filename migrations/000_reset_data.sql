-- Reset data uji: mengosongkan semua tabel (skema tetap ada).
-- Jalankan lewat: npm run db:reset  (otomatis diikuti seed ulang 002_seed_data.sql)
BEGIN;
TRUNCATE TABLE processed_events, notifications, appointments, refresh_tokens, users RESTART IDENTITY CASCADE;
COMMIT;
