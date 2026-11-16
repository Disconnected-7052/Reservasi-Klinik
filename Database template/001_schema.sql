BEGIN;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(120) NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('patient','doctor','admin')),
  password_hash TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash CHAR(64) PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx ON refresh_tokens(expires_at);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES users(id), patient_name TEXT NOT NULL,
  doctor_id TEXT NOT NULL, appointment_date DATE NOT NULL, slot TIME NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('BOOKED','CANCELLED','COMPLETED')),
  complaint_ciphertext TEXT NOT NULL DEFAULT '', note_ciphertext TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (slot IN ('08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00'))
);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_active_uq ON appointments(doctor_id, appointment_date, slot) WHERE status='BOOKED';
CREATE UNIQUE INDEX IF NOT EXISTS appointments_patient_slot_active_uq ON appointments(patient_id, appointment_date, slot) WHERE status='BOOKED';
CREATE INDEX IF NOT EXISTS appointments_patient_date_idx ON appointments(patient_id, appointment_date);
CREATE INDEX IF NOT EXISTS appointments_doctor_date_idx ON appointments(doctor_id, appointment_date);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  deliver_at TIMESTAMPTZ NOT NULL, delivered BOOLEAN NOT NULL DEFAULT FALSE,
  read BOOLEAN NOT NULL DEFAULT FALSE, cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_delivery_idx ON notifications(user_id, delivered, deliver_at DESC);
CREATE TABLE IF NOT EXISTS processed_events (
  event_key TEXT PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
