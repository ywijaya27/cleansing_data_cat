/* Shared by the browser, Node API and generated Apps Script AccessPolicy.gs. */
var AccessPolicy = (() => {
  'use strict';
  const menus = ['dashboard', 'upload', 'materials', 'duplicates', 'similarity', 'consistency', 'reports', 'users', 'settings'];
  const flags = ['can_upload', 'can_run_ai', 'can_review', 'can_merge', 'can_manage_settings', 'can_run_consistency', 'can_export_consistency'];
  function normalize(role, raw = {}) {
    role = String(role || 'GUEST').toUpperCase();
    let allowed = raw.allowed_menus;
    if (typeof allowed === 'string') { try { allowed = JSON.parse(allowed); } catch (_) { allowed = []; } }
    const result = { role, allowed_menus: Array.isArray(allowed) ? allowed.filter(x => menus.includes(x)) : [] };
    flags.forEach(key => { result[key] = raw[key] === true; });
    if (role === 'ADMIN') {
      result.allowed_menus = menus.slice();
      flags.forEach(key => { result[key] = true; });
    } else {
      result.allowed_menus = result.allowed_menus.filter(x => x !== 'users');
      if (role === 'GUEST') {
        result.allowed_menus = result.allowed_menus.filter(x => !['upload', 'duplicates'].includes(x));
        flags.forEach(key => { result[key] = false; });
      }
    }
    return result;
  }
  const rules = {
    getDashboardData: ['dashboard'], getDashboardSummary: ['dashboard'],
    getMaterials: ['materials'], getMaterialMaster: ['materials'],
    getConsistencyMaterials: ['consistency', 'can_run_consistency'],
    authorizeConsistencyExport: ['consistency', 'can_export_consistency'],
    uploadMaterials: ['upload', 'can_upload'], uploadMasterData: ['upload', 'can_upload'],
    getUploadHistory: ['upload'], normalizeMaterial: ['materials', 'can_upload'],
    runAICleansingAnalysis: ['duplicates', 'can_run_ai'], runAiCleansingAnalysis: ['duplicates', 'can_run_ai'],
    getDuplicateCandidates: ['duplicates'], getDuplicates: ['duplicates'],
    getSimilarMaterials: ['similarity'], getApprovedDuplicatesReport: ['reports'],
    setupSupabaseConfig: ['settings', 'can_manage_settings'], testSupabaseConnection: ['settings', 'can_manage_settings'],
    getUserManagementData: ['users'], saveRolePermissions: ['users'], saveAppUser: ['users'], deleteAppUser: ['users']
  };
  function allows(role, raw, action, args = []) {
    if (['loginUser', 'getAppStatus', 'getSystemAccessControl', 'getSession', 'logoutUser'].includes(action)) return true;
    const permission = normalize(role, raw);
    const rule = action === 'saveDuplicateDecision'
      ? ['duplicates', args[1] === 'MERGE_AND_OBSOLETE' ? 'can_merge' : 'can_review'] : rules[action];
    return Boolean(rule && permission.allowed_menus.includes(rule[0]) && (!rule[1] || permission[rule[1]]));
  }
  return { menus, flags, normalize, allows };
})();
if (typeof module !== 'undefined') module.exports = AccessPolicy;
