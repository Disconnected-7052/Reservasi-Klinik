BEGIN;
-- Demo accounts use the project's existing bcrypt hash (password: Klinik#2026).
INSERT INTO users (id,name,email,role,password_hash,failed_attempts,locked_until,created_at) VALUES
('admin','Admin Klinik','admin@klinik.id','admin','$2a$10$B/NqFVj9VfE4Cm9qtxLU2.Il8yt0lDYenhkJPCfSLdyL2nLuO1naq',0,NULL,NOW()),
('dr-sari','dr. Sari Wulandari, Sp.PD','sari@klinik.id','doctor','$2a$10$B/NqFVj9VfE4Cm9qtxLU2.Il8yt0lDYenhkJPCfSLdyL2nLuO1naq',0,NULL,NOW()),
('dr-budi','dr. Budi Hartono, Sp.A','budi@klinik.id','doctor','$2a$10$B/NqFVj9VfE4Cm9qtxLU2.Il8yt0lDYenhkJPCfSLdyL2nLuO1naq',0,NULL,NOW()),
('dr-maya','drg. Maya Puspita','maya@klinik.id','doctor','$2a$10$B/NqFVj9VfE4Cm9qtxLU2.Il8yt0lDYenhkJPCfSLdyL2nLuO1naq',0,NULL,NOW()),
<<<<<<< HEAD
('pasien-demo','Rina Anggraini','pasien@klinik.id','patient','$2a$10$B/NqFVj9VfE4Cm9qtxLU2.Il8yt0lDYenhkJPCfSLdyL2nLuO1naq',0,NULL,NOW()),
-- Akun khusus penguji (Kelompok D), role patient. Password: Penguji#2026
('penguji','Penguji Kelompok D','penguji@klinik.id','patient','$2a$10$53iJmqjd.XhtNCWb6NzxeOBXzNExiwCklvDD9s.rIe.stJA474OE2',0,NULL,NOW())
=======
('pasien-demo','Rina Anggraini','pasien@klinik.id','patient','$2a$10$B/NqFVj9VfE4Cm9qtxLU2.Il8yt0lDYenhkJPCfSLdyL2nLuO1naq',0,NULL,NOW())
>>>>>>> 9816fbda00f8323c9574b62a6a8ab12ef44cbd94
ON CONFLICT (id) DO NOTHING;
COMMIT;
