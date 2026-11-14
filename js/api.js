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
   * Memprioritaskan nilai yang sudah dikonfigurasi di js/config.js agar tidak tertimpa cache localStorage lama.
   */
  const getGasUrl = () => {
    return (config.GAS_URL || localStorage.getItem('gas_url') || '').trim();
  };

  const getSupabaseUrl = () => {
    return (config.SUPABASE_URL || localStorage.getItem('supabase_url') || 'https://tayybadwfypmedjixemd.supabase.co').replace(/\/$/, '');
  };

  const getSupabaseKey = () => {
    return (config.SUPABASE_KEY || localStorage.getItem('supabase_key') || '').trim();
  };

  /**
   * Helper Request ke Google Apps Script Web App (POST dengan text/plain anti-CORS preflight)
   */
  async function callGasWebApi(action, args = []) {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
      throw new Error('Google Apps Script Web App URL belum diisi. Masukkan URL Web App di menu Pengaturan atau di js/config.js.');
    }

    const token = JSON.parse(sessionStorage.getItem('admin_session') || 'null')?.token || '';
    const payload = JSON.stringify({ action, args, token });
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // WAJIB text/plain agar tidak memicu CORS OPTIONS preflight ditolak GAS
      },
      body: payload
    });

    const rawText = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(rawText || `GAS Web App HTTP ${res.status}: ${res.statusText}`);
    }

    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      if (/<!doctype|<html|<title>/i.test(rawText)) {
        throw new Error('Google Apps Script mengembalikan halaman HTML, bukan JSON. Pastikan Web App sudah di-deploy dengan akses "Anyone (Siapa saja)" dan URL /exec benar.');
      }
      throw new Error('Respons Google Apps Script tidak valid (bukan JSON).');
    }

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
            fullName: user.full_name || user.username,
            full_name: user.full_name || user.username,
            role: user.role,
            permissions: permissions || {},
            token: 'direct_' + user.id + '_' + Date.now()
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

      case 'getDashboardData':
      case 'getDashboardSummary': {
        const [allMat, allDup, allSim] = await Promise.all([
          supabaseRequest('material_raw?select=id,material_description,manufacturer,part_number,base_uom,stock_qty,stock_value,material_group'),
          supabaseRequest('duplicate_analysis?select=potential_saving,review_status'),
          supabaseRequest('similar_material?select=id')
        ]);

        const totalMat = allMat?.length || 0;
        const dupCount = allDup?.length || 0;
        const simCount = allSim?.length || 0;
        const pendingReview = allDup?.filter(x => x.review_status === 'PENDING').length || 0;
        const totalSavings = (allDup || []).reduce((acc, x) => acc + (Number(x.potential_saving) || 0), 0);

        const groupMap = {};
        let noMfr = 0, noPn = 0, noUom = 0;
        (allMat || []).forEach(m => {
          const g = m.material_group || 'Uncategorized';
          groupMap[g] = (groupMap[g] || 0) + 1;
          if (!m.manufacturer) noMfr++;
          if (!m.part_number) noPn++;
          if (!m.base_uom) noUom++;
        });
        const commodity = Object.keys(groupMap)
          .map(k => ({ group: k, count: groupMap[k] }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
        const totalCells = Math.max(1, totalMat * 4);
        const missingCells = noMfr + noPn + noUom;
        const qualityScore = totalMat ? Math.round(((totalCells - missingCells) / totalCells) * 1000) / 10 : 100;

        return {
          success: true,
          data: {
            totalMaterial: totalMat,
            duplicateCandidate: dupCount,
            similarCandidate: simCount,
            pendingReview: pendingReview,
            potentialSaving: totalSavings,
            dataQualityScore: qualityScore,
            qualityIssues: { noMfr, noPn, noUom },
            commodity,
            insight: `Ditemukan ${dupCount} kandidat duplikat dan ${simCount} material serupa. Lakukan review pada menu Duplicate Review.`,
            // Alias kompatibilitas
            total_materials: totalMat,
            duplicated_count: dupCount,
            similar_count: simCount,
            potential_savings: totalSavings,
            data_quality_score: qualityScore,
            pending_review_count: pendingReview,
            group_distribution: commodity
          }
        };
      }

      case 'getMaterials':
      case 'getMaterialMaster': {
        const [page = 1, pageSize = 25, search = ''] = args;
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(10, Number(pageSize) || 25));
        const offset = (p - 1) * ps;
        let q = `material_raw?select=*&order=id.desc&limit=${ps}&offset=${offset}`;
        if (search) {
          const sc = encodeURIComponent(`%${String(search).trim()}%`);
          q += `&or=(material_code.ilike.${sc},material_description.ilike.${sc},manufacturer.ilike.${sc},part_number.ilike.${sc})`;
        }
        const rows = await supabaseRequest(q) || [];
        return {
          success: true,
          data: name === 'getMaterialMaster' ? rows : { rows, page: p, pageSize: ps }
        };
      }

      case 'uploadMaterials':
      case 'uploadMasterData': {
        const [rows = [], fileName = ''] = args;
        if (!rows.length) throw new Error('Data upload kosong.');

        // 1. Ambil seluruh material_code yang sudah ada di Supabase untuk deduplikasi
        const existingCodesSet = new Set();
        try {
          const existingList = await supabaseRequest('material_raw?select=material_code&limit=50000');
          if (Array.isArray(existingList)) {
            existingList.forEach(item => {
              if (item.material_code) existingCodesSet.add(String(item.material_code).trim().toUpperCase());
            });
          }
        } catch (_) {}

        let skippedDuplicates = 0;
        const validToInsert = [];
        const seenInFile = new Set();

        rows.forEach((r, i) => {
          const code = String(r.material_code || r.MATERIAL_CODE || r.Material_Code || '').trim();
          const desc = String(r.material_description || r.MATERIAL_DESCRIPTION || r.Deskripsi || r.item_text_result || '').trim();
          const mfr = String(r.manufacturer || r.MANUFACTURER || '').trim();
          const pn = String(r.part_number || r.PART_NUMBER || '').trim();
          const grp = String(r.material_group || r.MATERIAL_GROUP || 'GENERAL').trim().toUpperCase();
          const uom = String(r.base_uom || r.BASE_UOM || 'EA').trim().toUpperCase();
          const qty = parseFloat(r.stock_qty || r.STOCK_QTY || 0) || 0;
          const val = parseFloat(r.stock_value || r.STOCK_VALUE || 0) || 0;

          const finalCode = code || (pn ? `PN-${pn.replace(/[^a-zA-Z0-9]/g, '')}` : `MAT-${100000 + i + 1}`);
          const upperCode = finalCode.toUpperCase();

          // Jika kode material sudah ada di database atau duplikat dalam file, lewati (skip)
          if (existingCodesSet.has(upperCode) || seenInFile.has(upperCode)) {
            skippedDuplicates++;
            return;
          }

          seenInFile.add(upperCode);
          validToInsert.push({
            material_code: finalCode,
            material_description: desc,
            manufacturer: mfr,
            part_number: pn,
            material_group: grp,
            base_uom: uom,
            stock_qty: qty,
            stock_value: val
          });
        });

        // 2. Simpan Riwayat Batch Upload
        let batchId = null;
        try {
          const bRes = await supabaseRequest('upload_batch', {
            method: 'POST',
            body: [{
              file_name: fileName || 'Upload_Master_' + new Date().toISOString().slice(0, 10),
              total_records: rows.length,
              uploaded_by: 'Direct User',
              status: 'COMPLETED'
            }]
          });
          if (Array.isArray(bRes) && bRes[0]) batchId = bRes[0].id;
        } catch (_) {}

        // 3. Masukkan hanya data baru (chunk 500)
        const CHUNK = 500;
        for (let i = 0; i < validToInsert.length; i += CHUNK) {
          const chunk = validToInsert.slice(i, i + CHUNK);
          if (batchId) {
            chunk.forEach(c => c.batch_id = batchId);
          }
          await supabaseRequest('material_raw', {
            method: 'POST',
            prefer: 'return=minimal',
            body: chunk
          });
        }

        return {
          success: true,
          data: {
            inserted: validToInsert.length,
            skipped: skippedDuplicates,
            errors: 0,
            totalRows: rows.length
          },
          message: `Upload selesai: ${validToInsert.length} data baru ditambahkan, ${skippedDuplicates} data duplikat dilewati.`
        };
      }

      case 'normalizeMaterial': {
        const [materialId] = args;
        const rows = await supabaseRequest(`material_raw?id=eq.${encodeURIComponent(materialId)}&select=*`);
        if (!rows || !rows.length) throw new Error('Material tidak ditemukan.');
        const m = rows[0];
        const normDesc = String(m.material_description || '').trim().toUpperCase().replace(/\s+/g, ' ');
        const res = await supabaseRequest('material_normalized', {
          method: 'POST',
          body: [{
            raw_material_id: m.id,
            normalized_description: normDesc,
            normalized_brand: String(m.manufacturer || '').trim().toUpperCase(),
            normalized_part_number: String(m.part_number || '').trim().toUpperCase(),
            normalization_status: 'COMPLETED'
          }]
        });
        return { success: true, data: res ? res[0] : { normalized_description: normDesc }, message: 'Material berhasil dinormalisasi.' };
      }

      case 'getUploadHistory': {
        const [limit = 20] = args;
        const limitNum = Math.min(100, Number(limit) || 20);
        const rows = await supabaseRequest(`upload_batch?select=*&order=created_at.desc&limit=${limitNum}`).catch(() => []);
        return { success: true, data: rows || [] };
      }

      case 'runAICleansingAnalysis':
      case 'runAiCleansingAnalysis': {
        const [minDup = 75, minSim = 60, batchLimit = 1000] = args;
        const res = await supabaseRequest('rpc/run_material_cleansing_ai', {
          method: 'POST',
          body: {
            p_min_duplicate_score: Number(minDup) || 75,
            p_min_similarity_score: Number(minSim) || 60,
            p_limit: batchLimit !== undefined && batchLimit !== null ? Number(batchLimit) : 1000
          }
        });
        return { success: true, data: res, message: (res && res.message) || 'Analisis AI selesai diproses.' };
      }

      case 'getDuplicateCandidates':
      case 'getDuplicates': {
        const limit = typeof args[0] === 'number' ? Math.min(300, Math.max(10, args[0])) : 300;
        const rows = await supabaseRequest(`duplicate_analysis?select=*&order=duplicate_score.desc&limit=${limit}`);
        return { success: true, data: rows || [] };
      }

      case 'saveDuplicateDecision': {
        const [candidateId, decision, selectedMaster, notes, reviewerName] = args;
        if (!candidateId) throw new Error('Candidate ID wajib diisi.');

        const reviewer = reviewerName || 'admin';
        const reviewedAt = new Date().toISOString();
        const encodedId = encodeURIComponent(candidateId);

        try {
          await supabaseRequest(`duplicate_analysis?candidate_id=eq.${encodedId}`, {
            method: 'PATCH',
            body: {
              review_status: decision,
              recommended_master_code: selectedMaster || null,
              assigned_reviewer: reviewer,
              review_notes: notes || null,
              reviewed_at: reviewedAt
            }
          });
        } catch (patchErr) {
          if (!/PGRST204|Could not find|does not exist/i.test(String(patchErr.message || patchErr))) {
            throw patchErr;
          }
          let existingFactors = {};
          try {
            const cur = await supabaseRequest(`duplicate_analysis?candidate_id=eq.${encodedId}&select=match_factors&limit=1`);
            if (cur && cur[0] && cur[0].match_factors && typeof cur[0].match_factors === 'object') {
              existingFactors = cur[0].match_factors;
            }
          } catch (_) {}

          await supabaseRequest(`duplicate_analysis?candidate_id=eq.${encodedId}`, {
            method: 'PATCH',
            body: {
              review_status: decision,
              recommended_master_code: selectedMaster || null,
              match_factors: {
                ...existingFactors,
                assigned_reviewer: reviewer,
                review_notes: notes || null,
                reviewed_at: reviewedAt
              }
            }
          });
        }

        if (decision === 'MERGE_AND_OBSOLETE' && selectedMaster) {
          try {
            await supabaseRequest(`material_raw?material_code=eq.${encodeURIComponent(selectedMaster)}`, {
              method: 'PATCH',
              body: { status: 'ACTIVE_GOLDEN' }
            });
          } catch (_) {}
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
          const mf = (r.match_factors && typeof r.match_factors === 'object') ? r.match_factors : {};
          if (!r.assigned_reviewer && mf.assigned_reviewer) r.assigned_reviewer = mf.assigned_reviewer;
          if (!r.review_notes && mf.review_notes) r.review_notes = mf.review_notes;
          if (!r.reviewed_at && mf.reviewed_at) r.reviewed_at = mf.reviewed_at;

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
          }).apiRequest(name, args, JSON.parse(sessionStorage.getItem('admin_session') || 'null')?.token || '');
      });
    }

    // 2. Mode 'appscript' (Memanggil Google Apps Script Web App URL dari GitHub Pages)
    const mode = (config.MODE || 'appscript').toLowerCase();
    const gasUrl = getGasUrl();

    if (mode === 'appscript' || mode === 'gas') {
      if (gasUrl) {
        return await callGasWebApi(name, args);
      } else {
        // A backend is required for server-side authorization.
        throw new Error('Mode direct dinonaktifkan. Gunakan backend Apps Script atau API untuk validasi hak akses.');
      }
    }

    // 3. Mode 'direct' (Langsung ke Supabase)
    if (mode === 'direct') {
      throw new Error('Mode direct dinonaktifkan. Gunakan backend Apps Script atau API untuk validasi hak akses.');
    }

    // 4. Mode 'api' (Backend Node.js Express)
    try {
      switch (name) {
        case 'getSession': return await backendHttp('/auth/session');
        case 'logoutUser': return await backendHttp('/auth/logout', { method: 'POST' });
        case 'authorizeConsistencyExport': return await backendHttp('/consistency/export-authorization', { method: 'POST' });
        case 'getConsistencyMaterials': return await backendHttp(`/consistency/materials?page=${Number(args[0]) || 1}&limit=${Number(args[1]) || 100}`);
        case 'getAppStatus': return await backendHttp('/status');
        case 'getDashboardData':
        case 'getDashboardSummary': return await backendHttp('/materials/dashboard-summary');
        case 'getMaterials':
        case 'getMaterialMaster': {
          const [page = 1, pageSize = 25, search = ''] = args;
          return await backendHttp(`/materials?page=${page}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
        }
        case 'uploadMaterials':
        case 'uploadMasterData': {
          const [rows = [], fileName = ''] = args;
          return await backendHttp('/upload', { method: 'POST', body: JSON.stringify({ rows, fileName }) });
        }
        case 'normalizeMaterial': return await backendHttp(`/materials/${encodeURIComponent(args[0])}/normalize`, { method: 'POST', body: JSON.stringify({}) });
        case 'getUploadHistory': return await backendHttp('/upload/history');
        case 'runAICleansingAnalysis':
        case 'runAiCleansingAnalysis': {
          const [minDup = 75, minSim = 60, batchLimit = 1000] = args;
          return await backendHttp('/duplicates/run-ai', {
            method: 'POST',
            body: JSON.stringify({ minDup, minSim, limit: batchLimit })
          });
        }
        case 'getDuplicateCandidates':
        case 'getDuplicates': {
          const limit = typeof args[0] === 'number' ? args[0] : 300;
          return await backendHttp(`/duplicates?limit=${limit}`);
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
      throw err;
    }
  };
})();
