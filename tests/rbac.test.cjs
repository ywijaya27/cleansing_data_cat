const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const policy = require('../js/access-policy');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('permission matrix denies implicit access and separates review, merge, audit and export', () => {
  const operator = { allowed_menus: ['duplicates', 'consistency'], can_review: true, can_run_consistency: true };
  assert.equal(policy.allows('OPERATOR', operator, 'saveDuplicateDecision', ['', 'APPROVED_DUPLICATE']), true);
  assert.equal(policy.allows('OPERATOR', operator, 'saveDuplicateDecision', ['', 'MERGE_AND_OBSOLETE']), false);
  assert.equal(policy.allows('OPERATOR', operator, 'getConsistencyMaterials'), true);
  assert.equal(policy.allows('OPERATOR', operator, 'authorizeConsistencyExport'), false);
  assert.equal(policy.allows('OPERATOR', operator, 'getApprovedDuplicatesReport'), false);
  assert.equal(policy.allows('OPERATOR', { ...operator, allowed_menus: [] }, 'getConsistencyMaterials'), false);
  assert.equal(policy.allows('OPERATOR', { allowed_menus: ['users'] }, 'saveAppUser'), false);
  assert.equal(policy.allows('GUEST', operator, 'getConsistencyMaterials'), false);
  assert.equal(policy.allows('ADMIN', {}, 'getConsistencyMaterials'), true);
  assert.equal(policy.allows('ADMIN', {}, 'unknownAction'), false);
  assert.equal(policy.allows('OPERATOR', { allowed_menus: '["consistency"]', can_run_consistency: 'false' }, 'getConsistencyMaterials'), false);
});

function gas() {
  const cache = new Map();
  const users = [{ id: 1, username: 'operator', full_name: 'Operator Satu', role: 'OPERATOR', is_active: true,
    password_hash: crypto.createHash('sha256').update('test-password').digest('hex') }];
  const roles = [{ role: 'OPERATOR', allowed_menus: ['consistency', 'duplicates'], can_run_consistency: true, can_review: true },
    { role: 'GUEST', allowed_menus: ['dashboard'] }];
  const writes = [];
  const context = vm.createContext({
    console, Date, AccessPolicy: policy,
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(value).digest()] },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(read('apps-script/Code.gs'), context);
  context.supabaseRequest_ = (url, method, payload) => {
    if (url.startsWith('app_users?')) {
      return users.filter(u => (!url.includes('username=eq.') || url.includes('username=eq.' + u.username + '&')) &&
        (!url.includes('id=eq.') || url.includes('id=eq.' + u.id + '&')) && (!url.includes('is_active=eq.true') || u.is_active));
    }
    if (url.startsWith('app_role_permissions?')) {
      const match = /role=eq.([^&]+)/.exec(url);
      return roles.filter(r => !match || r.role === match[1]);
    }
    if (method !== 'get') writes.push({ url, method, payload });
    return [];
  };
  context.writeAudit_ = () => {};
  return { context, cache, users, roles, writes };
}

test('Apps Script login creates a verified operator session; revocation and role updates take effect immediately', () => {
  const { context: ctx, users, roles } = gas();
  const login = ctx.apiRequest('loginUser', ['operator', 'test-password']);
  assert.equal(login.success, true);
  const token = login.data.token;
  assert.ok(token);
  assert.equal(ctx.apiRequest('getSession', [], token).data.role, 'OPERATOR');
  assert.equal(ctx.apiRequest('getConsistencyMaterials', [1, 100], token).success, true);
  roles[0].can_run_consistency = false;
  assert.equal(ctx.apiRequest('getConsistencyMaterials', [1, 100], token).success, false);
  users[0].is_active = false;
  assert.equal(ctx.apiRequest('getSession', [], token).success, false);
  assert.equal(ctx.apiRequest('logoutUser', [], token).success, true);
  users[0].is_active = true;
  assert.equal(ctx.apiRequest('getSession', [], token).success, false);
});

test('Apps Script denies forged sessions, anonymous writes, default admin login and expired sessions', () => {
  const { context: ctx, cache, writes } = gas();
  for (const action of ['uploadMaterials', 'saveAppUser', 'saveRolePermissions', 'setupSupabaseConfig', 'runAICleansingAnalysis', 'saveDuplicateDecision']) {
    assert.equal(ctx.apiRequest(action, []).success, false, action);
    assert.equal(ctx.apiRequest(action, [], 'forged-token').success, false, action);
  }
  assert.equal(ctx.apiRequest('loginUser', ['admin', 'admin123']).success, false);
  cache.set('session:expired', JSON.stringify({ id: 1, expiresAt: 1 }));
  assert.equal(ctx.apiRequest('getSession', [], 'expired').success, false);
  assert.equal(writes.length, 0);
});

test('Apps Script uses server identity for decisions and guards both POST and native RPC', () => {
  const { context: ctx } = gas();
  const token = ctx.apiRequest('loginUser', ['operator', 'test-password']).data.token;
  let reviewer;
  ctx.saveDuplicateDecision_ = (...args) => { reviewer = args[4]; return { success: true }; };
  assert.equal(ctx.apiRequest('saveDuplicateDecision', ['1', 'APPROVED_DUPLICATE', '', '', 'Fake Admin'], token).success, true);
  assert.equal(reviewer, 'Operator Satu');
  const result = ctx.doPost({ postData: { contents: JSON.stringify({ action: 'saveAppUser', args: [{}] }) } });
  assert.equal(JSON.parse(result.text).success, false);
  assert.equal(typeof ctx.saveAppUser, 'undefined');
  assert.equal(typeof ctx.setupSupabaseConfig, 'undefined');
  assert.equal(typeof ctx.firstTimeSetup, 'undefined');
});

function frontend() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, style: {}, value: '', textContent: '', innerHTML: '', disabled: false, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} });
    return elements.get(id);
  };
  const storage = new Map();
  const context = vm.createContext({
    console, Intl, Date, setTimeout: () => {}, clearTimeout() {}, AccessPolicy: policy,
    document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: {},
  });
  const exports = 'window.testApi = { state, restoreAdminSession, applyAccessControl, runConsistencyAudit, loadConsistencyView, isMenuAllowed };';
  vm.runInContext(read('js/app.js').replace("document.addEventListener('DOMContentLoaded', init);", exports), context);
  return { context, api: context.window.testApi, element, storage };
}

test('operator survives refresh using backend identity and is displayed as operator, not Guest', async () => {
  const { context, api, element, storage } = frontend();
  storage.set('admin_session', JSON.stringify({ role: 'ADMIN', token: 'valid' }));
  context.window.callServer = async () => ({ success: true, data: { role: 'OPERATOR', full_name: 'Operator Satu', token: 'valid', permissions: { allowed_menus: ['consistency'] } } });
  await api.restoreAdminSession();
  api.applyAccessControl();
  assert.equal(api.state.currentUser.role, 'OPERATOR');
  assert.equal(element('currentUser').textContent, 'Operator Satu (OPERATOR)');
  assert.equal(element('sidebarRoleLabel').innerHTML.includes('OPERATOR'), true);
  assert.equal(element('reportByUserRole').textContent, '(Role: OPERATOR)');
  assert.equal(api.isMenuAllowed('reports'), false);
});

test('audit reads all pages, retains missing templates, and does not run just by opening the menu', async () => {
  const { context, api } = frontend();
  api.state.currentUser = { role: 'OPERATOR', token: 'valid' };
  api.state.accessControl = { allowed_menus: ['consistency'], can_run_consistency: true };
  const calls = [];
  let audited;
  context.window.callServer = async (action, page) => {
    calls.push({ action, page });
    return { data: { rows: Array.from({ length: page < 3 ? 100 : 7 }, (_, i) => ({ material_code: `${page}-${i}`, material_description: 'BEARING' })), pageSize: 100 } };
  };
  context.window.ConsistencyEngine = { auditCatalogDataset(rows) { audited = rows; return { summary: {}, results: [] }; } };
  api.loadConsistencyView();
  assert.equal(calls.length, 0);
  await api.runConsistencyAudit();
  assert.equal(audited.length, 207);
  assert.equal(audited[0].template_code, '');
  assert.deepEqual(calls.map(c => c.page), [1, 2, 3]);
  assert.ok(calls.every(c => c.action === 'getConsistencyMaterials'));
});

test('generated Apps Script policy matches the browser/Node policy', () => {
  assert.equal(read('apps-script/AccessPolicy.gs'), read('js/access-policy.js'));
});

test('generated Apps Script JavaScript bundle is complete and parses', () => {
  const bundle = read('apps-script/JavaScript.html');
  assert.ok(bundle.startsWith('<script>'));
  assert.ok(bundle.trimEnd().endsWith('</script>'));
  assert.doesNotThrow(() => new vm.Script(bundle.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '')));
  assert.ok(bundle.includes("supabaseUrl: window.APP_CONFIG?.SUPABASE_URL || ''"));
});

function nodeApi() {
  const routes = new Map();
  let middleware;
  const app = {
    use(...args) { if (args[0] === '/api') middleware = args[1]; },
    get(p, fn) { routes.set('GET ' + p, fn); },
    post(p, ...handlers) { routes.set('POST ' + p, handlers.at(-1)); },
    delete(p, fn) { routes.set('DELETE ' + p, fn); },
    listen() {}
  };
  const express = Object.assign(() => app, { json: () => () => {}, urlencoded: () => () => {}, static: () => () => {} });
  const multer = Object.assign(() => ({ single: () => () => {} }), { memoryStorage: () => ({}) });
  const context = vm.createContext({
    require: name => ({ express, multer, cors: () => () => {}, morgan: () => () => {}, dotenv: { config() {} },
      xlsx: {}, '../js/access-policy': policy }[name] || require(name)),
    process: { env: {} }, __dirname: path.join(root, 'backend'), console
  });
  vm.runInContext(read('backend/server.js'), context);
  const user = { id: 2, username: 'operator', role: 'OPERATOR', is_active: true,
    password_hash: crypto.createHash('sha256').update('password').digest('hex') };
  const permissions = { allowed_menus: ['consistency'], can_run_consistency: true };
  context.supabaseFetch = async url => url.startsWith('app_users?') ? (user.is_active ? [user] : []) : [permissions];
  const response = () => ({ status(n) { this.code = n; return this; }, json(data) { this.body = data; return this; } });
  async function request(method, url, token, body = {}) {
    const req = { method, path: url, body, headers: token ? { authorization: 'Bearer ' + token } : {} };
    const res = response();
    await middleware(req, res, async () => {
      const handler = routes.get(method + ' /api' + url);
      if (handler) await handler(req, res);
      else res.status(200).json({ success: true });
    });
    return res;
  }
  return { request, user, permissions };
}

test('Node API issues and verifies tokens, rejects missing/forged tokens, and revokes on logout', async () => {
  const { request, permissions } = nodeApi();
  assert.equal((await request('POST', '/users', '')).code, 403);
  assert.equal((await request('POST', '/users', 'fake')).code, 401);
  const login = await request('POST', '/auth/login', '', { username: 'operator', password: 'password' });
  assert.equal(login.body.success, true);
  const token = login.body.data.token;
  assert.equal((await request('GET', '/auth/session', token)).body.data.role, 'OPERATOR');
  assert.equal((await request('POST', '/consistency/export-authorization', token)).code, 403);
  permissions.can_export_consistency = true;
  assert.equal((await request('POST', '/consistency/export-authorization', token)).code, 200);
  await request('POST', '/auth/logout', token);
  assert.equal((await request('GET', '/auth/session', token)).code, 401);
});

test('HTTP Apps Script client sends session token; direct mode cannot bypass the backend', async () => {
  let payload;
  const context = vm.createContext({
    window: { APP_CONFIG: { MODE: 'appscript', GAS_URL: 'https://example.invalid' } },
    sessionStorage: { getItem: () => JSON.stringify({ token: 'verified-token' }) },
    localStorage: { getItem: () => null }, console,
    fetch: async (_, options) => { payload = JSON.parse(options.body); return { ok: true, text: async () => '{"success":true}' }; }
  });
  vm.runInContext(read('js/api.js'), context);
  await context.window.callServer('getSession');
  assert.equal(payload.token, 'verified-token');
  assert.equal(payload.action, 'getSession');
  context.window.APP_CONFIG.MODE = 'direct';
  await assert.rejects(context.window.callServer('saveAppUser'), /Mode direct dinonaktifkan/);
});
