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
  GAS_URL: '',

  // URL Backend Node.js Express (opsional jika menggunakan mode 'api')
  API_BASE_URL: 'http://localhost:5000/api',

  // Konfigurasi Database Supabase PostgreSQL (dikelola oleh backend Apps Script)
  SUPABASE_URL: 'https://tayybadwfypmedjixemd.supabase.co',
  SUPABASE_KEY: '',

  // Versi Aplikasi
  VERSION: '2.2.0-appscript'
};
