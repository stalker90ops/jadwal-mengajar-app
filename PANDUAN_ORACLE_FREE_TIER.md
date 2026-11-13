# Panduan Lengkap: Hosting Gratis Selamanya di Oracle Cloud Free Tier
## Menggunakan Docker + SQLite Permanen untuk Aplikasi Jadwal Mengajar

Panduan langkah demi langkah (step-by-step) untuk mengaktifkan VPS gratis selamanya di Oracle Cloud Infrastructure (OCI), memasang Docker, dan menjalankan aplikasi Jadwal Mengajar dengan database SQLite yang tersimpan aman di disk permanen.

---

### Tahap 1: Pendaftaran Akun Oracle Cloud Free Tier

1. Kunjungi: **[oracle.com/cloud/free](https://www.oracle.com/cloud/free/)**
2. Klik tombol **"Start for free"**.
3. Isi data diri:
   * **Country/Region**: Indonesia
   * **Email**: Gunakan email aktif Anda
   * **Home Region**: Pilih region terdekat untuk kecepatan akses terbaik (disarankan: **Singapore** atau **Tokyo / Sydney**). *Catatan: Home Region tidak dapat diubah setelah akun dibuat.*
4. **Verifikasi Kartu (Syarat Wajib Oracle)**:
   * Oracle mewajibkan kartu Debit/Kredit (Visa/Mastercard, misal: Bank Jago, Jenius BTPN, BCA Mastercard, Mandiri, atau CIMB).
   * Oracle akan melakukan *hold/tes saldo* sekitar Rp 15.000 - Rp 20.000 untuk memverifikasi keaslian identitas manusia, dan saldo tersebut akan langsung dikembalikan otomatis. Anda **tidak akan ditagih biaya bulanan** selama memilih tipe *Always Free Eligible*.
5. Setelah pendaftaran diverifikasi, login ke **Oracle Cloud Console**.

---

### Tahap 2: Membuat Virtual Machine (VPS) Gratis

1. Di dashboard Oracle Cloud, klik menu garis tiga di kiri atas (☰) &rarr; **Compute** &rarr; **Instances** &rarr; Klik **Create instance**.
2. **Name**: Beri nama, misalnya: `server-jadwal-sekolah`.
3. **Placement**: Biarkan default (Availability Domain 1).
4. **Image and shape**:
   * Klik **Edit** &rarr; Image pilih: **Ubuntu 22.04 LTS** atau **Ubuntu 24.04**.
   * Shape: Pilih salah satu dari dua opsi *Always Free*:
     * **Opsi A (Paling Kuat - Ampere ARM)**: Pilih *Ampere* &rarr; *VM.Standard.A1.Flex* (bisa dialokasikan hingga 2-4 OCPU dan 12-24 GB RAM, 100% Gratis).
     * **Opsi B (AMD Standar x86)**: Pilih *Specialty and legacy* &rarr; *VM.Standard.E2.1.Micro* (1 OCPU, 1 GB RAM).
5. **Networking**:
   * Biarkan membuat VCN baru otomatis.
   * Pastikan opsi **Assign a public IPv4 address** terpilih **Yes** (agar server mendapatkan alamat IP publik yang bisa diakses via internet).
6. **Add SSH keys**:
   * Pilih **Generate SSH key pair**.
   * Klik **Save private key** (akan terunduh file, misal `ssh-key-2026-11-12.key`). **Simpan file ini baik-baik!** File ini adalah kunci rahasia untuk masuk ke server Anda.
7. **Boot volume**:
   * Biarkan default (50 GB - 100 GB, Always Free menggratiskan hingga 200 GB total disk).
8. Klik tombol **Create** di bagian bawah.
9. Tunggu 1–2 menit hingga status instance berubah menjadi kotak hijau bertuliskan **Running**. Catat **Public IP Address** server Anda (misalnya: `140.238.xxx.xxx`).

---

### Tahap 3: Buka Port Firewall di Oracle Cloud

Secara default, Oracle memblokir semua port kecuali port SSH (22). Agar aplikasi web bisa dibuka dari internet, kita harus membuka port **80 (HTTP)**, **443 (HTTPS)**, dan **3000**:

1. Pada halaman detail instance Anda, klik nama subnet di bawah bagian **Instance access / Primary VNIC** (misal: *subnet-xxxx*).
2. Klik **Default Security List for...**.
3. Klik tombol **Add Ingress Rules**:
   * **Source CIDR**: `0.0.0.0/0` (artinya bisa diakses dari seluruh internet)
   * **IP Protocol**: `TCP`
   * **Destination Port Range**: `80,443,3000`
   * **Description**: `Web Jadwal Mengajar`
4. Klik **Add Ingress Rules**.

---

### Tahap 4: Masuk ke Server via SSH

Buka PowerShell di laptop Anda, lalu jalankan perintah berikut (sesuaikan nama file key dan IP server Anda):

```powershell
# Berikan permission yang aman ke file key (khusus Windows)
icacls "C:\Users\Dapodik\Downloads\ssh-key-server.key" /inheritance:r
icacls "C:\Users\Dapodik\Downloads\ssh-key-server.key" /grant:r "$($env:USERNAME):(R)"

# Hubungkan ke server via SSH (user default Ubuntu adalah: ubuntu)
ssh -i "C:\Users\Dapodik\Downloads\ssh-key-server.key" ubuntu@140.238.xxx.xxx
```

Begitu terhubung, Anda akan berada di dalam terminal Linux Ubuntu server Oracle Anda.

---

### Tahap 5: Buka Firewall Internal Ubuntu & Pasang Docker

Jalankan perintah berikut di dalam terminal server Ubuntu Anda:

```bash
# 1. Update sistem & buka firewall internal iptables Ubuntu
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || sudo apt install -y iptables-persistent && sudo netfilter-persistent save

# 2. Pasang Docker & Docker Compose resmi dalam 1 baris
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

### Tahap 6: Download & Jalankan Aplikasi Jadwal Mengajar

Masih di dalam terminal server Ubuntu:

```bash
# 1. Download kode proyek dari GitHub Anda
git clone https://github.com/stalker90ops/jadwal-mengajar-app.git jadwal
cd jadwal

# 2. Buat file konfigurasi .env
cat << 'EOF' > .env
JWT_SECRET=super_kunci_rahasia_sekolah_bebas_bentrok_2026_xyz
ADMIN_EMAIL=admin@sekolah.sch.id
ADMIN_PASSWORD=KurikulumJuara2026!
COOKIE_SECURE=false
DATABASE_URL=file:/data/app.db
PORT=3000
EOF

# 3. Jalankan aplikasi menggunakan Docker Compose
docker compose up -d --build
```

Docker akan mengompilasi dan mengemas aplikasi secara otomatis di dalam server. Database SQLite akan diletakkan di volume folder `/data/app.db` yang tersimpan permanen di harddisk server Oracle Anda.

---

### Tahap 7: Buka Aplikasi di Browser

Buka Google Chrome di laptop atau HP Anda, lalu ketikkan:
```
http://IP_PUBLIC_SERVER_ANDA:3000
```
*(Contoh: `http://140.238.123.45:3000`)*

- **Halaman Jadwal Guru & Siswa**: langsung muncul di halaman utama.
- **Login Kurikulum**: Klik menu login atau buka `http://IP_PUBLIC_SERVER_ANDA:3000/roster/login`
  * **Email**: `admin@sekolah.sch.id`
  * **Password**: `KurikulumJuara2026!` *(atau password yang Anda isi di file .env tadi)*

---

### 🛡️ Tips Perawatan Server:

1. **Backup Database SQLite**:
   Jika ingin mendownload cadangan database ke laptop Anda sewaktu-waktu:
   ```bash
   docker compose cp app:/data/app.db ./backup-jadwal.db
   ```
2. **Update Aplikasi saat ada perubahan kode**:
   ```bash
   cd ~/jadwal
   git pull
   docker compose up -d --build
   ```
   *Data jadwal tidak akan pernah terhapus saat update karena tersimpan di persistent disk volume.*
