/**
 * Konfigurasi Aplikasi Cleansing Data & Material Intelligence
 * Menggunakan Google Apps Script Web App sebagai Backend REST API
 */
window.APP_CONFIG = {
  // Mode koneksi utama: 'appscript' (Backend Google Apps Script)
  // Opsi lain: 'api' (Node.js/Express) atau 'direct' (Supabase langsung)
  MODE: 'appscript',

  // Masukkan URL Web App Google Apps Script Anda di sini:
  // Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxb1A_cF7CHNlRKARSdC4B2RN6FV3iFRpJHkJ4QgC9s13J_7ZZo051bhUBeVstO_862/exec',

  // URL Backend Node.js Express (opsional jika menggunakan mode 'api')
  API_BASE_URL: 'http://localhost:5000/api',

  // Konfigurasi Database Supabase PostgreSQL (dikelola oleh backend Apps Script)
  SUPABASE_URL: 'https://tayybadwfypmedjixemd.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRheXliYWR3ZnlwbWVkaml4ZW1kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDM3MDM2NSwiZXhwIjoyMTA5OTQ2MzY1fQ.g9ZMpG2oYyMt4LsB0VzqC1r2lNNRKDmzwaTe13IS5Us',

  // Versi Aplikasi
  VERSION: '2.2.0-appscript'
};
