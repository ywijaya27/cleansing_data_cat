# 🚀 AI Material Master Cleansing, Duplicate Review & Similarity System

Sistem cerdas manajemen katalog material (*Material Master Data*) berbasis AI untuk standarisasi deskripsi, deteksi duplikasi barang, pencocokan kesamaan (*similarity cross-reference*), dan rasionalisasi inventori dengan arsitektur modern terpisah (**Decoupled Frontend + REST API Backend + Supabase PostgreSQL**).

---

## 🏗️ Arsitektur Sistem

Proyek ini telah dimigrasikan dari Google Apps Script menjadi arsitektur modern yang siap di-host di **GitHub Pages** (frontend) dan server Node.js / Serverless (backend):

```text
├── index.html                  # Frontend Entrypoint (Kompatibel dengan GitHub Pages)
├── css/
│   └── style.css               # Styling & Design System Dark/Light Theme
├── js/
│   ├── config.js               # Pengaturan Endpoint API & Supabase URL
│   ├── api.js                  # Client Adapter REST API (Pengganti google.script.run)
│   └── app.js                  # Logika Utama UI, RBAC, Charts & State Management
├── backend/                    # Backend REST API (Node.js & Express)
│   ├── server.js               # Express Server & Supabase REST Connector
│   ├── package.json            # Dependensi Node.js
│   ├── .env.example            # Contoh Environment Variables
│   └── .env                    # Konfigurasi Lokal Server
├── database/                   # Skrip DDL & Stored Procedure PostgreSQL (Supabase)
│   ├── SETUP_SUPABASE.sql              # Skrip Tabel Utama, Trigger, & Views
│   ├── SETUP_AI_CLEANSING_ENGINE.sql   # AI Duplicate Scoring & Stored Procedure
│   └── SETUP_USER_MANAGEMENT.sql       # RBAC & Manajemen Akun User
├── apps-script/                # Versi Arsip Google Apps Script (Legacy)
│   ├── Code.gs
│   ├── Index.html
│   ├── Stylesheet.html
│   └── JavaScript.html
└── templates/
    └── template_material_master.xlsx   # Template Upload Data Excel (20.000+ Baris)
```

---

## ⚡ Fitur Utama

1. **Executive Dashboard & Analytics**:
   - Total material, estimasi potensi penghematan (*cost savings*), skor kualitas data (completeness), dan distribusi kategori material.
2. **Katalog Material Master**:
   - Pencarian real-time berkecepatan tinggi, pagination dinamis, dan inspeksi detail material.
3. **Upload Material Excel (.xlsx) & CSV**:
   - Batch parser otomatis untuk puluhan ribu data material master.
4. **AI Duplicate Review & Clustering**:
   - Candidate pair generator, skor kesamaan multi-faktor (Part Number, Manufacturer, Description, Attribute).
   - Side-by-side comparison, explainability AI, pemilihan Golden Record, dan eksekusi Merge/Obsolete.
5. **Similarity Detection Engine**:
   - Pemetaan material alternatif, spesifikasi ekuivalen, dan cross-reference merk (*brand interchangeability*).
6. **Role-Based Access Control (RBAC) & Guest Mode**:
   - Pengunjung publik / guest dapat melihat menu umum tanpa perlu login.
   - Administrator login untuk mengelola hak akses per peran, upload data, dan eksekusi AI engine.
   - Akun default: `admin` / `admin123`.

---

## 🛠️ Panduan Menjalankan Sistem Lokal

### 1. Prasyarat
- **Node.js**: Versi 18+ (disarankan Node.js 20 atau 24)
- **Supabase**: Akun database PostgreSQL di [Supabase](https://supabase.com)

### 2. Setup Database Supabase
Jalankan ketiga skrip SQL di folder `database/` secara berurutan pada **Supabase SQL Editor**:
1. `database/SETUP_SUPABASE.sql`
2. `database/SETUP_AI_CLEANSING_ENGINE.sql`
3. `database/SETUP_USER_MANAGEMENT.sql`

### 3. Menjalankan Backend Node.js
1. Masuk ke folder backend:
   ```bash
   cd backend
   ```
2. Salin file `.env.example` menjadi `.env` dan masukkan `SUPABASE_SERVICE_ROLE_KEY`:
   ```bash
   cp .env.example .env
   ```
3. Pasang dependensi dan jalankan server:
   ```bash
   npm install
   npm start
   ```
4. Server REST API dan antarmuka web akan berjalan di `http://localhost:5000`.

---

## 🌐 Panduan Deploy ke GitHub & GitHub Pages

### 1. Inisialisasi Git dan Push ke Repositori
Jalankan perintah ini di terminal root direktori:

```bash
git init
git add .
git commit -m "feat: migrasi sistem cleansing data ke arsitektur decoupled github"
git branch -M main
git remote add origin https://github.com/ywijaya27/cleansing_data_cat.git
git push -u origin main
```

*(Saat diminta password di terminal, masukkan **GitHub Personal Access Token / PAT**, bukan password akun).*

### 2. Mengaktifkan GitHub Pages (Hosting Frontend Gratis)
1. Buka repositori Anda di GitHub: `https://github.com/ywijaya27/cleansing_data_cat`.
2. Klik tab **Settings** > **Pages** di menu samping kiri.
3. Pada bagian **Build and deployment** > **Source**, pilih **Deploy from a branch**.
4. Pilih Branch: **`main`** dan Folder: **`/ (root)`**, lalu klik **Save**.
5. Tunggu 1-2 menit hingga URL GitHub Pages aktif (misalnya `https://ywijaya27.github.io/cleansing_data_cat/`).

---

## 📄 Lisensi
Hak Cipta © 2026 ywijaya27. Dilisensikan di bawah Lisensi MIT.
