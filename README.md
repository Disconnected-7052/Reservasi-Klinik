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

