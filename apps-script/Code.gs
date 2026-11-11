/**
 * AI Material Master Cleansing & Rationalization System
 * Backend Google Apps Script - Supabase Connector
 * Versi 1.1 - Cleaned & Optimized
 */

const APP_NAME = 'AI Material Master Cleansing & Rationalization';
const MAX_UPLOAD_ROWS = 100000;

// URL default Supabase proyek pengguna
const DEFAULT_SUPABASE_URL = 'https://tayybadwfypmedjixemd.supabase.co';

/**
 * ENTRY POINT WEB APP
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HELPER TEMPLATING: Menyisipkan berkas HTML / JS / CSS
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * STANDAR FORMAT RESPONSE
 */
function response_(success, data, message) {
  return {
    success: Boolean(success),
    data: data !== undefined ? data : null,
    message: String(message || '')
  };
}

/**
 * FUNGSI SETUP KONEKSI DARI SCRIPT EDITOR (Jalankan sekali)
 * Masukkan service role key (secret) dari Dashboard Supabase:
 * Settings -> API -> Project API keys -> service_role (secret)
 */
function firstTimeSetup() {
  const projectUrl = DEFAULT_SUPABASE_URL;
  const serviceRoleKey = 'PASTE_SERVICE_ROLE_KEY_DISINI'; // Ganti dengan key asli Anda
  
  const res = setupSupabaseConfig(projectUrl, serviceRoleKey);
  Logger.log(JSON.stringify(res));
  return res;
}

/**
 * Simpan konfigurasi Supabase ke PropertiesService (Aman, tidak terekspos ke frontend)
 */
function setupSupabaseConfig(projectUrl, serviceRoleKey) {
  try {
    const url = String(projectUrl || '').trim().replace(/\/+$/, '');
    const key = String(serviceRoleKey || '').trim();

    if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
      throw new Error('Project URL Supabase tidak valid. Format: https://<project-ref>.supabase.co');
    }
    if (!key || key.length < 30 || key === 'PASTE_SERVICE_ROLE_KEY_DISINI') {
      throw new Error('Service Role Key tidak valid. Masukkan key rahasia Supabase Anda.');
    }

    const props = PropertiesService.getScriptProperties();
    props.setProperties({
      SUPABASE_URL: url,
      SUPABASE_SERVICE_KEY: key
    }, false);

    // Uji koneksi langsung
    const test = testSupabaseConnection();
    if (!test.success) {
      return response_(false, null, 'Konfigurasi tersimpan, namun koneksi gagal: ' + test.message);
    }

    return response_(true, { configured: true, url: url }, 'Koneksi Supabase berhasil diverifikasi dan disimpan.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * Uji konektivitas langsung ke Supabase REST API
 */
function testSupabaseConnection() {
  try {
    const cfg = getSupabaseConfig_();
    const res = UrlFetchApp.fetch(cfg.url + '/rest/v1/', {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key
      }
    });

    const code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      return response_(true, { url: cfg.url, statusCode: code }, 'Koneksi ke Supabase aktif dan berhasil terhubung!');
    } else {
      return response_(false, { url: cfg.url, statusCode: code }, 'Supabase merespons HTTP ' + code + ': ' + res.getContentText());
    }
  } catch (error) {
    return response_(false, null, 'Gagal terhubung ke Supabase: ' + error.message);
  }
}

/**
 * Ambil status aplikasi & verifikasi konfigurasi untuk Frontend
 */
function getAppStatus() {
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
    const key = props.getProperty('SUPABASE_SERVICE_KEY');

    let isConfigured = Boolean(url && key && key !== 'PASTE_SERVICE_ROLE_KEY_DISINI');
    let connectionOk = false;
    let connMessage = isConfigured ? 'Memeriksa...' : 'Belum dikonfigurasi';

    if (isConfigured) {
      try {
        const ping = UrlFetchApp.fetch(url + '/rest/v1/', {
          method: 'get',
          muteHttpExceptions: true,
          headers: { apikey: key, Authorization: 'Bearer ' + key }
        });
        const code = ping.getResponseCode();
        connectionOk = (code >= 200 && code < 300);
        connMessage = connectionOk ? 'Terhubung (HTTP ' + code + ')' : 'Respon HTTP ' + code;
      } catch (errPing) {
        connectionOk = false;
        connMessage = 'Koneksi error: ' + errPing.message;
      }
    }

    return response_(true, {
      appName: APP_NAME,
      configured: isConfigured,
      connectionOk: connectionOk,
      connMessage: connMessage,
      url: url,
      userEmail: Session.getActiveUser().getEmail() || 'GAS User'
    }, 'Status sistem dimuat.');
  } catch (error) {
    return response_(false, { configured: false, connectionOk: false, connMessage: error.message }, error.message);
  }
}

/**
 * Helper mengambil konfigurasi rahasia
 */
function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  const key = props.getProperty('SUPABASE_SERVICE_KEY');

  if (!url || !key || key === 'PASTE_SERVICE_ROLE_KEY_DISINI') {
    throw new Error('Supabase belum dikonfigurasi. Atur koneksi melalui menu Pengaturan atau jalankan firstTimeSetup().');
  }
  return { url: url.replace(/\/+$/, ''), key: key };
}

/**
 * Client HTTP Supabase PostgREST
 */
function supabaseRequest_(path, method, payload, extraHeaders) {
  const cfg = getSupabaseConfig_();
  const httpMethod = (method || 'get').toLowerCase();

  const headers = Object.assign({
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    Prefer: 'return=representation'
  }, extraHeaders || {});

  const options = {
    method: httpMethod,
    muteHttpExceptions: true,
    headers: headers
  };

  if (payload !== null && payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + path, options);
  const code = res.getResponseCode();
  const text = res.getContentText();

  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }

  if (code < 200 || code >= 300) {
    const detail = body && (body.message || body.details || body.hint) ? JSON.stringify(body) : text;
    throw new Error('Supabase HTTP ' + code + ': ' + detail);
  }
  return body;
}

/**
 * DASHBOARD ANALYTICS
 */
function getDashboardData() {
  try {
    let summary = {};
    try {
      const rows = supabaseRequest_('vw_dashboard_summary?select=*', 'get');
      summary = rows && rows[0] ? rows[0] : {};
    } catch (_) {
      summary = buildDashboardFallback_();
    }

    const quality = calculateDataQuality_();
    let commodity = [];
    try {
      const topGroups = supabaseRequest_('material_raw?select=material_group&limit=5000', 'get');
      const groupMap = {};
      (topGroups || []).forEach(r => {
        const key = r.material_group || 'UNCLASSIFIED';
        groupMap[key] = (groupMap[key] || 0) + 1;
      });
      commodity = Object.keys(groupMap).map(k => ({ label: k, value: groupMap[k] }))
        .sort((a,b) => b.value - a.value).slice(0, 8);
    } catch (_) {}

    const total = Number(summary.total_material || 0);
    const dup = Number(summary.duplicate_candidate || 0);
    const insight = total
      ? 'Terdapat ' + dup + ' kandidat duplicate dari ' + total + ' material. Prioritaskan review kandidat dengan skor minimal 95.'
      : 'Belum ada data material. Gunakan menu Upload Material untuk memasukkan data awal.';

    return response_(true, {
      totalMaterial: total,
      duplicateCandidate: dup,
      similarCandidate: Number(summary.similar_candidate || 0),
      pendingReview: Number(summary.pending_review || 0),
      potentialSaving: Number(summary.potential_saving || 0),
      dataQualityScore: quality.score,
      qualityIssues: quality.issues,
      commodity: commodity,
      insight: insight
    }, 'Dashboard berhasil dimuat.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

function buildDashboardFallback_() {
  const total = countTable_('material_raw');
  const duplicate = countTable_('duplicate_analysis', 'duplicate_score=gte.85');
  const similar = countTable_('similar_material');
  const pending = countTable_('review_queue', 'review_status=eq.NEW');
  return { total_material: total, duplicate_candidate: duplicate, similar_candidate: similar, pending_review: pending };
}

function countTable_(table, filter) {
  try {
    const cfg = getSupabaseConfig_();
    let url = cfg.url + '/rest/v1/' + table + '?select=id';
    if (filter) url += '&' + filter;
    url += '&limit=1';

    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        Prefer: 'count=exact'
      }
    });

    if (res.getResponseCode() >= 300) return 0;
    const headers = res.getHeaders();
    const range = headers['Content-Range'] || headers['content-range'] || '';
    if (!range) return 0;
    const total = String(range).split('/')[1];
    return total === '*' ? 0 : Number(total || 0);
  } catch (_) {
    return 0;
  }
}

function calculateDataQuality_() {
  const issues = { missingCode: 0, missingDescription: 0, missingManufacturer: 0, missingPartNumber: 0, missingUom: 0 };
  try {
    const rows = supabaseRequest_('material_raw?select=material_code,material_description,manufacturer,part_number,base_uom&limit=5000', 'get') || [];
    if (!rows.length) return { score: 100, issues: issues };

    rows.forEach(r => {
      if (!r.material_code) issues.missingCode++;
      if (!r.material_description) issues.missingDescription++;
      if (!r.manufacturer) issues.missingManufacturer++;
      if (!r.part_number) issues.missingPartNumber++;
      if (!r.base_uom) issues.missingUom++;
    });

    const totalChecks = rows.length * 5;
    const failures = Object.values(issues).reduce((a,b) => a+b, 0);
    return { score: Math.max(0, Math.round((1 - failures / totalChecks) * 100)), issues: issues };
  } catch (_) {
    return { score: 0, issues: issues };
  }
}

/**
 * MATERIAL MASTER & PAGING
 */
function getMaterials(page, pageSize, search) {
  try {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(10, Number(pageSize) || 25));
    const offset = (page - 1) * pageSize;

    let path = 'material_raw?select=id,material_code,material_description,manufacturer,part_number,material_group,base_uom,stock_qty,stock_value,created_at';
    if (search) {
      const safe = String(search).replace(/[,%()]/g, ' ').trim();
      if (safe) path += '&or=(material_code.ilike.*' + encodeURIComponent(safe) + '*,material_description.ilike.*' + encodeURIComponent(safe) + '*,part_number.ilike.*' + encodeURIComponent(safe) + '*)';
    }
    path += '&order=created_at.desc&limit=' + pageSize + '&offset=' + offset;

    const rows = supabaseRequest_(path, 'get');
    return response_(true, { rows: rows || [], page: page, pageSize: pageSize }, 'Material berhasil dimuat.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * UPLOAD MATERIAL MASTER
 */
function uploadMaterials(records, fileName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    if (!Array.isArray(records) || !records.length) throw new Error('Data upload kosong.');
    if (records.length > MAX_UPLOAD_ROWS) throw new Error('Maksimum 100.000 record per upload.');

    const email = Session.getActiveUser().getEmail() || 'GAS User';
    const batch = supabaseRequest_('upload_batch', 'post', [{
      batch_name: 'UPLOAD-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'),
      file_name: String(fileName || 'manual-upload').slice(0, 255),
      total_records: records.length,
      uploaded_by: email,
      status: 'PROCESSING'
    }]);

    const batchId = batch[0].id;
    const valid = [], errors = [], seen = {};

    records.forEach((r, idx) => {
      const code = cleanText_(r.material_code);
      const desc = cleanText_(r.material_description);
      if (!code) errors.push({ batch_id: batchId, row_number: idx + 2, error_message: 'Material code kosong' });
      else if (!desc) errors.push({ batch_id: batchId, row_number: idx + 2, error_message: 'Description kosong' });
      else if (seen[code]) errors.push({ batch_id: batchId, row_number: idx + 2, error_message: 'Duplicate material code dalam file' });
      else {
        seen[code] = true;
        valid.push({
          material_code: code,
          material_description: desc,
          manufacturer: cleanText_(r.manufacturer),
          part_number: cleanText_(r.part_number),
          material_group: cleanText_(r.material_group),
          base_uom: cleanText_(r.base_uom),
          stock_qty: numberOrZero_(r.stock_qty),
          stock_value: numberOrZero_(r.stock_value),
          batch_id: batchId
        });
      }
    });

    for (let i = 0; i < valid.length; i += 500) {
      supabaseRequest_('material_raw', 'post', valid.slice(i, i + 500), { Prefer: 'return=minimal' });
    }
    for (let j = 0; j < errors.length; j += 500) {
      supabaseRequest_('upload_error', 'post', errors.slice(j, j + 500), { Prefer: 'return=minimal' });
    }

    supabaseRequest_('upload_batch?id=eq.' + batchId, 'patch', {
      status: errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'
    });

    writeAudit_('UPLOAD', 'CREATE', batchId, 'Upload ' + valid.length + ' material; error ' + errors.length);
    return response_(true, { batchId: batchId, inserted: valid.length, errors: errors.length }, 'Upload selesai.');
  } catch (error) {
    return response_(false, null, error.message);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * NORMALISASI MATERIAL TUNGGAL
 */
function normalizeMaterial(materialId) {
  try {
    const row = supabaseRequest_('material_raw?id=eq.' + materialId + '&select=*', 'get');
    if (!row || !row.length) throw new Error('Material tidak ditemukan.');

    const m = row[0];
    const normalized = normalizeDescription_(m.material_description);
    const payload = [{
      raw_material_id: m.id,
      normalized_description: normalized,
      normalized_brand: cleanText_(m.manufacturer).toUpperCase(),
      normalized_part_number: cleanText_(m.part_number).toUpperCase(),
      normalization_status: 'COMPLETED'
    }];

    const result = supabaseRequest_('material_normalized', 'post', payload);
    writeAudit_('NORMALIZATION', 'CREATE', materialId, normalized);
    return response_(true, result[0], 'Material berhasil dinormalisasi.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * JALANKAN AI CLEANSING & RATIONALIZATION ENGINE
 * Memanggil fungsi RPC PostgreSQL run_material_cleansing_ai di Supabase
 */
function runAICleansingAnalysis(minDupScore, minSimScore) {
  try {
    const cfg = getSupabaseConfig_();
    const payload = {
      p_min_duplicate_score: Number(minDupScore) || 75,
      p_min_similarity_score: Number(minSimScore) || 60
    };

    const res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/run_material_cleansing_ai', {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key
      },
      payload: JSON.stringify(payload)
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    let body = null;
    try { body = JSON.parse(text); } catch (_) { body = text; }

    if (code >= 200 && code < 300) {
      return response_(true, body, body.message || 'Analisis AI selesai diproses.');
    } else {
      const errDetail = body && body.message ? body.message : text;
      throw new Error('Supabase RPC Error (' + code + '): ' + errDetail);
    }
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * KANDIDAT DUPLIKASI
 */
function getDuplicateCandidates(limit) {
  try {
    limit = Math.min(300, Math.max(10, Number(limit) || 100));
    const analyses = supabaseRequest_('duplicate_analysis?select=*&order=duplicate_score.desc&limit=' + limit, 'get') || [];
    return response_(true, analyses, 'Kandidat duplicate berhasil dimuat.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * MATERIAL SERUPA (SIMILARITY)
 */
function getSimilarMaterials(limit) {
  try {
    limit = Math.min(300, Math.max(10, Number(limit) || 100));
    const rows = supabaseRequest_('similar_material?select=*&order=similarity_score.desc&limit=' + limit, 'get') || [];
    return response_(true, rows, 'Material serupa berhasil dimuat.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * SIMPAN KEPUTUSAN REVIEW DUPLIKAT (MERGE / REJECT / APPROVE)
 */
function saveDuplicateDecision(candidateId, decision, masterCode, notes) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (!candidateId) throw new Error('Candidate ID wajib diisi.');
    const allowed = ['MERGE_AND_OBSOLETE', 'APPROVED_DUPLICATE', 'REJECTED_DIFFERENT', 'CLOSED'];
    if (allowed.indexOf(decision) === -1) throw new Error('Keputusan review tidak valid.');

    const email = Session.getActiveUser().getEmail() || 'GAS User';
    
    // Update status di tabel duplicate_analysis
    supabaseRequest_('duplicate_analysis?candidate_id=eq.' + encodeURIComponent(candidateId), 'patch', {
      review_status: decision,
      recommended_master_code: masterCode || null
    });

    // Simpan keputusan ke tabel review_decision
    supabaseRequest_('review_decision', 'post', [{
      queue_id: null,
      reviewer_email: email,
      decision: decision + (masterCode ? ' (Master: ' + masterCode + ')' : ''),
      decision_note: String(notes || '').slice(0, 1000)
    }], { Prefer: 'return=minimal' });

    writeAudit_('DUPLICATE_REVIEW', decision, candidateId, 'Keputusan: ' + decision + ' | Master: ' + (masterCode || '-') + ' | Catatan: ' + (notes || '-'));
    return response_(true, { candidateId: candidateId, status: decision }, 'Keputusan berhasil disimpan.');
  } catch (error) {
    return response_(false, null, error.message);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * SIMPAN KEPUTUSAN REVIEW DUPLIKAT
 */
function saveReviewDecision(queueId, decision, note) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (!queueId) throw new Error('Queue ID wajib diisi.');
    const allowed = ['APPROVED_DUPLICATE', 'REJECTED', 'MERGED', 'CLOSED'];
    if (allowed.indexOf(decision) === -1) throw new Error('Keputusan review tidak valid.');

    const email = Session.getActiveUser().getEmail() || 'GAS User';
    const rows = supabaseRequest_('review_decision', 'post', [{
      queue_id: queueId,
      reviewer_email: email,
      decision: decision,
      decision_note: String(note || '').slice(0, 1000)
    }]);

    supabaseRequest_('review_queue?id=eq.' + queueId, 'patch', {
      review_status: decision === 'APPROVED_DUPLICATE' ? 'APPROVED' : decision
    });

    writeAudit_('REVIEW', decision, queueId, note || '');
    return response_(true, rows[0], 'Keputusan review tersimpan.');
  } catch (error) {
    return response_(false, null, error.message);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/**
 * RIWAYAT UPLOAD
 */
function getUploadHistory(limit) {
  try {
    const limitNum = Math.min(100, Number(limit) || 20);
    let rows;
    try {
      rows = supabaseRequest_('upload_batch?select=*&order=created_at.desc&limit=' + limitNum, 'get');
    } catch (_) {
      rows = supabaseRequest_('upload_batch?select=*&order=upload_date.desc&limit=' + limitNum, 'get');
    }
    return response_(true, rows || [], 'Riwayat upload dimuat.');
  } catch (error) {
    return response_(false, [], error.message);
  }
}

/**
 * AUDIT TRAIL LOGGING
 */
function writeAudit_(moduleName, actionName, recordId, description) {
  try {
    supabaseRequest_('audit_trail', 'post', [{
      module_name: moduleName,
      action_name: actionName,
      user_email: Session.getActiveUser().getEmail() || 'GAS User',
      record_id: String(recordId || ''),
      description: String(description || '').slice(0, 2000)
    }], { Prefer: 'return=minimal' });
  } catch (_) {}
}

/**
 * HELPER TEXT & NUMBERS
 */
function normalizeDescription_(text) {
  const dictionary = {
    BRG: 'BEARING',
    ASSY: 'ASSEMBLY',
    MTR: 'MOTOR',
    VLV: 'VALVE',
    GSKT: 'GASKET',
    SS: 'STAINLESS STEEL'
  };
  return cleanText_(text).toUpperCase().replace(/[^A-Z0-9.\-\/ ]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map(t => dictionary[t] || t).join(' ');
}

function cleanText_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function numberOrZero_(v) {
  const n = Number(String(v === undefined ? 0 : v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

/**
 * =============================================================================
 * MANAJEMEN PENGGUNA, LOGIN ADMIN & HAK AKSES (RBAC)
 * =============================================================================
 */

const DEFAULT_GUEST_PERMISSIONS = {
  role: 'GUEST',
  role_name: 'Pengunjung (Tanpa Login)',
  allowed_menus: ['dashboard', 'materials', 'similarity'],
  can_upload: false,
  can_run_ai: false,
  can_merge: false,
  can_manage_settings: false
};

const DEFAULT_ADMIN_PERMISSIONS = {
  role: 'ADMIN',
  role_name: 'Administrator Sistem',
  allowed_menus: ['dashboard', 'upload', 'materials', 'duplicates', 'similarity', 'users', 'settings'],
  can_upload: true,
  can_run_ai: true,
  can_merge: true,
  can_manage_settings: true
};

function hashPassword_(pass) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pass || ''), Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * Verifikasi Login Pengguna / Admin
 */
function loginUser(username, password) {
  try {
    const userClean = cleanText_(username).toLowerCase();
    const passClean = String(password || '').trim();
    if (!userClean) throw new Error('Username wajib diisi.');
    if (!passClean) throw new Error('Password wajib diisi.');

    const hashInput = hashPassword_(passClean);
    let matchedUser = null;

    // 1. Cek di tabel database Supabase app_users
    try {
      const rows = supabaseRequest_('app_users?username=eq.' + encodeURIComponent(userClean) + '&limit=1', 'get');
      if (rows && rows.length > 0) {
        matchedUser = rows[0];
      }
    } catch (_) {}

    // 2. Fallback: Cek default Admin jika tabel belum di-setup di Supabase
    if (!matchedUser && userClean === 'admin') {
      const props = PropertiesService.getScriptProperties();
      const storedHash = props.getProperty('ADMIN_PASSWORD_HASH') || hashPassword_('admin123');
      if (hashInput === storedHash) {
        matchedUser = {
          id: 1,
          username: 'admin',
          full_name: 'System Administrator',
          role: 'ADMIN',
          is_active: true
        };
      }
    }

    if (!matchedUser) {
      throw new Error('Username atau password salah.');
    }
    if (!matchedUser.is_active) {
      throw new Error('Akun pengguna ini telah dinonaktifkan.');
    }
    if (matchedUser.password_hash && matchedUser.password_hash !== hashInput) {
      throw new Error('Username atau password salah.');
    }

    // Ambil hak akses peran
    let permissions = DEFAULT_ADMIN_PERMISSIONS;
    try {
      const permRows = supabaseRequest_('app_role_permissions?role=eq.' + encodeURIComponent(matchedUser.role), 'get');
      if (permRows && permRows.length > 0) {
        permissions = permRows[0];
        if (typeof permissions.allowed_menus === 'string') {
          permissions.allowed_menus = JSON.parse(permissions.allowed_menus);
        }
      }
    } catch (_) {}

    writeAudit_('AUTH', 'LOGIN_SUCCESS', matchedUser.username, 'Login sukses sebagai ' + matchedUser.role);

    return response_(true, {
      id: matchedUser.id,
      username: matchedUser.username,
      fullName: matchedUser.full_name || matchedUser.username,
      role: matchedUser.role,
      permissions: permissions
    }, 'Login berhasil. Selamat datang, ' + (matchedUser.full_name || matchedUser.username) + '!');
  } catch (error) {
    writeAudit_('AUTH', 'LOGIN_FAILED', username, error.message);
    return response_(false, null, error.message);
  }
}

/**
 * Mengambil konfigurasi hak akses sistem (termasuk untuk mode Guest)
 */
function getSystemAccessControl() {
  try {
    let roles = [];
    try {
      roles = supabaseRequest_('app_role_permissions?select=*', 'get') || [];
    } catch (_) {}

    const guestRole = roles.find(r => r.role === 'GUEST') || DEFAULT_GUEST_PERMISSIONS;
    const adminRole = roles.find(r => r.role === 'ADMIN') || DEFAULT_ADMIN_PERMISSIONS;

    if (typeof guestRole.allowed_menus === 'string') {
      try { guestRole.allowed_menus = JSON.parse(guestRole.allowed_menus); } catch (_) {}
    }
    if (typeof adminRole.allowed_menus === 'string') {
      try { adminRole.allowed_menus = JSON.parse(adminRole.allowed_menus); } catch (_) {}
    }

    return response_(true, {
      guestPermissions: guestRole,
      allRoles: roles.length ? roles : [DEFAULT_GUEST_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS]
    }, 'Hak akses sistem dimuat.');
  } catch (error) {
    return response_(true, {
      guestPermissions: DEFAULT_GUEST_PERMISSIONS,
      allRoles: [DEFAULT_GUEST_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS]
    }, 'Menggunakan hak akses default.');
  }
}

/**
 * Mengambil data manajemen pengguna & hak akses (Khusus Admin)
 */
function getUserManagementData() {
  try {
    let users = [];
    let roles = [];
    try {
      users = supabaseRequest_('app_users?select=id,username,full_name,role,is_active,created_at&order=created_at.asc', 'get') || [];
    } catch (_) {}

    try {
      roles = supabaseRequest_('app_role_permissions?select=*', 'get') || [];
      roles.forEach(r => {
        if (typeof r.allowed_menus === 'string') {
          try { r.allowed_menus = JSON.parse(r.allowed_menus); } catch (_) {}
        }
      });
    } catch (_) {}

    if (!roles.length) {
      roles = [DEFAULT_GUEST_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS];
    }

    return response_(true, {
      users: users,
      roles: roles
    }, 'Data manajemen user & hak akses dimuat.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * Simpan / Update Pengaturan Hak Akses Peran
 */
function saveRolePermissions(roleKey, allowedMenus, permissionsObj) {
  try {
    if (!roleKey) throw new Error('Role key wajib diisi.');
    const menus = Array.isArray(allowedMenus) ? allowedMenus : [];

    const payload = {
      role: roleKey,
      allowed_menus: menus,
      can_upload: Boolean(permissionsObj?.can_upload),
      can_run_ai: Boolean(permissionsObj?.can_run_ai),
      can_merge: Boolean(permissionsObj?.can_merge),
      can_manage_settings: Boolean(permissionsObj?.can_manage_settings),
      updated_at: new Date().toISOString()
    };

    supabaseRequest_('app_role_permissions?role=eq.' + encodeURIComponent(roleKey), 'patch', payload);
    writeAudit_('RBAC', 'UPDATE_PERMISSIONS', roleKey, 'Perbarui hak akses menu: ' + menus.join(', '));
    return response_(true, payload, 'Hak akses peran ' + roleKey + ' berhasil diperbarui.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * Simpan / Tambah Pengguna Baru (Admin)
 */
function saveAppUser(userData) {
  try {
    if (!userData || !userData.username) throw new Error('Username wajib diisi.');
    const uName = cleanText_(userData.username).toLowerCase();
    const fullName = cleanText_(userData.full_name) || uName;
    const role = userData.role || 'OPERATOR';
    const isActive = userData.is_active !== undefined ? Boolean(userData.is_active) : true;

    if (userData.id) {
      const patchData = {
        full_name: fullName,
        role: role,
        is_active: isActive
      };
      if (userData.password) {
        patchData.password_hash = hashPassword_(userData.password);
      }
      supabaseRequest_('app_users?id=eq.' + userData.id, 'patch', patchData);
      writeAudit_('USER_MGMT', 'UPDATE_USER', uName, 'Perbarui profil user');
      return response_(true, { id: userData.id, username: uName }, 'Pengguna ' + uName + ' berhasil diperbarui.');
    } else {
      if (!userData.password) throw new Error('Password wajib diisi untuk pengguna baru.');
      const newPayload = [{
        username: uName,
        full_name: fullName,
        password_hash: hashPassword_(userData.password),
        role: role,
        is_active: isActive
      }];
      const res = supabaseRequest_('app_users', 'post', newPayload);
      writeAudit_('USER_MGMT', 'CREATE_USER', uName, 'Buat pengguna baru dengan peran ' + role);
      return response_(true, res[0], 'Pengguna ' + uName + ' berhasil didaftarkan.');
    }
  } catch (error) {
    return response_(false, null, error.message);
  }
}

/**
 * Hapus Pengguna (Admin)
 */
function deleteAppUser(userId, username) {
  try {
    if (String(username).toLowerCase() === 'admin') {
      throw new Error('Akun Administrator utama tidak boleh dihapus.');
    }
    supabaseRequest_('app_users?id=eq.' + userId, 'delete');
    writeAudit_('USER_MGMT', 'DELETE_USER', username, 'Hapus akun pengguna');
    return response_(true, { id: userId }, 'Pengguna berhasil dihapus.');
  } catch (error) {
    return response_(false, null, error.message);
  }
}
