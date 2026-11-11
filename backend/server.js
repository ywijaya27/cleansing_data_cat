/**
 * =============================================================================
 * AI Material Master Cleansing, Duplicate Review & Similarity System
 * Backend REST API (Node.js & Express)
 * =============================================================================
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Konfigurasi Multer untuk upload berkas ke memori
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // Maksimal 50MB
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Supabase Configuration
let SUPABASE_URL = (process.env.SUPABASE_URL || 'https://tayybadwfypmedjixemd.supabase.co').replace(/\/$/, '');
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Standard API Response Envelope
 */
function apiResponse(res, statusCode, success, data = null, message = '') {
  return res.status(statusCode).json({
    success,
    data,
    message
  });
}

/**
 * Supabase HTTP Client Helper
 */
async function supabaseFetch(endpoint, options = {}) {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL belum dikonfigurasi.');
  }

  const url = `${SUPABASE_URL}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorText);
    } catch (_) {
      parsedError = { message: errorText };
    }
    throw new Error(parsedError.message || `Supabase Error (${response.status}): ${response.statusText}`);
  }

  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return text;
  }
}

/**
 * Helper SHA-256 Password Hash
 */
function hashPassword(pass) {
  return crypto.createHash('sha256').update(String(pass || '')).digest('hex');
}

/**
 * Helper Standardisasi String Material
 */
function cleanText(v) {
  return String(v || '').trim();
}

function cleanPartNumber(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// =============================================================================
// ROUTES: STATUS & KONEKSI
// =============================================================================

app.get('/api/status', async (req, res) => {
  try {
    const hasConfig = Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_KEY !== 'PASTE_SERVICE_ROLE_KEY_ANDA_DI_SINI');
    let connectionOk = false;
    let connMessage = 'Supabase belum dikonfigurasi.';

    if (hasConfig) {
      try {
        await supabaseFetch('material_raw?select=id&limit=1');
        connectionOk = true;
        connMessage = 'Terhubung ke Supabase PostgreSQL.';
      } catch (err) {
        connMessage = 'Koneksi gagal: ' + err.message;
      }
    }

    return apiResponse(res, 200, true, {
      configured: hasConfig && connectionOk,
      connectionOk,
      url: SUPABASE_URL,
      connMessage,
      version: '2.0.0-github'
    }, 'Status sistem dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.post('/api/settings/supabase', async (req, res) => {
  try {
    const { url, key } = req.body;
    if (!url) return apiResponse(res, 400, false, null, 'URL Supabase wajib diisi.');
    if (!key) return apiResponse(res, 400, false, null, 'Service Role Key wajib diisi.');

    SUPABASE_URL = url.replace(/\/$/, '');
    SUPABASE_KEY = key;

    // Tes koneksi
    await supabaseFetch('material_raw?select=id&limit=1');

    return apiResponse(res, 200, true, { url: SUPABASE_URL }, 'Konfigurasi Supabase berhasil disimpan.');
  } catch (error) {
    return apiResponse(res, 500, false, null, 'Gagal mengonfigurasi: ' + error.message);
  }
});

app.post('/api/settings/test-connection', async (req, res) => {
  try {
    await supabaseFetch('material_raw?select=id&limit=1');
    return apiResponse(res, 200, true, null, 'Koneksi ke Supabase PostgreSQL BERHASIL!');
  } catch (error) {
    return apiResponse(res, 500, false, null, 'Uji koneksi gagal: ' + error.message);
  }
});

// =============================================================================
// ROUTES: DASHBOARD & MATERIALS
// =============================================================================

app.get('/api/materials/dashboard-summary', async (req, res) => {
  try {
    // Coba baca dari view vw_dashboard_summary
    let summary = null;
    try {
      const rows = await supabaseFetch('vw_dashboard_summary?limit=1');
      if (rows && rows.length) summary = rows[0];
    } catch (_) {}

    // Hitung manual jika view belum dibuat
    if (!summary) {
      const [allMat, allDup, allSim] = await Promise.all([
        supabaseFetch('material_raw?select=id,status,stock_qty,stock_value,material_group'),
        supabaseFetch('duplicate_analysis?select=potential_saving,review_status'),
        supabaseFetch('similar_material?select=saving_opportunity')
      ]);

      const totalMat = allMat?.length || 0;
      const dupCount = allDup?.length || 0;
      const simCount = allSim?.length || 0;
      const pendingReview = allDup?.filter(x => x.review_status === 'PENDING').length || 0;
      const totalSavings = (allDup || []).reduce((acc, x) => acc + (Number(x.potential_saving) || 0), 0) +
                           (allSim || []).reduce((acc, x) => acc + (Number(x.saving_opportunity) || 0), 0);

      // Distribusi grup material
      const groupMap = {};
      (allMat || []).forEach(m => {
        const g = m.material_group || 'OTHER';
        groupMap[g] = (groupMap[g] || 0) + 1;
      });
      const groupDistribution = Object.keys(groupMap).map(k => ({ group: k, count: groupMap[k] }));

      summary = {
        total_materials: totalMat,
        duplicated_count: dupCount,
        similar_count: simCount,
        potential_savings: totalSavings,
        data_quality_score: totalMat > 0 ? Math.max(50, Math.min(100, Math.round(100 - (dupCount / totalMat * 100)))) : 98,
        pending_review_count: pendingReview,
        group_distribution: groupDistribution
      };
    }

    return apiResponse(res, 200, true, summary, 'Dashboard summary berhasil dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.get('/api/materials', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const search = cleanText(req.query.search);
    const offset = (page - 1) * limit;

    let query = `material_raw?order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (search) {
      const sc = encodeURIComponent(`%${search}%`);
      query += `&or=(material_code.ilike.${sc},material_description.ilike.${sc},manufacturer.ilike.${sc},part_number.ilike.${sc})`;
    }

    const rows = await supabaseFetch(query, {
      prefer: 'count=exact'
    });

    return apiResponse(res, 200, true, rows || [], 'Daftar material berhasil dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

// =============================================================================
// ROUTES: UPLOAD & EXCEL PROCESSING
// =============================================================================

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    let rows = [];
    let fileName = 'Upload_Batch_' + new Date().toISOString().slice(0, 10);

    if (req.file) {
      fileName = req.file.originalname;
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    } else if (req.body.rows) {
      rows = req.body.rows;
      if (req.body.fileName) fileName = req.body.fileName;
    }

    if (!rows || !rows.length) {
      return apiResponse(res, 400, false, null, 'Tidak ada baris data material yang diunggah.');
    }

    // Normalisasi baris
    const cleanRows = rows.map((r, i) => {
      const code = cleanText(r.material_code || r.MATERIAL_CODE || r.Material_Code || r.Code || `MAT-${100000 + i}`);
      const desc = cleanText(r.material_description || r.MATERIAL_DESCRIPTION || r.Description || r.Deskripsi);
      const mfr = cleanText(r.manufacturer || r.MANUFACTURER || r.Merk || r.Brand || '-');
      const pn = cleanText(r.part_number || r.PART_NUMBER || r.Part_Number || '-');
      const normPn = cleanPartNumber(pn);
      const grp = cleanText(r.material_group || r.MATERIAL_GROUP || r.Group || 'GENERAL').toUpperCase();
      const uom = cleanText(r.base_uom || r.BASE_UOM || r.UOM || 'EA').toUpperCase();
      const qty = parseFloat(r.stock_qty || r.STOCK_QTY || r.Qty || 0) || 0;
      const val = parseFloat(r.stock_value || r.STOCK_VALUE || r.Value || 0) || 0;

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

    // Catat riwayat upload
    let uploadId = null;
    try {
      const hist = await supabaseFetch('upload_history', {
        method: 'POST',
        body: [{
          file_name: fileName,
          total_rows: cleanRows.length,
          status: 'PROCESSING'
        }]
      });
      if (hist && hist[0]) uploadId = hist[0].id;
    } catch (_) {}

    // Batch insert ke material_raw (chunk per 500 rows)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < cleanRows.length; i += CHUNK_SIZE) {
      const chunk = cleanRows.slice(i, i + CHUNK_SIZE);
      await supabaseFetch('material_raw', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates'
        },
        body: chunk
      });
    }

    if (uploadId) {
      try {
        await supabaseFetch(`upload_history?id=eq.${uploadId}`, {
          method: 'PATCH',
          body: {
            status: 'COMPLETED',
            inserted_rows: cleanRows.length
          }
        });
      } catch (_) {}
    }

    return apiResponse(res, 200, true, { totalInserted: cleanRows.length }, `Berhasil mengunggah ${cleanRows.length} material.`);
  } catch (error) {
    return apiResponse(res, 500, false, null, 'Gagal upload: ' + error.message);
  }
});

app.get('/api/upload/history', async (req, res) => {
  try {
    const rows = await supabaseFetch('upload_history?order=created_at.desc&limit=10');
    return apiResponse(res, 200, true, rows || [], 'Riwayat upload dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

// =============================================================================
// ROUTES: AI CLEANSING & DUPLICATE REVIEW
// =============================================================================

app.post('/api/duplicates/run-ai', async (req, res) => {
  try {
    // Panggil stored procedure / RPC run_ai_duplicate_analysis di Supabase
    const result = await supabaseFetch('rpc/run_ai_duplicate_analysis', {
      method: 'POST',
      body: {}
    });

    return apiResponse(res, 200, true, result, 'Analisis AI Duplicate & Similarity selesai.');
  } catch (error) {
    return apiResponse(res, 500, false, null, 'Gagal menjalankan analisis AI: ' + error.message);
  }
});

app.get('/api/duplicates', async (req, res) => {
  try {
    const status = req.query.status || 'ALL';
    const minScore = parseFloat(req.query.minScore || '0') || 0;

    let query = 'duplicate_analysis?order=duplicate_score.desc&limit=250';
    if (status !== 'ALL') {
      query += `&review_status=eq.${encodeURIComponent(status)}`;
    }
    if (minScore > 0) {
      query += `&duplicate_score=gte.${minScore}`;
    }

    const rows = await supabaseFetch(query);
    return apiResponse(res, 200, true, rows || [], 'Data duplikat berhasil dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.post('/api/duplicates/decision', async (req, res) => {
  try {
    const { candidateId, decision, selectedMaster, notes } = req.body;
    if (!candidateId) return apiResponse(res, 400, false, null, 'Candidate ID wajib diisi.');

    // 1. Update duplicate_analysis
    await supabaseFetch(`duplicate_analysis?candidate_id=eq.${encodeURIComponent(candidateId)}`, {
      method: 'PATCH',
      body: {
        review_status: decision,
        assigned_reviewer: 'admin',
        review_notes: notes || null,
        reviewed_at: new Date().toISOString()
      }
    });

    // 2. Jika MERGE_AND_OBSOLETE, perbarui master material
    if (decision === 'MERGE_AND_OBSOLETE' && selectedMaster) {
      await supabaseFetch(`material_raw?material_code=eq.${encodeURIComponent(selectedMaster)}`, {
        method: 'PATCH',
        body: { status: 'ACTIVE_GOLDEN' }
      });
    }

    return apiResponse(res, 200, true, null, 'Keputusan review berhasil disimpan.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.get('/api/similarity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '200', 10);
    const rows = await supabaseFetch(`similar_material?order=similarity_score.desc&limit=${limit}`);
    return apiResponse(res, 200, true, rows || [], 'Data similarity berhasil dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

// =============================================================================
// ROUTES: AUTH & RBAC (USER MANAGEMENT)
// =============================================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return apiResponse(res, 400, false, null, 'Username dan password wajib diisi.');
    }

    const uName = cleanText(username).toLowerCase();
    const pHash = hashPassword(password);

    // Cari user di app_users
    const users = await supabaseFetch(`app_users?username=eq.${encodeURIComponent(uName)}&is_active=eq.true&limit=1`);
    if (!users || !users.length) {
      return apiResponse(res, 401, false, null, 'Username atau password salah.');
    }

    const user = users[0];
    if (user.password_hash !== pHash) {
      return apiResponse(res, 401, false, null, 'Username atau password salah.');
    }

    // Ambil permissions untuk role
    let permissions = null;
    try {
      const perms = await supabaseFetch(`app_role_permissions?role=eq.${encodeURIComponent(user.role)}&limit=1`);
      if (perms && perms[0]) {
        permissions = perms[0];
        if (typeof permissions.allowed_menus === 'string') {
          permissions.allowed_menus = JSON.parse(permissions.allowed_menus);
        }
      }
    } catch (_) {}

    const token = crypto.randomBytes(32).toString('hex');
    const userData = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      permissions: permissions || {},
      token
    };

    return apiResponse(res, 200, true, userData, 'Login berhasil.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.get('/api/auth/access-control', async (req, res) => {
  try {
    let allRoles = [];
    try {
      allRoles = await supabaseFetch('app_role_permissions?select=*') || [];
      allRoles.forEach(r => {
        if (typeof r.allowed_menus === 'string') {
          try { r.allowed_menus = JSON.parse(r.allowed_menus); } catch (_) {}
        }
      });
    } catch (_) {}

    const guestRole = allRoles.find(r => r.role === 'GUEST') || {
      role: 'GUEST',
      allowed_menus: ['dashboard', 'materials', 'similarity'],
      can_upload: false,
      can_run_ai: false,
      can_merge: false,
      can_manage_settings: false
    };

    return apiResponse(res, 200, true, {
      allRoles,
      guestPermissions: guestRole
    }, 'Access control dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const [users, roles] = await Promise.all([
      supabaseFetch('app_users?select=id,username,full_name,role,is_active,created_at&order=created_at.asc'),
      supabaseFetch('app_role_permissions?select=*')
    ]);

    (roles || []).forEach(r => {
      if (typeof r.allowed_menus === 'string') {
        try { r.allowed_menus = JSON.parse(r.allowed_menus); } catch (_) {}
      }
    });

    return apiResponse(res, 200, true, {
      users: users || [],
      roles: roles || []
    }, 'Data manajemen pengguna dimuat.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.post('/api/users/permissions', async (req, res) => {
  try {
    const { roleKey, allowedMenus, permissionsObj } = req.body;
    if (!roleKey) return apiResponse(res, 400, false, null, 'Role key wajib diisi.');

    const payload = {
      role: roleKey,
      allowed_menus: Array.isArray(allowedMenus) ? allowedMenus : [],
      can_upload: Boolean(permissionsObj?.can_upload),
      can_run_ai: Boolean(permissionsObj?.can_run_ai),
      can_merge: Boolean(permissionsObj?.can_merge),
      can_manage_settings: Boolean(permissionsObj?.can_manage_settings),
      updated_at: new Date().toISOString()
    };

    await supabaseFetch(`app_role_permissions?role=eq.${encodeURIComponent(roleKey)}`, {
      method: 'PATCH',
      body: payload
    });

    return apiResponse(res, 200, true, payload, `Hak akses peran ${roleKey} berhasil disimpan.`);
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body.userData || req.body;
    if (!userData || !userData.username) {
      return apiResponse(res, 400, false, null, 'Username wajib diisi.');
    }

    const uName = cleanText(userData.username).toLowerCase();
    const fullName = cleanText(userData.full_name) || uName;
    const role = userData.role || 'OPERATOR';
    const isActive = userData.is_active !== undefined ? Boolean(userData.is_active) : true;

    if (userData.id) {
      // Edit User
      const patchData = {
        full_name: fullName,
        role: role,
        is_active: isActive
      };
      if (userData.password) {
        patchData.password_hash = hashPassword(userData.password);
      }

      await supabaseFetch(`app_users?id=eq.${userData.id}`, {
        method: 'PATCH',
        body: patchData
      });

      return apiResponse(res, 200, true, { id: userData.id, username: uName }, `Pengguna ${uName} berhasil diperbarui.`);
    } else {
      // Create User Baru
      if (!userData.password) {
        return apiResponse(res, 400, false, null, 'Password wajib diisi untuk pengguna baru.');
      }

      const newPayload = [{
        username: uName,
        full_name: fullName,
        password_hash: hashPassword(userData.password),
        role: role,
        is_active: isActive
      }];

      const inserted = await supabaseFetch('app_users', {
        method: 'POST',
        body: newPayload
      });

      return apiResponse(res, 201, true, inserted ? inserted[0] : null, `Pengguna ${uName} berhasil ditambahkan.`);
    }
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const username = cleanText(req.query.username).toLowerCase();

    if (username === 'admin') {
      return apiResponse(res, 400, false, null, 'Akun Administrator utama tidak boleh dihapus.');
    }

    await supabaseFetch(`app_users?id=eq.${userId}`, {
      method: 'DELETE'
    });

    return apiResponse(res, 200, true, { id: userId }, 'Pengguna berhasil dihapus.');
  } catch (error) {
    return apiResponse(res, 500, false, null, error.message);
  }
});

// =============================================================================
// SERVE STATIC FRONTEND
// =============================================================================
const frontendDir = path.resolve(__dirname, '..');
app.use(express.static(frontendDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 REST API Backend aktif di: http://localhost:${PORT}`);
  console.log(`📦 Supabase URL: ${SUPABASE_URL}`);
  console.log(`💻 Frontend siap diakses di: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
