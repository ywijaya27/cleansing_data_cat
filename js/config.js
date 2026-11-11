/**
 * Konfigurasi Aplikasi Cleansing Data & Material Intelligence
 * Pengaturan endpoint backend & Supabase
 */
window.APP_CONFIG = {
  // 'auto': menggunakan Direct Supabase di GitHub Pages (*.github.io), dan Node API di localhost
  MODE: 'auto',

  // URL Backend Node.js Express (untuk dev lokal)
  API_BASE_URL: 'http://localhost:5000/api',

  // Konfigurasi Database Supabase PostgreSQL
  SUPABASE_URL: 'https://tayybadwfypmedjixemd.supabase.co',

  // Kunci API Supabase (dapat juga disimpan melalui menu Pengaturan di aplikasi)
  SUPABASE_KEY: '',

  // Versi Aplikasi
  VERSION: '2.1.0-github'
};
