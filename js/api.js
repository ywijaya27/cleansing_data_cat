/**
 * Client API Adapter
 * Menghubungkan antarmuka frontend ke Backend REST API (Node.js/Express)
 * atau fallback ke Google Apps Script (jika dijalankan di Apps Script Web App).
 */
(() => {
  'use strict';

  const config = window.APP_CONFIG || {
    API_BASE_URL: 'http://localhost:5000/api'
  };

  /**
   * Helper fetch HTTP request dengan timeout & JSON parsing
   */
  async function http(endpoint, options = {}) {
    const baseUrl = (config.API_BASE_URL || '').replace(/\/$/, '');
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    // Sertakan session token jika ada
    try {
      const savedSession = sessionStorage.getItem('admin_session');
      if (savedSession) {
        const u = JSON.parse(savedSession);
        if (u && u.token) {
          headers['Authorization'] = `Bearer ${u.token}`;
        }
      }
    } catch (_) {}

    const res = await fetch(url, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
  }

  /**
   * Fungsi sentral callServer untuk kompatibilitas penuh dengan kode UI
   */
  window.callServer = async function(name, ...args) {
    // 1. Cek jika berjalan di lingkungan Google Apps Script
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(r => {
            if (r && r.success) resolve(r);
            else reject(new Error(r?.message || 'Proses gagal.'));
          })
          .withFailureHandler(e => {
            reject(new Error(e?.message || String(e)));
          })[name](...args);
      });
    }

    // 2. Berjalan di Mode Standalone / GitHub Pages -> REST API Backend
    switch (name) {
      case 'getAppStatus':
        return await http('/status');

      case 'getDashboardSummary':
        return await http('/materials/dashboard-summary');

      case 'getMaterialMaster': {
        const [page = 1, pageSize = 25, search = ''] = args;
        return await http(`/materials?page=${page}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
      }

      case 'uploadMasterData': {
        const [rows = [], fileName = ''] = args;
        return await http('/upload', {
          method: 'POST',
          body: JSON.stringify({ rows, fileName })
        });
      }

      case 'getUploadHistory':
        return await http('/upload/history');

      case 'runAiCleansingAnalysis':
        return await http('/duplicates/run-ai', {
          method: 'POST',
          body: JSON.stringify({})
        });

      case 'getDuplicates': {
        const [status = 'ALL', minScore = 0] = args;
        return await http(`/duplicates?status=${encodeURIComponent(status)}&minScore=${minScore}`);
      }

      case 'saveDuplicateDecision': {
        const [candidateId, decision, selectedMaster, notes, reviewerName] = args;
        return await http('/duplicates/decision', {
          method: 'POST',
          body: JSON.stringify({ candidateId, decision, selectedMaster, notes, reviewerName })
        });
      }

      case 'getApprovedDuplicatesReport': {
        const [status = 'APPROVED_DUPLICATE'] = args;
        return await http(`/reports/approved-duplicates?status=${encodeURIComponent(status)}`);
      }

      case 'getSimilarMaterials': {
        const [limit = 200] = args;
        return await http(`/similarity?limit=${limit}`);
      }

      case 'loginUser': {
        const [username, password] = args;
        return await http('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
      }

      case 'getSystemAccessControl':
        return await http('/auth/access-control');

      case 'getUserManagementData':
        return await http('/users');

      case 'saveRolePermissions': {
        const [roleKey, allowedMenus, permissionsObj] = args;
        return await http('/users/permissions', {
          method: 'POST',
          body: JSON.stringify({ roleKey, allowedMenus, permissionsObj })
        });
      }

      case 'saveAppUser': {
        const [userData] = args;
        return await http('/users', {
          method: 'POST',
          body: JSON.stringify({ userData })
        });
      }

      case 'deleteAppUser': {
        const [userId, username] = args;
        return await http(`/users/${userId}?username=${encodeURIComponent(username || '')}`, {
          method: 'DELETE'
        });
      }

      case 'setupSupabaseConfig': {
        const [url, key] = args;
        return await http('/settings/supabase', {
          method: 'POST',
          body: JSON.stringify({ url, key })
        });
      }

      case 'testSupabaseConnection':
        return await http('/settings/test-connection');

      default:
        throw new Error(`Endpoint untuk aksi "${name}" tidak ditemukan.`);
    }
  };
})();
