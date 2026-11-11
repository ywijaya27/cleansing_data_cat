/**
 * Konfigurasi Aplikasi Cleansing Data & Material Intelligence
 * Pengaturan endpoint backend & Supabase
 */
window.APP_CONFIG = {
  // Mode koneksi: 'api' (menggunakan Backend Node.js / Express) atau 'direct' (Supabase langsung)
  MODE: 'api',

  // URL Backend Node.js Express (kosongkan jika frontend dan backend di-host dalam domain yang sama)
  API_BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api',

  // Konfigurasi Database Supabase PostgreSQL
  SUPABASE_URL: 'https://tayybadwfypmedjixemd.supabase.co',
  
  // Versi Aplikasi
  VERSION: '2.0.0-github'
};
