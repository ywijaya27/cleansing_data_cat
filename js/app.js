(() => {
  'use strict';

  const state = {
    page: 1,
    pageSize: 25,
    selectedFile: null,
    parsedRows: [],
    chart: null,
    configured: false,
    supabaseUrl: 'https://tayybadwfypmedjixemd.supabase.co',
    duplicates: [],
    similarities: [],
    activeDuplicate: null,
    currentUser: {
      role: 'GUEST',
      username: 'guest',
      fullName: 'Pengunjung (Guest)'
    },
    accessControl: {
      role: 'GUEST',
      allowed_menus: ['dashboard', 'materials', 'similarity', 'consistency'],
      can_upload: false,
      can_run_ai: false,
      can_merge: false,
      can_manage_settings: false
    },
    allRoles: [],
    users: [],
    consistencyData: []
  };

  const titles = {
    dashboard: 'Executive Dashboard',
    upload: 'Upload Material',
    materials: 'Material Master',
    duplicates: 'Duplicate Review',
    similarity: 'Similar Material',
    consistency: 'Cek Konsistensi & Standar Katalog',
    reports: 'Laporan Efisiensi Approved Duplicates',
    users: 'User & Hak Akses (RBAC)',
    settings: 'Pengaturan'
  };

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const fmt = n => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
  const money = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
  const dateFmt = v => v ? new Date(v).toLocaleString('id-ID') : '-';

  /**
   * Pemanggilan Fungsi Server Google Apps Script (google.script.run)
   */
  async function callServer(name, ...args) {
    if (typeof window.callServer === 'function') {
      return await window.callServer(name, ...args);
    }
    throw new Error('API client tidak tersedia.');
  }

  function showLoading(show, message = 'Memproses...') {
    const el = $('loadingOverlay');
    if (!el) return;
    $('loadingMessage').textContent = message;
    el.classList.toggle('d-none', !show);
  }

  function toast(message, type = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.style.borderLeft = `4px solid ${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)'}`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  function updateConnectionUI(connected, message, url) {
    const dot = $('statusDot');
    const label = $('systemStatus');
    const badge = $('connectionBadge');
    const badgeText = $('badgeText');
    const configMsg = $('configMessage');

    if (dot) {
      dot.className = 'status-dot ' + (connected ? 'online' : 'offline');
    }
    if (label) {
      label.textContent = connected ? 'Supabase Connected' : 'Disconnected';
    }
    if (badge && badgeText) {
      badge.className = 'status-badge ' + (connected ? 'connected' : 'disconnected');
      badgeText.textContent = connected ? 'Terhubung' : 'Belum Terhubung';
    }
    if (configMsg) {
      configMsg.textContent = message || (connected ? 'Supabase aktif dan siap digunakan.' : 'Koneksi belum terkonfigurasi.');
    }
    if ($('gasUrlInput')) {
      $('gasUrlInput').value = localStorage.getItem('gas_url') || (window.APP_CONFIG && window.APP_CONFIG.GAS_URL) || '';
    }
    if ($('supabaseUrlInput')) {
      $('supabaseUrlInput').value = url || localStorage.getItem('supabase_url') || (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || 'https://tayybadwfypmedjixemd.supabase.co';
    }
    if ($('supabaseKeyInput')) {
      const savedKey = localStorage.getItem('supabase_key') || (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_KEY) || '';
      if (savedKey && !$('supabaseKeyInput').value) {
        $('supabaseKeyInput').value = savedKey;
      }
    }
  }

  function isMenuAllowed(section) {
    if (state.currentUser.role === 'ADMIN') return true;
    if (section === 'reports') return true;
    const allowed = state.accessControl?.allowed_menus || ['dashboard', 'materials', 'similarity', 'reports'];
    return allowed.includes(section);
  }

  function applyAccessControl() {
    const isAdm = (state.currentUser.role === 'ADMIN');
    const allowedMenus = state.accessControl?.allowed_menus || ['dashboard', 'materials', 'similarity', 'reports'];

    // Update Sidebar Navigation Items
    document.querySelectorAll('.nav-item').forEach(el => {
      const sec = el.dataset.section;
      const allowed = isAdm || sec === 'reports' || allowedMenus.includes(sec);
      el.classList.toggle('locked', !allowed);
    });

    // Update Topbar User Chip & Action Buttons
    const userChip = $('userChip');
    const userNameEl = $('currentUser');
    const loginBtn = $('openLoginModalBtn');
    const logoutBtn = $('logoutBtn');
    const sidebarLogoutBtn = $('sidebarLogoutBtn');
    const roleLabel = $('sidebarRoleLabel');

    if (isAdm) {
      if (userChip) userChip.classList.add('admin');
      if (userNameEl) userNameEl.textContent = (state.currentUser.fullName || 'Admin') + ' (Admin)';
      if (loginBtn) loginBtn.classList.add('d-none');
      if (logoutBtn) logoutBtn.classList.remove('d-none');
      if (sidebarLogoutBtn) sidebarLogoutBtn.classList.remove('d-none');
      if (roleLabel) roleLabel.innerHTML = '<i class="bi bi-shield-check text-accent me-1"></i>Administrator';
    } else {
      if (userChip) userChip.classList.remove('admin');
      if (userNameEl) userNameEl.textContent = 'Pengunjung (Guest)';
      if (loginBtn) loginBtn.classList.remove('d-none');
      if (logoutBtn) logoutBtn.classList.add('d-none');
      if (sidebarLogoutBtn) sidebarLogoutBtn.classList.add('d-none');
      if (roleLabel) roleLabel.innerHTML = '<i class="bi bi-person me-1"></i>Mode Pengunjung (Guest)';
    }

    // Aksi tombol khusus
    if ($('runAiAnalysisBtn')) {
      const canRunAi = isAdm || Boolean(state.accessControl?.can_run_ai);
      $('runAiAnalysisBtn').classList.toggle('d-none', !canRunAi);
    }
    if ($('btnMergeDuplicate')) {
      const canMerge = isAdm || Boolean(state.accessControl?.can_merge);
      $('btnMergeDuplicate').classList.toggle('d-none', !canMerge);
    }
  }

  function navigateTo(section) {
    if (!isMenuAllowed(section)) {
      toast(`Menu "${titles[section] || section}" memerlukan login Admin. Silakan login sebagai Admin untuk mengakses menu ini.`, 'error');
      openAdminLoginModal();
      return;
    }

    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === section));

    const target = $(`section-${section}`);
    if (target) target.classList.add('active');

    if ($('pageTitle')) $('pageTitle').textContent = titles[section] || 'Aplikasi';
    if ($('sidebar')) $('sidebar').classList.remove('open');

    if (section === 'dashboard') loadDashboard();
    if (section === 'materials') loadMaterials();
    if (section === 'duplicates') loadDuplicates();
    if (section === 'similarity') loadSimilarity();
    if (section === 'consistency') loadConsistencyView();
    if (section === 'reports') loadApprovedReport();
    if (section === 'upload') loadUploadHistory();
    if (section === 'users') loadUserManagement();
  }

  window.navigateToSection = navigateTo;

  /**
   * Inisialisasi Aplikasi
   */
  async function init() {
    restoreAdminSession();
    bindEvents();
    restoreTheme();
    await checkAppStatus();
    await loadAccessControl();
    applyAccessControl();
    loadDashboard();
  }

  function restoreAdminSession() {
    try {
      const saved = sessionStorage.getItem('admin_session');
      if (saved) {
        const u = JSON.parse(saved);
        if (u && u.role === 'ADMIN') {
          state.currentUser = u;
          if (u.permissions) state.accessControl = u.permissions;
        }
      }
    } catch (_) {}
  }

  async function loadAccessControl() {
    try {
      const r = await callServer('getSystemAccessControl');
      const d = r.data || {};
      state.allRoles = d.allRoles || [];
      if (state.currentUser.role === 'GUEST') {
        state.accessControl = d.guestPermissions || state.accessControl;
      }
    } catch (_) {}
  }

  async function checkAppStatus() {
    try {
      const r = await callServer('getAppStatus');
      const d = r.data || {};
      state.configured = Boolean(d.configured && d.connectionOk);
      state.supabaseUrl = d.url || state.supabaseUrl;

      if ($('currentUser')) $('currentUser').textContent = d.userEmail || 'GAS User';
      updateConnectionUI(state.configured, d.connMessage, state.supabaseUrl);

      if (!state.configured && !d.configured) {
        toast('Supabase belum dikonfigurasi. Silakan buka menu Pengaturan.', 'error');
      }
    } catch (e) {
      state.configured = false;
      updateConnectionUI(false, e.message, state.supabaseUrl);
      toast(e.message, 'error');
    }
  }

  function bindEvents() {
    // Navigasi
    document.querySelectorAll('.nav-item').forEach(b => {
      b.addEventListener('click', () => navigateTo(b.dataset.section));
    });

    $('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
    $('themeToggle').addEventListener('click', toggleTheme);

    // Consistency Audit Actions
    if ($('runConsistencyAuditBtn')) $('runConsistencyAuditBtn').addEventListener('click', runConsistencyAudit);
    if ($('exportConsistencyBtn')) $('exportConsistencyBtn').addEventListener('click', exportConsistencyExcel);
    if ($('consistencyStatusFilter')) $('consistencyStatusFilter').addEventListener('change', renderConsistencyTable);
    if ($('consistencyTemplateFilter')) $('consistencyTemplateFilter').addEventListener('change', renderConsistencyTable);
    if ($('consistencySearchInput')) $('consistencySearchInput').addEventListener('input', debounce(renderConsistencyTable, 300));
    if ($('abvSearchInput')) $('abvSearchInput').addEventListener('input', debounce(renderAbbreviationModalTable, 250));

    // Upload
    $('materialFile').addEventListener('change', handleFile);
    $('uploadBtn').addEventListener('click', uploadFile);
    $('downloadTemplate').addEventListener('click', downloadTemplate);

    // Material Master
    $('materialSearch').addEventListener('input', debounce(() => {
      state.page = 1;
      loadMaterials();
    }, 450));
    $('prevPage').addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadMaterials();
      }
    });
    $('nextPage').addEventListener('click', () => {
      state.page++;
      loadMaterials();
    });

    // Logout Actions
    const openLogout = () => {
      const modalEl = $('logoutModal');
      if (modalEl && typeof bootstrap !== 'undefined') {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      } else {
        if (confirm('Apakah Anda yakin ingin keluar dari sistem?')) {
          executeLogout();
        }
      }
    };

    if ($('logoutBtn')) $('logoutBtn').addEventListener('click', openLogout);
    if ($('sidebarLogoutBtn')) $('sidebarLogoutBtn').addEventListener('click', openLogout);
    if ($('confirmLogoutBtn')) $('confirmLogoutBtn').addEventListener('click', executeLogout);

    // Admin Login Modal & Actions
    if ($('openLoginModalBtn')) $('openLoginModalBtn').addEventListener('click', openAdminLoginModal);
    if ($('adminLoginForm')) $('adminLoginForm').addEventListener('submit', handleAdminLogin);
    if ($('submitLoginBtn')) $('submitLoginBtn').addEventListener('click', handleAdminLogin);

    // Tab Management User & RBAC
    if ($('tab-rbac-btn')) {
      $('tab-rbac-btn').addEventListener('click', () => {
        $('tab-rbac-btn').className = 'btn btn-sm btn-accent';
        $('tab-users-btn').className = 'btn btn-sm btn-outline-accent';
        $('panel-rbac').classList.remove('d-none');
        $('panel-users-list').classList.add('d-none');
      });
    }
    if ($('tab-users-btn')) {
      $('tab-users-btn').addEventListener('click', () => {
        $('tab-users-btn').className = 'btn btn-sm btn-accent';
        $('tab-rbac-btn').className = 'btn btn-sm btn-outline-accent';
        $('panel-users-list').classList.remove('d-none');
        $('panel-rbac').classList.add('d-none');
      });
    }

    // Role Config Dropdown
    if ($('selectRoleConfig')) {
      $('selectRoleConfig').addEventListener('change', (e) => {
        populateRoleForm(e.target.value);
      });
    }

    // Save Permissions Button
    if ($('savePermissionsBtn')) {
      $('savePermissionsBtn').addEventListener('click', handleSavePermissions);
    }

    // User Form Modal Actions
    if ($('openNewUserModalBtn')) $('openNewUserModalBtn').addEventListener('click', openNewUserModal);
    if ($('userForm')) $('userForm').addEventListener('submit', handleSaveUser);
    if ($('saveUserSubmitBtn')) $('saveUserSubmitBtn').addEventListener('click', handleSaveUser);

    // Pengaturan Koneksi Supabase
    if ($('saveConfigBtn')) $('saveConfigBtn').addEventListener('click', handleSaveConfig);
    if ($('testConnectionBtn')) $('testConnectionBtn').addEventListener('click', handleTestConnection);

    // AI Engine Trigger
    if ($('runAiAnalysisBtn')) $('runAiAnalysisBtn').addEventListener('click', handleRunAiAnalysis);

    // Filter Duplicate
    if ($('dupScoreFilter')) $('dupScoreFilter').addEventListener('change', renderDuplicatesTable);
    if ($('dupStatusFilter')) $('dupStatusFilter').addEventListener('change', renderDuplicatesTable);
    if ($('dupSearchInput')) $('dupSearchInput').addEventListener('input', debounce(renderDuplicatesTable, 300));

    // Filter Similarity
    if ($('simTypeFilter')) $('simTypeFilter').addEventListener('change', renderSimilarityTable);

    // Laporan Efisiensi Actions
    if ($('openReportSectionBtn')) $('openReportSectionBtn').addEventListener('click', () => navigateTo('reports'));
    if ($('exportReportExcelBtn')) $('exportReportExcelBtn').addEventListener('click', exportReportExcel);
    if ($('printReportBtn')) $('printReportBtn').addEventListener('click', () => window.print());
    if ($('reportStatusFilter')) $('reportStatusFilter').addEventListener('change', loadApprovedReport);

    // Modal Actions Review Duplicate
    if ($('btnMergeDuplicate')) $('btnMergeDuplicate').addEventListener('click', () => handleSaveDuplicateDecision('MERGE_AND_OBSOLETE'));
    if ($('btnConfirmDuplicate')) $('btnConfirmDuplicate').addEventListener('click', () => handleSaveDuplicateDecision('APPROVED_DUPLICATE'));
    if ($('btnRejectDuplicate')) $('btnRejectDuplicate').addEventListener('click', () => handleSaveDuplicateDecision('REJECTED_DIFFERENT'));
    if ($('toggleKeyVisibility')) {
      $('toggleKeyVisibility').addEventListener('click', () => {
        const inp = $('supabaseKeyInput');
        const icon = $('toggleKeyVisibility').querySelector('i');
        if (inp.type === 'password') {
          inp.type = 'text';
          icon.className = 'bi bi-eye-slash';
        } else {
          inp.type = 'password';
          icon.className = 'bi bi-eye';
        }
      });
    }
  }

  async function handleSaveConfig() {
    const gasUrl = $('gasUrlInput') ? $('gasUrlInput').value.trim() : '';
    const url = $('supabaseUrlInput').value.trim();
    const key = $('supabaseKeyInput').value.trim();

    if (gasUrl) {
      localStorage.setItem('gas_url', gasUrl);
    } else {
      localStorage.removeItem('gas_url');
    }

    if (!gasUrl && !url) {
      toast('Project URL Supabase atau Apps Script URL wajib diisi.', 'error');
      return;
    }
    if (!gasUrl && !key) {
      toast('Service Role Key Supabase wajib diisi jika tidak memakai Google Apps Script URL.', 'error');
      return;
    }

    try {
      showLoading(true, 'Menyimpan & menguji koneksi...');
      if (url && key) {
        const r = await callServer('setupSupabaseConfig', url, key);
        toast(r.message || 'Konfigurasi berhasil disimpan!', 'success');
      } else {
        const r = await callServer('testSupabaseConnection');
        toast(r.message || 'Koneksi ke Google Apps Script berhasil!', 'success');
      }
      await checkAppStatus();
      await loadAccessControl();
      applyAccessControl();
      loadDashboard();
    } catch (e) {
      toast('Gagal menyimpan konfigurasi: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleTestConnection() {
    try {
      showLoading(true, 'Menguji koneksi ke Supabase...');
      const r = await callServer('testSupabaseConnection');
      toast(r.message || 'Koneksi ke Supabase BERHASIL!', 'success');
      await checkAppStatus();
    } catch (e) {
      toast('Uji koneksi gagal: ' + e.message, 'error');
      updateConnectionUI(false, e.message);
    } finally {
      showLoading(false);
    }
  }

  function openAdminLoginModal() {
    if ($('adminLoginForm')) $('adminLoginForm').reset();
    const noticeEl = $('loginConfigWarning');
    if (noticeEl) {
      noticeEl.classList.toggle('d-none', Boolean(state.configured));
    }
    const modalEl = $('adminLoginModal');
    if (modalEl && typeof bootstrap !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  async function handleAdminLogin(e) {
    if (e && e.preventDefault) e.preventDefault();

    const u = $('loginUsername').value.trim();
    const p = $('loginPassword').value;

    if (!u || !p) {
      toast('Username dan password wajib diisi.', 'error');
      return;
    }

    try {
      showLoading(true, 'Memverifikasi akun Administrator...');
      const r = await callServer('loginUser', u, p);
      const user = r.data;
      if (user && !user.full_name && user.fullName) {
        user.full_name = user.fullName;
      }
      state.configured = true;
      state.currentUser = user;
      state.accessControl = user.permissions || {};
      sessionStorage.setItem('admin_session', JSON.stringify(user));

      const modalEl = $('adminLoginModal');
      if (modalEl && typeof bootstrap !== 'undefined') {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      updateConnectionUI(true, 'Terhubung via Google Apps Script Web App', state.supabaseUrl);
      await loadAccessControl();
      applyAccessControl();
      toast(`Selamat datang kembali, ${user.full_name || user.fullName || user.username}! Anda masuk sebagai Administrator.`, 'success');
      loadDashboard();
    } catch (err) {
      toast('Login gagal: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  function executeLogout() {
    const modalEl = $('logoutModal');
    if (modalEl && typeof bootstrap !== 'undefined') {
      const m = bootstrap.Modal.getInstance(modalEl);
      if (m) m.hide();
    }
    sessionStorage.removeItem('admin_session');
    state.currentUser = { username: 'guest', full_name: 'Pengunjung', role: 'GUEST' };
    loadAccessControl().then(() => {
      applyAccessControl();
      navigateTo('dashboard');
      toast('Anda telah keluar dari akun Administrator. Sekarang dalam Mode Pengunjung (Guest).', 'info');
    });
  }

  function restoreTheme() {
    document.documentElement.dataset.theme = localStorage.getItem('material-theme') || 'dark';
    updateThemeIcon();
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('material-theme', next);
    updateThemeIcon();
    if (state.chart) loadDashboard();
  }

  function updateThemeIcon() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    $('themeToggle').innerHTML = `<i class="bi ${isDark ? 'bi-sun' : 'bi-moon'}"></i>`;
  }

  /**
   * Load Dashboard Analytics
   */
  async function loadDashboard() {
    try {
      const r = await callServer('getDashboardData');
      const d = r.data || {};
      $('kpiTotal').textContent = fmt(d.totalMaterial);
      $('kpiDuplicate').textContent = fmt(d.duplicateCandidate);
      $('kpiSimilar').textContent = fmt(d.similarCandidate);
      $('kpiPending').textContent = fmt(d.pendingReview);
      $('kpiQuality').textContent = fmt(d.dataQualityScore) + '%';
      $('aiInsight').textContent = d.insight || 'Tidak ada catatan analisis.';
      renderIssues(d.qualityIssues);
      renderChart(d.commodity);
    } catch (e) {
      console.warn('Dashboard load issue:', e);
      if (!state.configured) {
        $('aiInsight').textContent = 'Koneksi Supabase belum aktif. Buka menu Pengaturan untuk menghubungkan database.';
      } else {
        toast('Dashboard: ' + e.message, 'error');
      }
    }
  }

  function renderIssues(i = {}) {
    $('qualityIssues').innerHTML = Object.entries({
      missingCode: 'Missing Material Code',
      missingDescription: 'Missing Description',
      missingManufacturer: 'Missing Manufacturer',
      missingPartNumber: 'Missing Part Number',
      missingUom: 'Missing UOM'
    }).map(([k, l]) => `<div class="issue-row"><span>${l}</span><strong>${fmt(i[k])}</strong></div>`).join('');
  }

  function renderChart(rows = []) {
    if (state.chart) state.chart.destroy();
    const dark = document.documentElement.dataset.theme === 'dark';
    const canvas = $('commodityChart');
    if (!canvas) return;

    state.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map(x => x.label),
        datasets: [{
          label: 'Materials',
          data: rows.map(x => x.value),
          backgroundColor: '#00c896',
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: dark ? '#8ea0b4' : '#687789' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: dark ? '#8ea0b4' : '#687789' }, grid: { color: dark ? '#25364a' : '#dce4ec' } }
        }
      }
    });
  }

  /**
   * Upload File Handler
   */
  async function handleFile(e) {
    const f = e.target.files[0];
    state.selectedFile = f;
    state.parsedRows = [];
    if (!f) return;

    if (f.size > 50 * 1024 * 1024) {
      toast('Ukuran file melebihi 50 MB', 'error');
      e.target.value = '';
      return;
    }

    $('fileInfo').classList.remove('d-none');
    $('fileInfo').textContent = `${f.name} • ${(f.size / 1024 / 1024).toFixed(2)} MB`;

    try {
      showLoading(true, 'Membaca spreadsheet...');
      state.parsedRows = await parseSpreadsheet(f);
      showLoading(false);

      if (state.parsedRows.length > 100000) throw new Error('Record melebihi batas 100.000 baris.');
      $('uploadBtn').disabled = false;
      toast(`${fmt(state.parsedRows.length)} record siap divalidasi & diupload.`);
    } catch (err) {
      showLoading(false);
      $('uploadBtn').disabled = true;
      toast(err.message, 'error');
    }
  }

  function parseSpreadsheet(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File tidak dapat dibaca.'));
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
          resolve(raw.map(mapHeaders));
        } catch (err) {
          reject(new Error('Format spreadsheet tidak valid: ' + err.message));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function mapHeaders(r) {
    const out = {};
    Object.entries(r).forEach(([k, v]) => {
      const key = k.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const aliases = {
        material: 'material_code',
        material_number: 'material_code',
        kode_material: 'material_code',
        description: 'material_description',
        item_text_result: 'material_description',
        item_text: 'material_description',
        material_desc: 'material_description',
        deskripsi: 'material_description',
        brand: 'manufacturer',
        manufacture: 'manufacturer',
        mfr: 'manufacturer',
        pabrikan: 'manufacturer',
        part_no: 'part_number',
        nomor_part: 'part_number',
        major_name: 'noun',
        major_name_noun: 'noun',
        noun: 'noun',
        modifier_1: 'modifier1',
        modifier_2: 'modifier2',
        modifier_3: 'modifier3',
        template: 'template_code',
        template_code: 'template_code',
        nomor_part: 'part_number',
        material_group_desc: 'material_group',
        grup: 'material_group',
        uom: 'base_uom',
        satuan: 'base_uom',
        base_unit: 'base_uom',
        quantity: 'stock_qty',
        stock: 'stock_qty',
        jumlah: 'stock_qty',
        value: 'stock_value',
        inventory_value: 'stock_value',
        nilai_stok: 'stock_value'
      };
      out[aliases[key] || key] = v;
    });
    return out;
  }

  async function uploadFile() {
    if (!state.selectedFile || !state.parsedRows.length) return;
    try {
      showLoading(true, 'Mengupload ke Supabase...');
      const r = await callServer('uploadMaterials', state.parsedRows, state.selectedFile.name);
      toast(`Upload selesai: ${fmt(r.data.inserted)} masuk, ${fmt(r.data.errors)} error`, r.data.errors ? 'warning' : 'success');
      $('materialFile').value = '';
      $('uploadBtn').disabled = true;
      state.parsedRows = [];
      loadUploadHistory();
      loadDashboard();
    } catch (e) {
      toast('Upload gagal: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function loadUploadHistory() {
    try {
      const r = await callServer('getUploadHistory', 20);
      const rows = r.data || [];
      $('uploadHistoryBody').innerHTML = rows.length ? rows.map(x => `
        <tr>
          <td>${escapeHtml(x.file_name)}</td>
          <td>${fmt(x.total_records)}</td>
          <td><span class="badge ${x.status === 'COMPLETED' ? 'bg-success' : 'bg-warning'}">${escapeHtml(x.status)}</span></td>
          <td>${escapeHtml(x.uploaded_by)}</td>
          <td>${dateFmt(x.created_at || x.upload_date)}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="text-center text-muted">Belum ada riwayat upload.</td></tr>';
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /**
   * Material Master Management
   */
  async function loadMaterials() {
    try {
      const r = await callServer('getMaterials', state.page, state.pageSize, $('materialSearch').value);
      const rows = r.data.rows || [];
      $('materialsBody').innerHTML = rows.length ? rows.map(x => `
        <tr>
          <td><strong>${escapeHtml(x.material_code)}</strong></td>
          <td>${escapeHtml(x.material_description)}</td>
          <td>${escapeHtml(x.manufacturer || '-')}</td>
          <td>${escapeHtml(x.part_number || '-')}</td>
          <td>${escapeHtml(x.material_group || '-')}</td>
          <td>${fmt(x.stock_qty)}</td>
          <td>${money(x.stock_value)}</td>
          <td><button type="button" class="btn btn-sm btn-outline-accent normalize-btn" data-id="${x.id}">Normalize</button></td>
        </tr>
      `).join('') : '<tr><td colspan="8" class="text-center text-muted">Data tidak ditemukan.</td></tr>';

      $('pageIndicator').textContent = 'Page ' + state.page;
      document.querySelectorAll('.normalize-btn').forEach(b => {
        b.addEventListener('click', () => normalizeOne(b.dataset.id));
      });

      if (!rows.length && state.page > 1) {
        state.page--;
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function normalizeOne(id) {
    try {
      showLoading(true, 'Menormalisasi data...');
      const r = await callServer('normalizeMaterial', id);
      toast('Normalized: ' + (r.data?.normalized_description || 'Berhasil'), 'success');
      loadMaterials();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  /**
   * JALANKAN AI CLEANSING & RATIONALIZATION ENGINE
   */
  async function handleRunAiAnalysis() {
    try {
      showLoading(true, 'Menjalankan AI Duplicate & Similarity Detection Engine...');
      const r = await callServer('runAICleansingAnalysis', 75, 60);
      toast(r.message || 'Analisis AI selesai diproses!', 'success');
      await Promise.all([
        loadDuplicates(),
        loadSimilarity(),
        loadDashboard()
      ]);
    } catch (e) {
      toast('Gagal menjalankan Analisis AI: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  /**
   * DUPLICATE REVIEW & CLUSTER ENGINE
   */
  async function loadDuplicates() {
    try {
      const r = await callServer('getDuplicateCandidates', 300);
      state.duplicates = r.data || [];
      renderDuplicatesTable();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function renderDuplicatesTable() {
    const minScore = Number($('dupScoreFilter')?.value || 75);
    const statusFilter = $('dupStatusFilter')?.value || 'ALL';
    const searchQuery = ($('dupSearchInput')?.value || '').toLowerCase().trim();

    const filtered = state.duplicates.filter(item => {
      const scoreOk = (Number(item.duplicate_score) || 0) >= minScore;
      const statusOk = (statusFilter === 'ALL') || (item.review_status === statusFilter);
      const searchOk = !searchQuery || 
        (item.candidate_id || '').toLowerCase().includes(searchQuery) ||
        (item.cluster_id || '').toLowerCase().includes(searchQuery) ||
        (item.code_a || '').toLowerCase().includes(searchQuery) ||
        (item.code_b || '').toLowerCase().includes(searchQuery) ||
        (item.desc_a || '').toLowerCase().includes(searchQuery) ||
        (item.desc_b || '').toLowerCase().includes(searchQuery);
      return scoreOk && statusOk && searchOk;
    });

    // Update Mini Stat Bar
    const uniqueClusters = new Set(filtered.map(x => x.cluster_id || x.candidate_id)).size;
    const totalSavings = filtered.reduce((acc, curr) => acc + Number(curr.potential_saving || 0), 0);

    if ($('dupStatPairs')) $('dupStatPairs').textContent = fmt(filtered.length);
    if ($('dupStatClusters')) $('dupStatClusters').textContent = fmt(uniqueClusters);
    if ($('dupStatSavings')) $('dupStatSavings').textContent = money(totalSavings);

    const tbody = $('duplicatesBody');
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted p-4">Tidak ada data kandidat duplikasi yang sesuai filter. Klik "Jalankan Analisis AI" untuk memulai deteksi.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(x => {
      const scoreVal = Number(x.duplicate_score) || 0;
      const scoreBadgeClass = scoreVal >= 95 ? 'score-high' : scoreVal >= 85 ? 'score-mid' : 'score-low';
      const statusBadgeClass = x.review_status === 'MERGE_AND_OBSOLETE' ? 'bg-success' :
                               x.review_status === 'REJECTED_DIFFERENT' ? 'bg-danger' :
                               x.review_status === 'APPROVED_DUPLICATE' ? 'bg-warning text-dark' : 'bg-secondary';

      return `
        <tr>
          <td><span class="badge bg-primary">${escapeHtml(x.cluster_id || '-')}</span></td>
          <td><small class="text-muted fw-bold">${escapeHtml(x.candidate_id)}</small></td>
          <td>
            <div class="d-flex align-items-center gap-1">
              <span class="badge ${x.is_master_a ? 'bg-success' : 'bg-secondary'}" style="font-size:10px;">${x.is_master_a ? 'Master' : 'A'}</span>
              <strong>${escapeHtml(x.code_a || x.material_id_a)}</strong>
            </div>
            <small class="text-muted text-truncate d-inline-block" style="max-width:200px;">${escapeHtml(x.desc_a || '-')}</small>
          </td>
          <td>
            <div class="d-flex align-items-center gap-1">
              <span class="badge ${x.is_master_b ? 'bg-success' : 'bg-secondary'}" style="font-size:10px;">${x.is_master_b ? 'Master' : 'B'}</span>
              <strong>${escapeHtml(x.code_b || x.material_id_b)}</strong>
            </div>
            <small class="text-muted text-truncate d-inline-block" style="max-width:200px;">${escapeHtml(x.desc_b || '-')}</small>
          </td>
          <td><span class="badge-score ${scoreBadgeClass}">${scoreVal.toFixed(1)}%</span></td>
          <td><small class="fw-semibold text-wrap">${escapeHtml(x.rationalization_action || x.recommendation || '-')}</small></td>
          <td><span class="badge ${statusBadgeClass}">${escapeHtml(x.review_status || 'PENDING')}</span></td>
          <td>
            <button type="button" class="btn btn-sm btn-outline-accent review-dup-btn" data-cid="${escapeHtml(x.candidate_id)}">
              <i class="bi bi-eye me-1"></i>Review
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Bind event tombol review
    tbody.querySelectorAll('.review-dup-btn').forEach(b => {
      b.addEventListener('click', () => openDuplicateModal(b.dataset.cid));
    });
  }

  function openDuplicateModal(candidateId) {
    const item = state.duplicates.find(d => d.candidate_id === candidateId);
    if (!item) return;

    state.activeDuplicate = item;

    // Badges & Score
    if ($('modalClusterBadge')) $('modalClusterBadge').textContent = item.cluster_id || 'CLUST-0001';
    if ($('modalCandidateBadge')) $('modalCandidateBadge').textContent = item.candidate_id;
    if ($('modalScoreBadge')) {
      const sc = Number(item.duplicate_score) || 0;
      $('modalScoreBadge').className = 'badge-score ' + (sc >= 95 ? 'score-high' : sc >= 85 ? 'score-mid' : 'score-low');
      $('modalScoreBadge').textContent = sc.toFixed(1) + '% ' + (item.confidence_level || '');
    }

    // Material A Details
    $('detailCodeA').textContent = item.code_a || '-';
    $('detailDescA').textContent = item.desc_a || '-';
    $('detailMfrA').textContent = item.mfr_a || '-';
    $('detailPnA').textContent = item.pn_a || '-';
    $('detailQtyA').textContent = fmt(item.qty_a);
    $('detailValA').textContent = money(item.val_a);
    $('badgeMasterA').classList.toggle('d-none', !item.is_master_a);

    // Material B Details
    $('detailCodeB').textContent = item.code_b || '-';
    $('detailDescB').textContent = item.desc_b || '-';
    $('detailMfrB').textContent = item.mfr_b || '-';
    $('detailPnB').textContent = item.pn_b || '-';
    $('detailQtyB').textContent = fmt(item.qty_b);
    $('detailValB').textContent = money(item.val_b);
    $('badgeMasterB').classList.toggle('d-none', !item.is_master_b);

    // AI Explainability Text & Breakdown
    if ($('detailAiExplanation')) {
      $('detailAiExplanation').textContent = item.ai_explanation || 'Tidak ada catatan penjelasan AI.';
    }
    if ($('factorScorePn')) $('factorScorePn').textContent = (item.part_number_score || 0) + '%';
    if ($('factorScoreMfr')) $('factorScoreMfr').textContent = (item.manufacturer_score || 0) + '%';
    if ($('factorScoreDesc')) $('factorScoreDesc').textContent = (item.description_score || 0) + '%';
    if ($('factorScoreAttr')) $('factorScoreAttr').textContent = (item.attribute_score || 0) + '%';

    // Master Selection Radio
    if (item.is_master_b) {
      $('selectMasterB').checked = true;
    } else {
      $('selectMasterA').checked = true;
    }
    $('labelMasterA').textContent = `Material A (${item.code_a || 'A'})`;
    $('labelMasterB').textContent = `Material B (${item.code_b || 'B'})`;

    // Potential Savings
    if ($('detailPotentialSavings')) {
      $('detailPotentialSavings').textContent = money(item.potential_saving || 0);
    }
    if ($('reviewNotesInput')) {
      $('reviewNotesInput').value = '';
    }

    // Tampilkan Modal
    const modalEl = $('duplicateDetailModal');
    if (modalEl && typeof bootstrap !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  async function handleSaveDuplicateDecision(decision) {
    if (!state.activeDuplicate) return;

    const item = state.activeDuplicate;
    const isMasterA = $('selectMasterA').checked;
    const selectedMaster = isMasterA ? item.code_a : item.code_b;
    const notes = $('reviewNotesInput').value.trim();

    try {
      showLoading(true, 'Menyimpan keputusan review...');
      const reviewer = state.currentUser.full_name || state.currentUser.fullName || state.currentUser.username || 'admin';
      const r = await callServer('saveDuplicateDecision', item.candidate_id, decision, selectedMaster, notes, reviewer);
      toast(r.message || 'Keputusan berhasil disimpan.', 'success');

      // Tutup modal
      const modalEl = $('duplicateDetailModal');
      if (modalEl && typeof bootstrap !== 'undefined') {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      await Promise.all([
        loadDuplicates(),
        loadDashboard()
      ]);
    } catch (e) {
      toast('Gagal menyimpan keputusan: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  /**
   * SIMILARITY DETECTION ENGINE
   */
  async function loadSimilarity() {
    try {
      const r = await callServer('getSimilarMaterials', 200);
      state.similarities = r.data || [];
      renderSimilarityTable();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function renderSimilarityTable() {
    const filterType = $('simTypeFilter')?.value || 'ALL';
    const rows = state.similarities.filter(x => filterType === 'ALL' || x.similarity_type === filterType);
    const tbody = $('similarityBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Belum ada hasil deteksi similarity. Jalankan Analisis AI untuk memetakan alternatif substitusi.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(x => {
      const typeBadge = x.similarity_type === 'ALTERNATIVE_BRAND' ? 'bg-primary' :
                        x.similarity_type === 'EQUIVALENT_SPEC' ? 'bg-info text-dark' :
                        x.similarity_type === 'INTERCHANGEABLE' ? 'bg-warning text-dark' : 'bg-secondary';

      return `
        <tr>
          <td>
            <strong>${escapeHtml(x.material_a)}</strong>
            <small class="text-muted d-block text-truncate" style="max-width:180px;">${escapeHtml(x.desc_a || '')}</small>
            <span class="badge bg-light text-dark border" style="font-size:10px;">${escapeHtml(x.mfr_a || '-')}</span>
          </td>
          <td>
            <strong>${escapeHtml(x.material_b)}</strong>
            <small class="text-muted d-block text-truncate" style="max-width:180px;">${escapeHtml(x.desc_b || '')}</small>
            <span class="badge bg-light text-dark border" style="font-size:10px;">${escapeHtml(x.mfr_b || '-')}</span>
          </td>
          <td><span class="badge ${typeBadge}">${escapeHtml(x.similarity_type || 'SUBSTITUTE')}</span></td>
          <td>${score(x.similarity_score)}</td>
          <td><strong class="text-success">${money(x.saving_opportunity || 0)}</strong></td>
          <td><small class="text-muted text-wrap">${escapeHtml(x.ai_explanation || '-')}</small></td>
        </tr>
      `;
    }).join('');
  }

  /**
   * LAPORAN EFISIENSI & APPROVED DUPLICATES
   */
  async function loadApprovedReport() {
    // 1. Tampilkan informasi user yang sedang login di kop laporan
    const currentUser = state.currentUser || {};
    const fullName = currentUser.full_name || currentUser.fullName || (currentUser.username === 'admin' ? 'Administrator Sistem' : currentUser.username) || 'Pengunjung (Guest)';
    const username = currentUser.username || 'guest';
    const role = currentUser.role || 'GUEST';

    if ($('reportByUserName')) $('reportByUserName').textContent = fullName;
    if ($('reportByUserAccount')) $('reportByUserAccount').textContent = username;
    if ($('reportByUserRole')) {
      $('reportByUserRole').textContent = `(Role: ${role})`;
    }
    if ($('reportGeneratedDate')) {
      $('reportGeneratedDate').textContent = new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
    }
    if ($('printSignName')) $('printSignName').textContent = fullName;
    if ($('printSignRole')) $('printSignRole').textContent = `Reviewer (${role})`;

    const filterVal = $('reportStatusFilter')?.value || 'APPROVED_DUPLICATE';
    if ($('reportFilterBadge')) {
      const label = filterVal === 'ALL_APPROVED' ? 'STATUS: APPROVED & MERGED' :
                    filterVal === 'MERGE_AND_OBSOLETE' ? 'STATUS: MERGE & OBSOLETE' : 'STATUS: APPROVED DUPLICATE';
      $('reportFilterBadge').innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>${label}`;
    }

    try {
      showLoading(true, 'Memuat data laporan efisiensi...');
      const r = await callServer('getApprovedDuplicatesReport', filterVal);
      const data = r.data || {};
      const summary = data.summary || {};
      const items = data.items || [];

      // Simpan di state untuk export excel
      state.reportData = {
        summary,
        items,
        generatedBy: fullName,
        generatedAt: new Date().toLocaleString('id-ID'),
        role: role,
        filter: filterVal
      };

      // Update KPI Cards
      if ($('reportTotalApproved')) $('reportTotalApproved').textContent = fmt(summary.totalApproved || 0);
      if ($('reportTotalSavings')) $('reportTotalSavings').textContent = money(summary.totalPotentialSavings || 0);
      if ($('reportTotalStockValue')) $('reportTotalStockValue').textContent = money(summary.totalStockValue || 0);
      if ($('reportAvgScore')) $('reportAvgScore').textContent = (summary.avgDuplicateScore || 0) + '%';
      if ($('reportRowCountText')) $('reportRowCountText').textContent = `${items.length} item material duplikat`;

      // Render Tabel
      renderReportTable(items);
    } catch (e) {
      toast('Gagal memuat laporan: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  function renderReportTable(items) {
    const tbody = $('reportTableBody');
    if (!tbody) return;

    if (!items || !items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted p-5">
            <i class="bi bi-inbox d-block mb-2" style="font-size: 2rem;"></i>
            Belum ada data material dengan status <strong>Approved Duplicate</strong>.<br>
            Buka menu <a href="javascript:void(0)" onclick="window.navigateToSection('duplicates')" class="text-accent fw-bold">Duplicate Review</a> untuk mereview dan menyetujui kandidat duplikat.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = items.map((x, idx) => {
      const sc = Number(x.duplicate_score) || 0;
      const scoreBadgeClass = sc >= 95 ? 'score-high' : sc >= 85 ? 'score-mid' : 'score-low';
      const statusBadge = x.review_status === 'MERGE_AND_OBSOLETE' ? 'bg-primary' : 'bg-success';
      const statusText = x.review_status === 'MERGE_AND_OBSOLETE' ? 'Merged &amp; Obsolete' : 'Approved Duplicate';
      const mf = (x.match_factors && typeof x.match_factors === 'object') ? x.match_factors : {};
      const reviewer = x.assigned_reviewer || mf.assigned_reviewer || 'admin';
      const rawDate = x.reviewed_at || mf.reviewed_at;
      const reviewDate = rawDate ? new Date(rawDate).toLocaleDateString('id-ID') : '-';
      const reviewNotes = x.review_notes || mf.review_notes || '';

      return `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td>
            <strong>${escapeHtml(x.candidate_id)}</strong>
            <small class="badge bg-secondary d-block mt-1 text-truncate" style="max-width:110px;">${escapeHtml(x.cluster_id || '-')}</small>
          </td>
          <td>
            <strong>${escapeHtml(x.code_a)}</strong>
            <small class="text-muted d-block text-truncate" style="max-width:180px;">${escapeHtml(x.desc_a || '-')}</small>
            <div class="small text-muted mt-1">
              <span>Mfr: <strong>${escapeHtml(x.mfr_a || '-')}</strong></span> |
              <span>PN: <strong>${escapeHtml(x.pn_a || '-')}</strong></span>
            </div>
            <small class="text-muted">Stok: ${fmt(x.qty_a)} (${money(x.val_a)})</small>
          </td>
          <td>
            <strong>${escapeHtml(x.code_b)}</strong>
            <small class="text-muted d-block text-truncate" style="max-width:180px;">${escapeHtml(x.desc_b || '-')}</small>
            <div class="small text-muted mt-1">
              <span>Mfr: <strong>${escapeHtml(x.mfr_b || '-')}</strong></span> |
              <span>PN: <strong>${escapeHtml(x.pn_b || '-')}</strong></span>
            </div>
            <small class="text-muted">Stok: ${fmt(x.qty_b)} (${money(x.val_b)})</small>
          </td>
          <td>
            <span class="badge-score ${scoreBadgeClass}">${sc.toFixed(1)}%</span>
            <small class="text-muted d-block text-truncate mt-1" style="max-width:140px;" title="${escapeHtml(x.ai_explanation || '')}">${escapeHtml(x.ai_explanation || '-')}</small>
          </td>
          <td>
            <strong class="text-success">${money(x.potential_saving || 0)}</strong>
          </td>
          <td>
            <span class="badge ${statusBadge}">${statusText}</span>
            <small class="d-block text-muted mt-1">By: <strong>${escapeHtml(reviewer)}</strong></small>
            <small class="text-muted">${reviewDate}</small>
            ${reviewNotes ? `<small class="text-muted d-block fst-italic">"${escapeHtml(reviewNotes)}"</small>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  function exportReportExcel() {
    if (!state.reportData || !state.reportData.items || !state.reportData.items.length) {
      toast('Tidak ada data laporan untuk diexport.', 'warning');
      return;
    }

    if (typeof XLSX === 'undefined') {
      toast('Pustaka XLSX tidak tersedia.', 'error');
      return;
    }

    const { summary, items, generatedBy, generatedAt, role, filter } = state.reportData;

    // Header Metadata
    const wsData = [
      ['LAPORAN EFISIENSI & RASIONALISASI MATERIAL DUPLIKAT (APPROVED DUPLICATES)'],
      ['Sistem Kecerdasan Material Master Cleansing & Inventory Rationalization'],
      [],
      ['Disiapkan Oleh (Report By):', generatedBy, 'Role:', role],
      ['Tanggal Laporan:', generatedAt, 'Filter Status:', filter],
      ['Total Pasangan Approved:', summary.totalApproved || items.length, 'Total Potensi Efisiensi:', summary.totalPotentialSavings || 0],
      ['Total Nilai Stok Terekspos:', summary.totalStockValue || 0, 'Rata-rata Skor Duplikasi:', (summary.avgDuplicateScore || 0) + '%'],
      [],
      [
        'No',
        'Candidate ID',
        'Cluster ID',
        'Material Code A',
        'Deskripsi Material A',
        'Manufacturer A',
        'Part Number A',
        'Qty Stok A',
        'Nilai Stok A (IDR)',
        'Material Code B',
        'Deskripsi Material B',
        'Manufacturer B',
        'Part Number B',
        'Qty Stok B',
        'Nilai Stok B (IDR)',
        'Skor Duplikasi (%)',
        'Tingkat Confidence',
        'Potensi Efisiensi Biaya (IDR)',
        'Status Review',
        'Reviewer (Reported By)',
        'Tanggal Review',
        'Catatan Review',
        'AI Explainability'
      ]
    ];

    // Data baris
    items.forEach((x, i) => {
      wsData.push([
        i + 1,
        x.candidate_id || '',
        x.cluster_id || '',
        x.code_a || '',
        x.desc_a || '',
        x.mfr_a || '',
        x.pn_a || '',
        Number(x.qty_a) || 0,
        Number(x.val_a) || 0,
        x.code_b || '',
        x.desc_b || '',
        x.mfr_b || '',
        x.pn_b || '',
        Number(x.qty_b) || 0,
        Number(x.val_b) || 0,
        Number(x.duplicate_score) || 0,
        x.confidence_level || '',
        Number(x.potential_saving) || 0,
        x.review_status || '',
        x.assigned_reviewer || (x.match_factors && x.match_factors.assigned_reviewer) || generatedBy,
        (x.reviewed_at || (x.match_factors && x.match_factors.reviewed_at)) ? new Date(x.reviewed_at || x.match_factors.reviewed_at).toLocaleDateString('id-ID') : '',
        x.review_notes || (x.match_factors && x.match_factors.review_notes) || '',
        x.ai_explanation || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set lebar kolom
    ws['!cols'] = [
      { wch: 6 },   // No
      { wch: 18 },  // Candidate ID
      { wch: 14 },  // Cluster ID
      { wch: 16 },  // Code A
      { wch: 40 },  // Desc A
      { wch: 16 },  // Mfr A
      { wch: 18 },  // PN A
      { wch: 12 },  // Qty A
      { wch: 18 },  // Val A
      { wch: 16 },  // Code B
      { wch: 40 },  // Desc B
      { wch: 16 },  // Mfr B
      { wch: 18 },  // PN B
      { wch: 12 },  // Qty B
      { wch: 18 },  // Val B
      { wch: 16 },  // Score
      { wch: 16 },  // Confidence
      { wch: 24 },  // Potensi Efisiensi
      { wch: 20 },  // Status
      { wch: 24 },  // Reviewer
      { wch: 16 },  // Tanggal
      { wch: 30 },  // Catatan
      { wch: 50 }   // Explainability
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan_Efisiensi');

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `Laporan_Approved_Duplicates_Efisiensi_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast(`Laporan Excel berhasil diunduh: ${fileName}`, 'success');
  }

  function score(v) {
    const n = Number(v) || 0;
    const cl = n >= 95 ? 'score-high' : n >= 85 ? 'score-mid' : 'score-low';
    return `<span class="badge-score ${cl}">${n.toFixed(1)}</span>`;
  }

  function downloadTemplate() {
    const data = [
      {
        material_code: '100001',
        material_description: 'BEARING DEEP GROOVE BALL 6210 2RS1',
        manufacturer: 'SKF',
        part_number: '6210-2RS1',
        material_group: 'BEARING',
        base_uom: 'EA',
        stock_qty: 15,
        stock_value: 7500000
      },
      {
        material_code: '100002',
        material_description: 'MOTOR INDUCTION 3 PHASE 5.5KW 1450RPM 380V',
        manufacturer: 'SIEMENS',
        part_number: '1LE0101-1DB43-4AA4',
        material_group: 'ELECTRICAL',
        base_uom: 'UNT',
        stock_qty: 2,
        stock_value: 28000000
      },
      {
        material_code: '100003',
        material_description: 'VALVE BALL FLANGED 2 INCH 150# CF8M',
        manufacturer: 'KITZ',
        part_number: '150UTBM-50',
        material_group: 'VALVE',
        base_uom: 'PCS',
        stock_qty: 8,
        stock_value: 12000000
      },
      {
        material_code: '100004',
        material_description: 'GASKET SPIRAL WOUND 2 INCH 150# SS316 GRAPHITE',
        manufacturer: 'FLEXITALLIC',
        part_number: 'SWG-2-150-SS',
        material_group: 'GASKET',
        base_uom: 'PCS',
        stock_qty: 50,
        stock_value: 4250000
      },
      {
        material_code: '100005',
        material_description: 'PUMP CENTRIFUGAL END SUCTION 50X32-160',
        manufacturer: 'EBARA',
        part_number: 'FSSA 50X32-160',
        material_group: 'MECHANICAL',
        base_uom: 'UNT',
        stock_qty: 1,
        stock_value: 35000000
      }
    ];

    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 18 },
        { wch: 48 },
        { wch: 18 },
        { wch: 24 },
        { wch: 18 },
        { wch: 12 },
        { wch: 14 },
        { wch: 18 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Material_Master');
      XLSX.writeFile(wb, 'template_material_master.xlsx');
      toast('Template Excel (.xlsx) berhasil diunduh.', 'success');
    } else {
      const csv = 'material_code,material_description,manufacturer,part_number,material_group,base_uom,stock_qty,stock_value\n100001,BEARING SKF 6210,SKF,6210,BEARING,EA,10,5000000\n';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = 'template_material_master.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Template CSV berhasil diunduh.', 'info');
    }
  }

  /**
   * PENGATURAN USER & HAK AKSES (RBAC)
   */
  async function loadUserManagement() {
    try {
      showLoading(true, 'Memuat data pengguna & hak akses...');
      const r = await callServer('getUserManagementData');
      const d = r.data || {};
      state.allRoles = d.roles || [];
      state.users = d.users || [];

      // Populate matriks role yang aktif
      const curRole = $('selectRoleConfig')?.value || 'GUEST';
      populateRoleForm(curRole);

      // Render tabel user
      renderUserTable(state.users);
    } catch (e) {
      toast('Gagal memuat data RBAC: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  function populateRoleForm(roleKey) {
    if (!state.allRoles || !state.allRoles.length) return;
    const roleObj = state.allRoles.find(r => r.role === roleKey);
    if (!roleObj) return;

    const allowedMenus = Array.isArray(roleObj.allowed_menus) ? roleObj.allowed_menus : [];
    
    // Checkbox menu
    document.querySelectorAll('.menu-perm-check').forEach(chk => {
      chk.checked = allowedMenus.includes(chk.value);
    });

    // Switch tindakan khusus
    if ($('actionPermUpload')) $('actionPermUpload').checked = Boolean(roleObj.can_upload);
    if ($('actionPermRunAi')) $('actionPermRunAi').checked = Boolean(roleObj.can_run_ai);
    if ($('actionPermMerge')) $('actionPermMerge').checked = Boolean(roleObj.can_merge);
    if ($('actionPermSettings')) $('actionPermSettings').checked = Boolean(roleObj.can_manage_settings);
  }

  async function handleSavePermissions() {
    const roleKey = $('selectRoleConfig')?.value;
    if (!roleKey) return;

    const checkedMenus = [];
    document.querySelectorAll('.menu-perm-check:checked').forEach(chk => {
      checkedMenus.push(chk.value);
    });

    const permObj = {
      can_upload: $('actionPermUpload')?.checked || false,
      can_run_ai: $('actionPermRunAi')?.checked || false,
      can_merge: $('actionPermMerge')?.checked || false,
      can_manage_settings: $('actionPermSettings')?.checked || false
    };

    try {
      showLoading(true, `Menyimpan hak akses peran ${roleKey}...`);
      const r = await callServer('saveRolePermissions', roleKey, checkedMenus, permObj);
      toast(r.message || 'Hak akses berhasil disimpan.', 'success');

      // Update local state.allRoles
      const idx = state.allRoles.findIndex(x => x.role === roleKey);
      if (idx !== -1) {
        state.allRoles[idx] = {
          ...state.allRoles[idx],
          allowed_menus: checkedMenus,
          ...permObj
        };
      }

      // Jika role yang disimpan adalah role user saat ini, perbarui accessControl langsung
      if (state.currentUser.role === roleKey) {
        state.accessControl = {
          allowed_menus: checkedMenus,
          ...permObj
        };
        applyAccessControl();
      }
    } catch (e) {
      toast('Gagal menyimpan hak akses: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  function renderUserTable(users) {
    const tbody = $('userTableBody');
    if (!tbody) return;

    if (!users || !users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Belum ada akun pengguna. Klik tombol "Tambah Pengguna" untuk membuat akun baru.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isAdm = u.role === 'ADMIN';
      const roleBadge = isAdm ? 'bg-danger text-white' : u.role === 'OPERATOR' ? 'bg-primary text-white' : 'bg-secondary text-white';
      const statusBadge = u.is_active ? 'bg-success text-white' : 'bg-secondary text-white';
      const statusText = u.is_active ? 'Aktif' : 'Non-aktif';
      const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : '-';

      return `
        <tr>
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.full_name || '-')}</td>
          <td><span class="badge ${roleBadge}">${escapeHtml(u.role)}</span></td>
          <td><span class="badge ${statusBadge}">${statusText}</span></td>
          <td><small class="text-muted">${createdDate}</small></td>
          <td>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary btn-sm btn-edit-user" data-id="${u.id}" title="Edit User">
                <i class="bi bi-pencil-square"></i>
              </button>
              ${u.username.toLowerCase() !== 'admin' ? `
              <button class="btn btn-outline-danger btn-sm btn-delete-user" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Hapus User">
                <i class="bi bi-trash"></i>
              </button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Event handler tombol edit
    tbody.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.id;
        const targetUser = state.users.find(x => String(x.id) === String(uid));
        if (targetUser) openEditUserModal(targetUser);
      });
    });

    // Event handler tombol delete
    tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', () => {
        handleDeleteUser(btn.dataset.id, btn.dataset.username);
      });
    });
  }

  function openNewUserModal() {
    $('editUserId').value = '';
    $('userFormUsername').value = '';
    $('userFormUsername').removeAttribute('readonly');
    $('userFormFullName').value = '';
    $('userFormRole').value = 'OPERATOR';
    $('userFormPassword').value = '';
    $('userFormPassword').required = true;
    $('userFormActive').checked = true;
    $('userFormModalLabel').innerHTML = '<i class="bi bi-person-plus-fill text-accent me-2"></i>Tambah Pengguna Baru';
    $('pwdRequiredHint').classList.remove('d-none');
    $('pwdOptionalHint').classList.add('d-none');

    const modalEl = $('userFormModal');
    if (modalEl && typeof bootstrap !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  function openEditUserModal(user) {
    $('editUserId').value = user.id;
    $('userFormUsername').value = user.username;
    $('userFormUsername').setAttribute('readonly', 'true');
    $('userFormFullName').value = user.full_name || '';
    $('userFormRole').value = user.role || 'OPERATOR';
    $('userFormPassword').value = '';
    $('userFormPassword').required = false;
    $('userFormActive').checked = Boolean(user.is_active);
    $('userFormModalLabel').innerHTML = '<i class="bi bi-pencil-square text-accent me-2"></i>Edit Pengguna: ' + escapeHtml(user.username);
    $('pwdRequiredHint').classList.add('d-none');
    $('pwdOptionalHint').classList.remove('d-none');

    const modalEl = $('userFormModal');
    if (modalEl && typeof bootstrap !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  async function handleSaveUser(e) {
    if (e && e.preventDefault) e.preventDefault();
    const id = $('editUserId').value.trim();
    const username = $('userFormUsername').value.trim();
    const fullName = $('userFormFullName').value.trim();
    const role = $('userFormRole').value;
    const password = $('userFormPassword').value;
    const isActive = $('userFormActive').checked;

    if (!username) {
      toast('Username wajib diisi.', 'error');
      return;
    }
    if (!id && !password) {
      toast('Password wajib diisi untuk pengguna baru.', 'error');
      return;
    }
    if (password && password.length < 6) {
      toast('Password minimal 6 karakter.', 'error');
      return;
    }

    const payload = {
      id: id || undefined,
      username: username,
      full_name: fullName,
      role: role,
      password: password || undefined,
      is_active: isActive
    };

    try {
      showLoading(true, 'Menyimpan akun pengguna...');
      const r = await callServer('saveAppUser', payload);
      toast(r.message || 'Pengguna berhasil disimpan.', 'success');

      const modalEl = $('userFormModal');
      if (modalEl && typeof bootstrap !== 'undefined') {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      await loadUserManagement();
    } catch (err) {
      toast('Gagal menyimpan pengguna: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async function handleDeleteUser(userId, username) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengguna "${username}"?`)) return;

    try {
      showLoading(true, `Menghapus pengguna ${username}...`);
      const r = await callServer('deleteAppUser', userId, username);
      toast(r.message || 'Pengguna berhasil dihapus.', 'success');
      await loadUserManagement();
    } catch (e) {
      toast('Gagal menghapus pengguna: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // =============================================================================
  // MODUL CEK KONSISTENSI & STANDAR KATALOG (TEL SCS, NATO ACodP-1, MESC)
  // =============================================================================

  function loadConsistencyView() {
    renderAbbreviationModalTable();
    if (!state.consistencyData || !state.consistencyData.length) {
      // Jika belum diaudit, jalankan otomatis audit pertama kali
      runConsistencyAudit();
    } else {
      renderConsistencyTable();
    }
  }

  async function runConsistencyAudit() {
    if (!window.ConsistencyEngine) {
      toast('ConsistencyEngine belum dimuat.', 'error');
      return;
    }

    try {
      showLoading(true, 'Mengambil data katalog & menjalankan audit konsistensi...');
      
      // Ambil data material aktif dari server (limit 500 untuk evaluasi komprehensif)
      const r = await callServer('getMaterials', 1, 500, '');
      const rawRows = (r.data && r.data.rows) || [];

      if (!rawRows.length) {
        toast('Tidak ada data material di database untuk diaudit.', 'warning');
        return;
      }

      // Format row agar field sesuai standar engine (noun, modifiers, template, etc.)
      const normalizedRows = rawRows.map(row => {
        const desc = (row.material_description || row.item_text_result || '').trim();
        // Coba ekstrak noun dari kata pertama sebelum koma jika belum ada
        const firstSegment = desc.split(',')[0] || '';
        return {
          id: row.id || row.material_code,
          material_code: row.material_code,
          item_text_result: desc,
          template_code: row.template_code || (desc.startsWith('SERVICE:') ? 'SVC-01' : 'GEN-01'),
          major_name: row.noun || row.major_name || firstSegment,
          modifier1: row.modifier1 || '',
          modifier2: row.modifier2 || '',
          modifier3: row.modifier3 || '',
          manufacture: row.manufacturer || row.manufacture || '',
          part_no: row.part_number || row.part_no || '',
          model_no: row.model_no || '',
          dwg_no: row.dwg_no || '',
          pos_no: row.pos_no || '',
          size: row.size || '',
          material: row.material || '',
          class: row.class || ''
        };
      });

      const auditResult = window.ConsistencyEngine.auditCatalogDataset(normalizedRows);
      state.consistencySummary = auditResult.summary;
      state.consistencyData = auditResult.results;

      // Update KPI Cards
      if ($('kpiConsistencyScore')) $('kpiConsistencyScore').textContent = `${auditResult.summary.avg_score}%`;
      if ($('kpiCompliantCount')) $('kpiCompliantCount').textContent = fmt(auditResult.summary.compliant_count);
      if ($('kpiWarningCount')) $('kpiWarningCount').textContent = fmt(auditResult.summary.warning_count);
      if ($('kpiNonCompliantCount')) $('kpiNonCompliantCount').textContent = fmt(auditResult.summary.non_compliant_count);
      if ($('kpiTypoCount')) $('kpiTypoCount').textContent = fmt(auditResult.summary.typo_count);

      renderConsistencyTable();
      toast(`Audit konsistensi selesai. Tingkat kepatuhan: ${auditResult.summary.compliance_rate}%`, 'success');
    } catch (e) {
      toast('Gagal menjalankan audit: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  function renderConsistencyTable() {
    const tbody = $('consistencyTableBody');
    if (!tbody) return;

    const statusFilter = $('consistencyStatusFilter')?.value || 'ALL';
    const tempFilter = $('consistencyTemplateFilter')?.value || 'ALL';
    const search = ($('consistencySearchInput')?.value || '').trim().toLowerCase();

    let list = state.consistencyData || [];

    if (statusFilter !== 'ALL') {
      list = list.filter(x => x.status === statusFilter);
    }
    if (tempFilter !== 'ALL') {
      list = list.filter(x => (x.template_code || '').startsWith(tempFilter));
    }
    if (search) {
      list = list.filter(x => {
        const text = (x.item_text || '').toLowerCase();
        const code = String(x.material_id || '').toLowerCase();
        const temp = (x.template_code || '').toLowerCase();
        return text.includes(search) || code.includes(search) || temp.includes(search);
      });
    }

    if ($('consistencyRowCountText')) {
      $('consistencyRowCountText').textContent = `${list.length} data item ditampilkan (dari total ${state.consistencyData.length})`;
    }

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted p-4">Tidak ada data material yang sesuai filter.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((item, idx) => {
      const statusBadge = item.status === 'COMPLIANT' ? 'bg-success' :
                          item.status === 'WARNING' ? 'bg-warning text-dark' : 'bg-danger';

      const scoreClass = item.score >= 90 ? 'score-high' : item.score >= 60 ? 'score-mid' : 'score-low';

      // Format issues list
      const issuesHtml = item.issues.length ? item.issues.map(iss => {
        const icon = iss.severity === 'critical' ? 'bi-x-circle-fill text-danger' :
                     iss.severity === 'warning' ? 'bi-exclamation-triangle-fill text-warning' : 'bi-info-circle-fill text-info';
        return `
          <div class="mb-1 small">
            <i class="bi ${icon} me-1"></i>
            <span class="fw-semibold">${escapeHtml(iss.type)}:</span> ${escapeHtml(iss.message)}
          </div>
        `;
      }).join('') : '<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>Format & atribut konsisten sesuai standar.</span>';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <span class="badge bg-secondary">${escapeHtml(item.template_code || 'GEN')}</span>
          </td>
          <td>
            <strong>${escapeHtml(item.material_id)}</strong>
            <div class="small text-muted mt-1 font-monospace" style="word-break: break-all;">${escapeHtml(item.item_text)}</div>
          </td>
          <td>
            <span class="badge-score ${scoreClass}">${item.score}%</span>
          </td>
          <td>
            <span class="badge ${statusBadge}">${item.status}</span>
          </td>
          <td>
            <div style="max-height: 120px; overflow-y: auto;">
              ${issuesHtml}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderAbbreviationModalTable() {
    const tbody = $('abvMasterTableBody');
    if (!tbody) return;

    const search = ($('abvSearchInput')?.value || '').trim().toLowerCase();
    const allAbv = window.CATALOG_RULES?.ABBREVIATIONS || [];

    const filtered = allAbv.filter(x => {
      if (!search) return true;
      return (x.abv || '').toLowerCase().includes(search) || (x.full || '').toLowerCase().includes(search);
    });

    if ($('abvCountLabel')) $('abvCountLabel').textContent = fmt(filtered.length);

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted p-3">Singkatan tidak ditemukan.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.slice(0, 300).map(x => `
      <tr>
        <td><strong><code>${escapeHtml(x.abv)}</code></strong></td>
        <td>${escapeHtml(x.full)}</td>
      </tr>
    `).join('');
  }

  function exportConsistencyExcel() {
    if (!state.consistencyData || !state.consistencyData.length) {
      toast('Jalankan audit terlebih dahulu sebelum mengunduh hasil.', 'warning');
      return;
    }

    if (typeof XLSX === 'undefined') {
      toast('Pustaka XLSX tidak tersedia.', 'error');
      return;
    }

    const wsData = [
      ['LAPORAN AUDIT KONSISTENSI & STANDARISASI KATALOG MATERIAL (TEL SCS / NATO / MESC)'],
      ['Sistem AI Material Master Cleansing, Duplicate Review & Consistency Validator'],
      [],
      ['Tanggal Audit:', new Date().toLocaleString('id-ID')],
      ['Total Item Diaudit:', state.consistencySummary?.total_items || state.consistencyData.length],
      ['Skor Rata-Rata Kepatuhan:', `${state.consistencySummary?.avg_score || 0}%`],
      ['Total Compliant:', state.consistencySummary?.compliant_count || 0],
      ['Total Warning:', state.consistencySummary?.warning_count || 0],
      ['Total Non-Compliant:', state.consistencySummary?.non_compliant_count || 0],
      ['Total Typo Terdeteksi:', state.consistencySummary?.typo_count || 0],
      [],
      [
        'No',
        'Material ID / Code',
        'Template Code',
        'Deskripsi Material (item text result)',
        'Skor Kepatuhan (%)',
        'Status Standar',
        'Jumlah Pelanggaran',
        'Detail Temuan / Masalah',
        'Rekomendasi Perbaikan Standar'
      ]
    ];

    state.consistencyData.forEach((item, idx) => {
      const issueDetails = item.issues.map(i => `[${i.type}] ${i.message}`).join(' | ');
      const suggestionDetails = item.suggestions.map(s => `${s.field}: -> ${s.suggested}`).join(' | ');

      wsData.push([
        idx + 1,
        item.material_id || '',
        item.template_code || '',
        item.item_text || '',
        item.score || 0,
        item.status || '',
        item.issues.length,
        issueDetails || 'Tidak ada masalah',
        suggestionDetails || 'Sesuai standar'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 14 },
      { wch: 50 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 55 },
      { wch: 45 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit_Konsistensi');

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `Audit_Konsistensi_Katalog_Material_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast(`Laporan Excel berhasil diunduh: ${fileName}`, 'success');
  }

  function debounce(fn, wait) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), wait);
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
