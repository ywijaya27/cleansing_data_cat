# Penerapan perbaikan role dan Cek Konsistensi

Konfigurasi aktif proyek ini adalah frontend Vercel dengan backend Google Apps Script (`js/config.js`). Perubahan lokal belum memperbarui deployment atau database produksi.

## Urutan penerapan

1. Jalankan `database/MIGRATE_RBAC_CONSISTENCY.sql` di SQL Editor Supabase. Skrip menambah tiga kolom izin tanpa mengganti menu atau izin lama. Jangan menjalankan ulang bagian seed `SETUP_USER_MANAGEMENT.sql` pada database yang sudah dikonfigurasi karena seed tersebut menimpa izin lama.
2. Pastikan akun ADMIN aktif benar-benar ada pada tabel `app_users`. Login cadangan berbasis password bawaan telah dihapus. Akun yang sudah ada di database tetap digunakan. Untuk instalasi baru, isi `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` melalui Script Properties di editor Apps Script sebelum login.
3. Perbarui proyek Apps Script dengan `apps-script/Code.gs`, file baru `apps-script/AccessPolicy.gs`, serta `Index.html`, `JavaScript.html`, dan `Stylesheet.html`. File `AccessPolicy.gs` wajib disertakan. Hapus salinan lama fungsi publik bisnis jika pernah disimpan dalam file `.gs` lain; satu-satunya pintu API bisnis adalah `apiRequest`.
4. Pada **Deploy → Manage deployments**, edit deployment Web App yang ada dan pilih versi baru agar URL `/exec` tetap sama. Backend baru menolak frontend lama yang belum mengirim token: terapkan pembaruan frontend segera setelahnya dalam waktu pemeliharaan.
5. Commit/push perubahan frontend ke GitHub yang terhubung ke Vercel, lalu pastikan deployment selesai. Jika URL backend berubah, perbarui `GAS_URL` di `js/config.js` terlebih dahulu.
6. Login ulang. Sesi dari versi lama memang tidak berlaku. Pada **User & Hak Akses → OPERATOR**, aktifkan menu **Cek Konsistensi** serta **Jalankan audit konsistensi**, dan **Ekspor hasil konsistensi** bila diperlukan. Aktifkan **Konfirmasi / tolak duplikat** untuk operator yang bertugas melakukan review. Izin baru dimulai dari nonaktif; ADMIN memiliki akses penuh.

## Perilaku role

- GUEST tetap dapat melihat menu baca yang diizinkan; tidak dapat menjalankan tindakan tulis, audit atau ekspor konsistensi.
- OPERATOR menggunakan menu dan izin tindakan yang dikonfigurasi. Sesi dipulihkan setelah refresh melalui verifikasi backend.
- ADMIN memiliki akses penuh yang tetap; checkbox izin ADMIN tidak dapat diubah agar tidak memberi kesan pembatasan yang sebenarnya tidak berlaku.
- Akses Laporan Efisiensi mengikuti checkbox menu, bukan pengecualian otomatis.
- Setiap request yang dilindungi memeriksa akun aktif dan izin terbaru dari database. Identitas reviewer berasal dari sesi server, bukan parameter yang dikirim browser.
- Sesi berlaku paling lama enam jam. Cache Apps Script dapat menghapus sesi lebih awal; pengguna harus login kembali. Backend Node menyimpan sesi dalam memori, sehingga restart mengakhiri sesi dan penggunaan multi-instance memerlukan penyimpanan sesi bersama.
- Mode `direct` dan fallback ke Supabase langsung dinonaktifkan karena tidak dapat menjamin pembatasan role dengan service key di browser.

## Cek Konsistensi

Membuka menu tidak langsung menjalankan audit. Tombol audit membaca semua halaman data, bukan hanya halaman pertama. Template yang kosong tidak lagi otomatis dianggap `GEN-01`/`SVC-01`, sehingga temuan template belum ditentukan tetap terlihat. Perubahan ini tidak mengisi atau mengubah template di database.

Hasil audit masih berada dalam memori tab browser; belum ada penyimpanan hasil audit untuk dibagikan ke pengguna lain. Izin ekspor mengendalikan tombol dan endpoint otorisasi ekspor aplikasi, bukan mencegah pengguna menyalin data yang telah mereka lihat. Audit besar belum diuji dengan database produksi atau 100.000 baris. Pembacaan halaman bukan snapshot transaksi; hindari upload/perubahan katalog selama audit agar hasil konsisten.

## Pemeriksaan lokal

```powershell
node scripts/sync-apps-script.cjs
node --test tests/rbac.test.cjs
node --check js/app.js
node --check js/api.js
node --check backend/server.js
git diff --check
```

`scripts/sync-apps-script.cjs` menghasilkan frontend Apps Script dan salinan kebijakan dari frontend utama. Jalankan kembali setelah mengubah HTML/CSS/JS; jangan mengedit salinan hasil generator secara terpisah.

Pengujian memakai database dan layanan Apps Script tiruan: mencakup izin, penolakan sesi palsu, logout, penonaktifan akun, perubahan izin, identitas reviewer, sesi Operator, adapter HTTP, dan pagination audit. Pengujian ini tidak menggantikan pemeriksaan deployment nyata.

Setelah deployment, uji GUEST, OPERATOR, dan ADMIN: login/refresh/logout, larangan upload/merge tanpa izin, pembatasan laporan, serta audit dan ekspor dengan izin diaktifkan dan dinonaktifkan.
