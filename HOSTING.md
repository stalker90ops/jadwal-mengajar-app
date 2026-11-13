# Panduan Hosting — Jadwal Mengajar

Aplikasi ini memakai **Next.js + Prisma + SQLite** (file database lokal) dan `bcrypt` (modul native).
Konsekuensinya, aplikasi butuh **server yang punya disk permanen** (VPS / server sekolah).

> [!WARNING]
> **Jangan pakai Vercel / Netlify / hosting serverless.** Disk-nya sementara, sehingga file SQLite akan hilang/tidak bisa ditulis. Kalau tetap ingin serverless, database harus dipindah ke PostgreSQL/MySQL terlebih dahulu.

## Opsi A (disarankan): Docker + HTTPS otomatis

Kebutuhan: VPS Linux (Ubuntu 22.04/24.04, RAM ≥ 1 GB), domain yang diarahkan (A record) ke IP VPS, Docker.

```bash
# 1. Pasang Docker (sekali saja)
curl -fsSL https://get.docker.com | sh

# 2. Ambil kode (atau upload folder proyek ke server)
git clone <URL-REPO-ANDA> jadwal && cd jadwal

# 3. Buat file konfigurasi
cp .env.example .env
nano .env        # isi JWT_SECRET (openssl rand -base64 48), ADMIN_EMAIL, ADMIN_PASSWORD

# 4. Ganti domain di Caddyfile
nano Caddyfile   # ganti jadwal.contohsekolah.sch.id dengan domain Anda

# 5. Jalankan
docker compose up -d --build
```

Buka `https://domain-anda` → halaman jadwal publik. Admin di `https://domain-anda/roster`.
Akun admin dibuat otomatis saat **login pertama** memakai `ADMIN_EMAIL` / `ADMIN_PASSWORD` dari `.env`.

**Tanpa domain (uji coba lewat IP, HTTP):** di `docker-compose.yml` aktifkan `ports: "3000:3000"` pada service `app`, hapus service `caddy`, dan isi `COOKIE_SECURE=false` di `.env`. Akses `http://IP-SERVER:3000`.

### Update aplikasi
```bash
git pull
docker compose up -d --build
```
Data tetap aman karena database ada di volume `app_data` (`/data/app.db`).

### Backup database
```bash
docker compose cp app:/data/app.db ./backup-$(date +%F).db
```

### Lihat log / restart
```bash
docker compose logs -f app
docker compose restart app
```

## Opsi B: Tanpa Docker (Node.js + PM2)

```bash
# Node 20 + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2

git clone <URL-REPO-ANDA> jadwal && cd jadwal
cp .env.example .env && nano .env      # isi JWT_SECRET, ADMIN_*, dan DATABASE_URL=file:./prod.db
npm ci
npx prisma db push
npm run build
pm2 start npm --name jadwal -- start -- -p 3000
pm2 save && pm2 startup
```
Lalu pasang Nginx/Caddy sebagai reverse proxy ke `localhost:3000` dan aktifkan HTTPS.

## Opsi C: Komputer/server sekolah (jaringan lokal)

Jalankan Opsi B di PC/server sekolah, isi `COOKIE_SECURE=false`, dan akses lewat `http://IP-PC:3000` dari jaringan sekolah. Pastikan firewall Windows mengizinkan port 3000 dan PC tidak tidur.

## Checklist keamanan sebelum online

- [x] `JWT_SECRET` wajib diisi (aplikasi menolak login jika kosong di production).
- [x] Semua API tulis & `/api/roster/*` kini butuh login admin (middleware). Hanya `GET /api/master` yang publik (untuk halaman jadwal guru/siswa).
- [x] Kredensial default tidak lagi ditampilkan di halaman login saat production.
- [ ] Isi `ADMIN_PASSWORD` yang kuat sebelum login pertama (jika kosong → `password123`).
- [ ] Backup `app.db` berkala.
