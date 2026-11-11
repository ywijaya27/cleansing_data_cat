/**
 * Client API Adapter
 * Menghubungkan antarmuka frontend ke:
 * 1. Google Apps Script Web App (Mode 'appscript' / GAS REST API via fetch)
 * 2. Lingkungan Internal Apps Script (via native google.script.run)
 * 3. Database Supabase PostgreSQL secara langsung (Direct Mode - untuk hosting statis tanpa backend)
 * 4. Backend REST API Node.js / Express (Mode 'api' di localhost)
 */
(() => {
  'use strict';

  const config = window.APP_CONFIG || {
    MODE: 'appscript',
    GAS_URL: '',
    API_BASE_URL: 'http://localhost:5000/api',
    SUPABASE_URL: 'https://tayybadwfypmedjixemd.supabase.co',
    SUPABASE_KEY: ''
  };

  /**
   * Helper Pengambilan Kredensial & URL
   */
  const getGasUrl = () => {
    return (localStorage.getItem('gas_url') || config.GAS_URL || '').trim();
  };

  const getSupabaseUrl = () => {
    return (localStorage.getItem('supabase_url') || config.SUPABASE_URL || 'https://tayybadwfypmedjixemd.supabase.co').replace(/\/$/, '');
  };

  const getSupabaseKey = () => {
    return localStorage.getItem('supabase_key') || config.SUPABASE_KEY || '';
  };

  /**
   * Helper Request ke Google Apps Script Web App (POST dengan text/plain anti-CORS preflight)
   */
  async function callGasWebApi(action, args = []) {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
      throw new Error('Google Apps Script Web App URL belum diisi. Masukkan URL Web App di menu Pengaturan atau di js/config.js.');
    }

    const payload = JSON.stringify({ action, args });
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // WAJIB text/plain agar tidak memicu CORS OPTIONS preflight ditolak GAS
      },
      body: payload
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(errTxt || `GAS Web App HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      throw new Error(data.message || 'Eksekusi Google Apps Script gagal.');
    }
    return data;
  }

  /**
   * Helper SHA-256 Hash di Browser via Web Crypto API
   */
  async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Helper Request langsung ke Supabase REST API (PostgREST)
   */
  async function supabaseRequest(endpoint, options = {}) {
    const url = getSupabaseUrl();
    const key = getSupabaseKey();

    if (!key) {
      throw new Error('Supabase Key belum dimasukkan. Buka menu Pengaturan untuk memasukkan Service Role Key Supabase Anda.');
    }

    const fullUrl = `${url}/rest/v1/${endpoint.replace(/^\//, '')}`;
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    };

    const res = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const errText = await res.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch (_) { errJson = { message: errText }; }
      throw new Error(errJson.message || `Supabase HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch (_) {
      return text;
    }
  }

  /**
   * Helper fetch HTTP request ke Backend Node.js / Express
   */
  async function backendHttp(endpoint, options = {}) {
    const baseUrl = (config.API_BASE_URL || '').replace(/\/$/, '');
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    try {
      const savedSession = sessionStorage.getItem('admin_session');
      if (savedSession) {
        const u = JSON.parse(savedSession);
        if (u && u.token) headers['Authorization'] = `Bearer ${u.token}`;
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
   * Handler Direct Supabase untuk seluruh aksi sistem (Fallback)
   */
  async function executeDirectSupabase(name, ...args) {
    const sUrl = getSupabaseUrl();
    const sKey = getSupabaseKey();

    switch (name) {
      case 'getAppStatus': {
        if (!sKey) {
          return {
            success: true,
            data: {
              configured: false,
              connectionOk: false,
              url: sUrl,
              connMessage: 'Supabase Key belum dimasukkan. Buka menu Pengaturan.'
            }
          };
        }
        try {
          await supabaseRequest('material_raw?select=id&limit=1');
          return {
            success: true,
            data: {
              configured: true,
              connectionOk: true,
              url: sUrl,
              connMessage: 'Terhubung ke database Supabase PostgreSQL.'
            }
          };
        } catch (err) {
          return {
            success: true,
            data: {
              configured: false,
              connectionOk: false,
              url: sUrl,
              connMessage: 'Koneksi gagal: ' + err.message
            }
          };
        }
      }

      case 'setupSupabaseConfig': {
        const [url, key] = args;
        if (!url) throw new Error('Project URL Supabase wajib diisi.');
        if (!key) throw new Error('Service Role Key wajib diisi.');

        const cleanUrl = url.trim().replace(/\/$/, '');
        const cleanKey = key.trim();

        const testRes = await fetch(`${cleanUrl}/rest/v1/material_raw?select=id&limit=1`, {
          headers: {
            'apikey': cleanKey,
            'Authorization': `Bearer ${cleanKey}`
          }
        });

        if (!testRes.ok) {
          const errText = await testRes.text();
          throw new Error('Gagal terhubung ke Supabase: ' + (errText || testRes.statusText));
        }

        localStorage.setItem('supabase_url', cleanUrl);
        localStorage.setItem('supabase_key', cleanKey);

        return {
          success: true,
          data: { url: cleanUrl },
          message: 'Koneksi ke Supabase BERHASIL dan disimpan di browser!'
        };
      }

      case 'testSupabaseConnection': {
        await supabaseRequest('material_raw?select=id&limit=1');
        return { success: true, message: 'Koneksi ke Supabase PostgreSQL BERHASIL!' };
      }

      case 'loginUser': {
        const [username, password] = args;
        if (!username || !password) throw new Error('Username dan password wajib diisi.');
        const uName = username.trim().toLowerCase();
        const pHash = await sha256Hex(password);

        const users = await supabaseRequest(`app_users?username=eq.${encodeURIComponent(uName)}&is_active=eq.true&limit=1`);
        if (!users || !users.length) throw new Error('Username atau password salah.');
        const user = users[0];
        if (user.password_hash !== pHash) throw new Error('Username atau password salah.');

        let permissions = null;
        try {
          const perms = await supabaseRequest(`app_role_permissions?role=eq.${encodeURIComponent(user.role)}&limit=1`);
          if (perms && perms[0]) {
            permissions = perms[0];
            if (typeof permissions.allowed_menus === 'string') {
              try { permissions.allowed_menus = JSON.parse(permissions.allowed_menus); } catch (_) {}
            }
          }
        } catch (_) {}

        return {
          success: true,
          data: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
            permissions: permissions || {}
          },
          message: 'Login berhasil.'
        };
      }

      case 'getSystemAccessControl': {
        let allRoles = [];
        try {
          allRoles = await supabaseRequest('app_role_permissions?select=*') || [];
          allRoles.forEach(r => {
            if (typeof r.allowed_menus === 'string') {
              try { r.allowed_menus = JSON.parse(r.allowed_menus); } catch (_) {}
            }
          });
        } catch (_) {}

        return {
          success: true,
          data: {
            allRoles,
            guestPermissions: allRoles.find(r => r.role === 'GUEST') || {
              role: 'GUEST',
              allowed_menus: ['dashboard', 'materials', 'similarity', 'reports'],
              can_upload: false,
              can_run_ai: false,
              can_merge: false,
              can_manage_settings: false
            }
          }
        };
      }

      case 'getDashboardSummary': {
        try {
          const rows = await supabaseRequest('vw_dashboard_summary?limit=1');
          if (rows && rows.length) return { success: true, data: rows[0] };
        } catch (_) {}

        const [allMat, allDup, allSim] = await Promise.all([
          supabaseRequest('material_raw?select=id,status,stock_qty,stock_value,material_group'),
          supabaseRequest('duplicate_analysis?select=potential_saving,review_status'),
          supabaseRequest('similar_material?select=saving_opportunity')
        ]);

        const totalMat = allMat?.length || 0;
        const dupCount = allDup?.length || 0;
        const simCount = allSim?.length || 0;
        const pendingReview = allDup?.filter(x => x.review_status === 'PENDING').length || 0;
        const totalSavings = (allDup || []).reduce((acc, x) => acc + (Number(x.potential_saving) || 0), 0) +
                             (allSim || []).reduce((acc, x) => acc + (Number(x.saving_opportunity) || 0), 0);

        const groupMap = {};
        (allMat || []).forEach(m => {
          const g = m.material_group || 'OTHER';
          groupMap[g] = (groupMap[g] || 0) + 1;
        });
        const groupDistribution = Object.keys(groupMap).map(k => ({ group: k, count: groupMap[k] }));

        return {
          success: true,
          data: {
            total_materials: totalMat,
            duplicated_count: dupCount,
            similar_count: simCount,
            potential_savings: totalSavings,
            data_quality_score: totalMat > 0 ? Math.max(50, Math.min(100, Math.round(100 - (dupCount / totalMat * 100)))) : 98,
            pending_review_count: pendingReview,
            group_distribution: groupDistribution
          }
        };
      }

      case 'getMaterialMaster': {
        const [page = 1, pageSize = 25, search = ''] = args;
        const offset = (page - 1) * pageSize;
        let q = `material_raw?order=created_at.desc&limit=${pageSize}&offset=${offset}`;
        if (search) {
          const sc = encodeURIComponent(`%${search.trim()}%`);
          q += `&or=(material_code.ilike.${sc},material_description.ilike.${sc},manufacturer.ilike.${sc},part_number.ilike.${sc})`;
        }
        const rows = await supabaseRequest(q, { prefer: 'count=exact' });
        return { success: true, data: rows || [] };
      }

      case 'uploadMasterData': {
        const [rows = [], fileName = ''] = args;
        if (!rows.length) throw new Error('Data upload kosong.');

        const cleanRows = rows.map((r, i) => {
          const code = String(r.material_code || r.MATERIAL_CODE || r.Material_Code || `MAT-${100000 + i}`).trim();
          const desc = String(r.material_description || r.MATERIAL_DESCRIPTION || r.Deskripsi || '').trim();
          const mfr = String(r.manufacturer || r.MANUFACTURER || '-').trim();
          const pn = String(r.part_number || r.PART_NUMBER || '-').trim();
          const normPn = pn.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const grp = String(r.material_group || r.MATERIAL_GROUP || 'GENERAL').trim().toUpperCase();
          const uom = String(r.base_uom || r.BASE_UOM || 'EA').trim().toUpperCase();
          const qty = parseFloat(r.stock_qty || r.STOCK_QTY || 0) || 0;
          const val = parseFloat(r.stock_value || r.STOCK_VALUE || 0) || 0;

          return {
            material_code: code,
            material_description: desc,
            manufacturer: mfr,
            part_number: pn,
            normalized_part_number: normPn,
            material_group: grp,
            base_uom: uom,
            stock_qty: qty,
            stock_value: val,
            status: 'ACTIVE_RAW',
            data_completeness: (code && desc && mfr !== '-' && pn !== '-') ? 100 : 75
          };
        });

        try {
          await supabaseRequest('upload_history', {
            method: 'POST',
            body: [{
              file_name: fileName || 'Upload_Master_' + new Date().toISOString().slice(0, 10),
              total_rows: cleanRows.length,
              inserted_rows: cleanRows.length,
              status: 'COMPLETED'
            }]
          });
        } catch (_) {}

        const CHUNK = 500;
        for (let i = 0; i < cleanRows.length; i += CHUNK) {
          const chunk = cleanRows.slice(i, i + CHUNK);
          await supabaseRequest('material_raw', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates',
            body: chunk
          });
        }

        return {
          success: true,
          data: { totalInserted: cleanRows.length },
          message: `Berhasil mengunggah ${cleanRows.length} material.`
        };
      }

      case 'getUploadHistory': {
        const rows = await supabaseRequest('upload_history?order=created_at.desc&limit=10');
        return { success: true, data: rows || [] };
      }

      case 'runAiCleansingAnalysis': {
        const res = await supabaseRequest('rpc/run_ai_duplicate_analysis', { method: 'POST', body: {} });
        return { success: true, data: res, message: 'Analisis AI Duplicate & Similarity selesai.' };
      }

      case 'getDuplicates': {
        const [status = 'ALL', minScore = 0] = args;
        let q = 'duplicate_analysis?order=duplicate_score.desc&limit=250';
        if (status !== 'ALL') q += `&review_status=eq.${encodeURIComponent(status)}`;
        if (minScore > 0) q += `&duplicate_score=gte.${minScore}`;
        const rows = await supabaseRequest(q);
        return { success: true, data: rows || [] };
      }

      case 'saveDuplicateDecision': {
        const [candidateId, decision, selectedMaster, notes, reviewerName] = args;
        if (!candidateId) throw new Error('Candidate ID wajib diisi.');

        await supabaseRequest(`duplicate_analysis?candidate_id=eq.${encodeURIComponent(candidateId)}`, {
          method: 'PATCH',
          body: {
            review_status: decision,
            assigned_reviewer: reviewerName || 'admin',
            review_notes: notes || null,
            reviewed_at: new Date().toISOString()
          }
        });

        if (decision === 'MERGE_AND_OBSOLETE' && selectedMaster) {
          await supabaseRequest(`material_raw?material_code=eq.${encodeURIComponent(selectedMaster)}`, {
            method: 'PATCH',
            body: { status: 'ACTIVE_GOLDEN' }
          });
        }
        return { success: true, message: 'Keputusan review berhasil disimpan.' };
      }

      case 'getSimilarMaterials': {
        const [limit = 200] = args;
        const rows = await supabaseRequest(`similar_material?order=similarity_score.desc&limit=${limit}`);
        return { success: true, data: rows || [] };
      }

      case 'getUserManagementData': {
        const [users, roles] = await Promise.all([
          supabaseRequest('app_users?select=id,username,full_name,role,is_active,created_at&order=created_at.asc'),
          supabaseRequest('app_role_permissions?select=*')
        ]);
        (roles || []).forEach(r => {
          if (typeof r.allowed_menus === 'string') {
            try { r.allowed_menus = JSON.parse(r.allowed_menus); } catch (_) {}
          }
        });
        return { success: true, data: { users: users || [], roles: roles || [] } };
      }

      case 'saveRolePermissions': {
        const [roleKey, allowedMenus, permissionsObj] = args;
        if (!roleKey) throw new Error('Role key wajib diisi.');
        const payload = {
          role: roleKey,
          allowed_menus: Array.isArray(allowedMenus) ? allowedMenus : [],
          can_upload: Boolean(permissionsObj?.can_upload),
          can_run_ai: Boolean(permissionsObj?.can_run_ai),
          can_merge: Boolean(permissionsObj?.can_merge),
          can_manage_settings: Boolean(permissionsObj?.can_manage_settings),
          updated_at: new Date().toISOString()
        };
        await supabaseRequest(`app_role_permissions?role=eq.${encodeURIComponent(roleKey)}`, { method: 'PATCH', body: payload });
        return { success: true, message: `Hak akses peran ${roleKey} berhasil disimpan.` };
      }

      case 'saveAppUser': {
        const [userData] = args;
        if (!userData || !userData.username) throw new Error('Username wajib diisi.');
        const uName = userData.username.trim().toLowerCase();
        const fullName = (userData.full_name || uName).trim();
        const role = userData.role || 'OPERATOR';
        const isActive = userData.is_active !== undefined ? Boolean(userData.is_active) : true;

        if (userData.id) {
          const patchData = { full_name: fullName, role: role, is_active: isActive };
          if (userData.password) patchData.password_hash = await sha256Hex(userData.password);
          await supabaseRequest(`app_users?id=eq.${userData.id}`, { method: 'PATCH', body: patchData });
          return { success: true, message: `Pengguna ${uName} berhasil diperbarui.` };
        } else {
          if (!userData.password) throw new Error('Password wajib diisi untuk pengguna baru.');
          const pHash = await sha256Hex(userData.password);
          const newPayload = [{ username: uName, full_name: fullName, password_hash: pHash, role: role, is_active: isActive }];
          const res = await supabaseRequest('app_users', { method: 'POST', body: newPayload });
          return { success: true, data: res ? res[0] : null, message: `Pengguna ${uName} berhasil ditambahkan.` };
        }
      }

      case 'deleteAppUser': {
        const [userId, username] = args;
        if (String(username).toLowerCase() === 'admin') throw new Error('Akun Administrator utama tidak boleh dihapus.');
        await supabaseRequest(`app_users?id=eq.${userId}`, { method: 'DELETE' });
        return { success: true, message: 'Pengguna berhasil dihapus.' };
      }

      case 'getApprovedDuplicatesReport': {
        const [status = 'APPROVED_DUPLICATE'] = args;
        let q = 'duplicate_analysis?order=potential_saving.desc,duplicate_score.desc&limit=500';
        if (status === 'ALL_APPROVED') q += '&review_status=in.(APPROVED_DUPLICATE,MERGE_AND_OBSOLETE)';
        else if (status) q += `&review_status=eq.${encodeURIComponent(status)}`;

        const rows = await supabaseRequest(q) || [];
        let totalSavings = 0;
        let totalStockVal = 0;
        let scoreSum = 0;
        const clusters = new Set();

        rows.forEach(r => {
          totalSavings += Number(r.potential_saving) || 0;
          totalStockVal += (Number(r.val_a) || 0) + (Number(r.val_b) || 0);
          scoreSum += Number(r.duplicate_score) || 0;
          if (r.cluster_id) clusters.add(r.cluster_id);
        });

        return {
          success: true,
          data: {
            summary: {
              totalApproved: rows.length,
              totalPotentialSavings: totalSavings,
              totalStockValue: totalStockVal,
              avgDuplicateScore: rows.length ? parseFloat((scoreSum / rows.length).toFixed(1)) : 0,
              clustersCount: clusters.size
            },
            items: rows
          }
        };
      }

      default:
        throw new Error(`Aksi "${name}" belum didukung di Direct Supabase mode.`);
    }
  }

  /**
   * Fungsi sentral callServer untuk kompatibilitas penuh dengan seluruh kode antarmuka
   */
  window.callServer = async function(name, ...args) {
    // 1. Lingkungan Asli Google Apps Script (didalam Web App iframe)
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

    // 2. Mode 'appscript' (Memanggil Google Apps Script Web App URL dari GitHub Pages)
    const mode = (config.MODE || 'appscript').toLowerCase();
    const gasUrl = getGasUrl();

    if (mode === 'appscript' || mode === 'gas') {
      if (gasUrl) {
        return await callGasWebApi(name, args);
      } else {
        // Jika GAS_URL belum diisi, fallback otomatis ke Direct Supabase agar aplikasi tetap berfungsi
        console.info('GAS_URL belum diatur, mencoba Direct Supabase mode...');
        return await executeDirectSupabase(name, ...args);
      }
    }

    // 3. Mode 'direct' (Langsung ke Supabase)
    if (mode === 'direct') {
      return await executeDirectSupabase(name, ...args);
    }

    // 4. Mode 'api' (Backend Node.js Express)
    try {
      switch (name) {
        case 'getAppStatus': return await backendHttp('/status');
        case 'getDashboardSummary': return await backendHttp('/materials/dashboard-summary');
        case 'getMaterialMaster': {
          const [page = 1, pageSize = 25, search = ''] = args;
          return await backendHttp(`/materials?page=${page}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
        }
        case 'uploadMasterData': {
          const [rows = [], fileName = ''] = args;
          return await backendHttp('/upload', { method: 'POST', body: JSON.stringify({ rows, fileName }) });
        }
        case 'getUploadHistory': return await backendHttp('/upload/history');
        case 'runAiCleansingAnalysis': return await backendHttp('/duplicates/run-ai', { method: 'POST', body: JSON.stringify({}) });
        case 'getDuplicates': {
          const [status = 'ALL', minScore = 0] = args;
          return await backendHttp(`/duplicates?status=${encodeURIComponent(status)}&minScore=${minScore}`);
        }
        case 'saveDuplicateDecision': {
          const [candidateId, decision, selectedMaster, notes, reviewerName] = args;
          return await backendHttp('/duplicates/decision', {
            method: 'POST',
            body: JSON.stringify({ candidateId, decision, selectedMaster, notes, reviewerName })
          });
        }
        case 'getSimilarMaterials': {
          const [limit = 200] = args;
          return await backendHttp(`/similarity?limit=${limit}`);
        }
        case 'loginUser': {
          const [username, password] = args;
          return await backendHttp('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        }
        case 'getSystemAccessControl': return await backendHttp('/auth/access-control');
        case 'getUserManagementData': return await backendHttp('/users');
        case 'saveRolePermissions': {
          const [roleKey, allowedMenus, permissionsObj] = args;
          return await backendHttp('/users/permissions', { method: 'POST', body: JSON.stringify({ roleKey, allowedMenus, permissionsObj }) });
        }
        case 'saveAppUser': {
          const [userData] = args;
          return await backendHttp('/users', { method: 'POST', body: JSON.stringify({ userData }) });
        }
        case 'deleteAppUser': {
          const [userId, username] = args;
          return await backendHttp(`/users/${userId}?username=${encodeURIComponent(username || '')}`, { method: 'DELETE' });
        }
        case 'setupSupabaseConfig': {
          const [url, key] = args;
          return await backendHttp('/settings/supabase', { method: 'POST', body: JSON.stringify({ url, key }) });
        }
        case 'testSupabaseConnection': return await backendHttp('/settings/test-connection');
        case 'getApprovedDuplicatesReport': {
          const [status = 'APPROVED_DUPLICATE'] = args;
          return await backendHttp(`/reports/approved-duplicates?status=${encodeURIComponent(status)}`);
        }
        default:
          throw new Error(`Endpoint untuk aksi "${name}" tidak ditemukan.`);
      }
    } catch (err) {
      console.warn('Backend API tidak merespons, fallback ke Direct Supabase:', err.message);
      return await executeDirectSupabase(name, ...args);
    }
  };
})();
