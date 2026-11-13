/**
 * =============================================================================
 * Consistency & Compliance Engine (TEL SCS, NATO ACodP-1, MESC Aligned)
 * Memeriksa kesesuaian data material master terhadap aturan penulisan:
 * 1. Aturan Wajib Template (GEN, UNT, OEM, SPC, STR, MIS, MFG, SVC)
 * 2. Kamus Singkatan Baku (Abbreviation Table)
 * 3. Format Penulisan (UPPERCASE, Delimiter, Syntax KEY=VALUE)
 * 4. Pengecekan Placeholder Invalid ('???', '-', 'NONE' pada kolom wajib)
 * =============================================================================
 */

(() => {
  'use strict';

  // Inisialisasi lookup map untuk pencarian O(1)
  let abvMap = null;
  let fullToAbvMap = null;

  function initMaps() {
    if (abvMap && fullToAbvMap) return;
    abvMap = new Map();
    fullToAbvMap = new Map();

    const rules = window.CATALOG_RULES || { ABBREVIATIONS: [], TEMPLATES: [] };
    (rules.ABBREVIATIONS || []).forEach(item => {
      const a = (item.abv || '').trim().toUpperCase();
      const f = (item.full || '').trim().toUpperCase();
      if (a) abvMap.set(a, f);
      if (f && f.length > 2) fullToAbvMap.set(f, a);
    });
  }

  /**
   * Helper pembersih string
   */
  function clean(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  function isBlankOrInvalid(val) {
    const s = clean(val).toUpperCase();
    return !s || s === 'NONE' || s === '???' || s === '-' || s === 'NULL' || s === 'N/A';
  }

  /**
   * Evaluasi satu baris material
   * @param {Object} item Objek material (dari Excel atau Database)
   * @returns {Object} Hasil evaluasi konsistensi dan rekomendasi perbaikan
   */
  function auditMaterialRow(item) {
    initMaps();

    const issues = [];
    const suggestions = [];
    let score = 100;

    const rawText = clean(item.item_text_result || item.item_text || item.description || '');
    const templateCode = clean(item.template_code || '').toUpperCase();
    const noun = clean(item.major_name || item.noun || '').toUpperCase();
    const mod1 = clean(item.modifier1 || item.modifier_1 || '').toUpperCase();
    const mod2 = clean(item.modifier2 || item.modifier_2 || '').toUpperCase();
    const mod3 = clean(item.modifier3 || item.modifier_3 || '').toUpperCase();
    const mfr = clean(item.manufacture || item.manufacturer || '').toUpperCase();
    const dwgNo = clean(item.dwg_no || item.drawing_no || '').toUpperCase();
    const posNo = clean(item.pos_no || item.position_no || '').toUpperCase();
    const partNo = clean(item.part_no || item.part_number || '').toUpperCase();
    const modelNo = clean(item.model_no || '').toUpperCase();
    const size = clean(item.size || item.dimensions || '').toUpperCase();
    const matl = clean(item.material || '').toUpperCase();
    const cls = clean(item.class || item.grade || '').toUpperCase();

    // -------------------------------------------------------------------------
    // 1. RULE: Pemeriksaan Kapitalisasi (Harus UPPERCASE)
    // -------------------------------------------------------------------------
    if (rawText && rawText !== rawText.toUpperCase()) {
      score -= 5;
      issues.push({
        type: 'CASING',
        severity: 'minor',
        field: 'item_text_result',
        message: 'Deskripsi mengandung huruf kecil. Standar SCS mewajibkan SEMUA HURUF KAPITAL (UPPERCASE).'
      });
      suggestions.push({
        field: 'item_text_result',
        suggested: rawText.toUpperCase(),
        reason: 'Ubah ke huruf kapital'
      });
    }

    // -------------------------------------------------------------------------
    // 2. RULE: Template Mandatory Fields Check
    // -------------------------------------------------------------------------
    const tempPrefix = templateCode.split('-')[0];
    const templateDef = (window.CATALOG_RULES?.TEMPLATES || []).find(t => t.code === tempPrefix);

    if (!templateCode) {
      score -= 20;
      issues.push({
        type: 'TEMPLATE_MISSING',
        severity: 'critical',
        field: 'template_code',
        message: 'Kode template belum ditentukan (misal: GEN-XX, UNT-XX, OEM-XX, STR-XX).'
      });
    } else if (templateDef) {
      // Validasi kolom wajib per template
      if (templateDef.code === 'OEM') {
        if (isBlankOrInvalid(mfr)) {
          score -= 15;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'manufacture',
            message: 'Template OEM wajib memiliki Manufacture/Brand spesifik.'
          });
        }
        if (isBlankOrInvalid(partNo)) {
          score -= 20;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'part_no',
            message: 'Template OEM wajib memiliki Part Number yang valid dari pabrikan.'
          });
        }
        if (isBlankOrInvalid(dwgNo) && isBlankOrInvalid(modelNo)) {
          score -= 10;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'warning',
            field: 'dwg_no',
            message: 'Template OEM membutuhkan referensi alat (Drawing No atau Model No).'
          });
        }
      } else if (templateDef.code === 'UNT') {
        if (isBlankOrInvalid(mfr)) {
          score -= 15;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'manufacture',
            message: 'Template UNIT wajib memiliki Manufacture/Brand.'
          });
        }
        if (isBlankOrInvalid(partNo) && isBlankOrInvalid(modelNo)) {
          score -= 15;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'part_no',
            message: 'Template UNIT wajib mencantumkan Model Number atau Part Number.'
          });
        }
      } else if (templateDef.code === 'STR') {
        if (isBlankOrInvalid(size)) {
          score -= 15;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'size',
            message: 'Template Construction (STR) wajib memiliki dimensi/ukuran fisik (Size).'
          });
        }
        if (isBlankOrInvalid(matl)) {
          score -= 15;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'material',
            message: 'Template Construction (STR) wajib mencantumkan jenis material (misal SS316, SS400).'
          });
        }
      } else if (templateDef.code === 'GEN') {
        if (isBlankOrInvalid(size) && isBlankOrInvalid(rawText)) {
          score -= 15;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'warning',
            field: 'size',
            message: 'Template General (GEN) memerlukan spesifikasi/dimensi teknis.'
          });
        }
      } else if (templateDef.code === 'SVC') {
        if (!rawText.startsWith('SERVICE:')) {
          score -= 20;
          issues.push({
            type: 'SYNTAX_ERROR',
            severity: 'critical',
            field: 'item_text_result',
            message: 'Template Jasa (SVC) wajib diawali dengan kata "SERVICE: ".'
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. RULE: Pemeriksaan Karakter Anomali & Placeholder Tidak Valid ('???', '-')
    // -------------------------------------------------------------------------
    [
      { name: 'dwg_no', val: dwgNo },
      { name: 'pos_no', val: posNo },
      { name: 'part_no', val: partNo },
      { name: 'model_no', val: modelNo }
    ].forEach(col => {
      if (col.val.includes('???') || col.val === '??') {
        score -= 10;
        issues.push({
          type: 'INVALID_PLACEHOLDER',
          severity: 'warning',
          field: col.name,
          message: `Kolom ${col.name} berisi placeholder tidak valid ('${col.val}'). Gunakan 'NONE' jika tidak ada.`
        });
        suggestions.push({
          field: col.name,
          suggested: 'NONE',
          reason: 'Standardisasi placeholder tidak valid menjadi NONE'
        });
      }
    });

    // -------------------------------------------------------------------------
    // 4. RULE: Pemeriksaan Konsistensi Delimiter Dimensi (KEY=VALUE vs KEY-VALUE)
    // -------------------------------------------------------------------------
    if (rawText) {
      // Deteksi pola 'CONN 2-3/8' atau sejenisnya di mana seharusnya '='
      const dashDelimiterRegex = /\b(CONN\s*\d*|DIA|LG|THK|WA|WD|H|W|PITCH|SIZE|OD|ID)-([0-9/])/gi;
      let match;
      while ((match = dashDelimiterRegex.exec(rawText)) !== null) {
        score -= 5;
        const faultyStr = match[0];
        const fixedStr = match[1] + '=' + match[2];
        issues.push({
          type: 'SYNTAX_DELIMITER',
          severity: 'minor',
          field: 'item_text_result',
          message: `Penulisan atribut '${faultyStr}' tidak konsisten. Gunakan tanda sama dengan ('${fixedStr}').`
        });
        suggestions.push({
          field: 'item_text_result',
          suggested: rawText.replace(faultyStr, fixedStr),
          reason: `Ubah '${faultyStr}' menjadi '${fixedStr}'`
        });
      }
    }

    // -------------------------------------------------------------------------
    // 5. RULE: Pemeriksaan Kamus Singkatan (Abbreviation Compliance)
    // -------------------------------------------------------------------------
    // Deteksi kata lengkap yang seharusnya disingkat berdasarkan kamus
    if (rawText) {
      const words = rawText.split(/[\s,]+/);
      for (const w of words) {
        const upperWord = w.toUpperCase();
        // Cek jika pengguna menulis kata panjang yang memiliki singkatan baku
        if (fullToAbvMap.has(upperWord)) {
          const recommendedAbv = fullToAbvMap.get(upperWord);
          // Kecualikan kata-kata umum pendek yang ambigu
          if (upperWord.length > 4 && recommendedAbv !== upperWord) {
            score -= 3;
            issues.push({
              type: 'ABBREVIATION_VIOLATION',
              severity: 'info',
              field: 'item_text_result',
              message: `Kata '${upperWord}' dapat disingkat menjadi '${recommendedAbv}' sesuai kamus SCS.`
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 6. RULE: Deteksi Typo Spesifik yang Teridentifikasi di Data Sampel
    // -------------------------------------------------------------------------
    const commonTypos = [
      { wrong: 'COPLING', right: 'COUPLING', field: 'major_name' },
      { wrong: 'CLIB', right: 'CLIP', field: 'modifier1' },
      { wrong: 'GREATHER', right: 'GREATER', field: 'item_text_result' },
      { wrong: 'REINFORCEED', right: 'REINFORCED', field: 'item_text_result' },
      { wrong: 'ENVIRONTMENTAL', right: 'ENVIRONMENTAL', field: 'item_text_result' },
      { wrong: 'GALVANIZE', right: 'GALV', field: 'material' }
    ];

    commonTypos.forEach(t => {
      const regex = new RegExp(`\\b${t.wrong}\\b`, 'i');
      if (regex.test(rawText) || regex.test(noun) || regex.test(mod1) || regex.test(matl)) {
        score -= 8;
        issues.push({
          type: 'SPELLING_TYPO',
          severity: 'warning',
          field: t.field,
          message: `Ditemukan ejaan/typo: '${t.wrong}'. Seharusnya '${t.right}'.`
        });
        suggestions.push({
          field: t.field,
          suggested: t.right,
          reason: `Koreksi typo '${t.wrong}' -> '${t.right}'`
        });
      }
    });

    // Batasi skor minimum 0 dan maksimum 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = 'COMPLIANT';
    if (score < 60) status = 'NON_COMPLIANT';
    else if (score < 90) status = 'WARNING';

    return {
      material_id: item.id || item.part_no || item.major_name || '-',
      item_text: rawText,
      template_code: templateCode,
      score,
      status,
      issue_count: issues.length,
      issues,
      suggestions
    };
  }

  /**
   * Evaluasi Batch Dataset Material Master
   */
  function auditCatalogDataset(rows) {
    if (!Array.isArray(rows)) return { summary: {}, results: [] };

    const results = rows.map(r => auditMaterialRow(r));
    
    let totalScore = 0;
    let compliantCount = 0;
    let warningCount = 0;
    let nonCompliantCount = 0;
    let typoCount = 0;
    let mandatoryMissingCount = 0;

    results.forEach(res => {
      totalScore += res.score;
      if (res.status === 'COMPLIANT') compliantCount++;
      else if (res.status === 'WARNING') warningCount++;
      else nonCompliantCount++;

      res.issues.forEach(iss => {
        if (iss.type === 'SPELLING_TYPO') typoCount++;
        if (iss.type === 'MANDATORY_MISSING' || iss.type === 'TEMPLATE_MISSING') mandatoryMissingCount++;
      });
    });

    const total = results.length;
    const avgScore = total > 0 ? Math.round(totalScore / total) : 100;

    return {
      summary: {
        total_items: total,
        avg_score: avgScore,
        compliant_count: compliantCount,
        warning_count: warningCount,
        non_compliant_count: nonCompliantCount,
        typo_count: typoCount,
        mandatory_missing_count: mandatoryMissingCount,
        compliance_rate: total > 0 ? Math.round((compliantCount / total) * 100) : 100
      },
      results
    };
  }

  // Export ke global window
  window.ConsistencyEngine = {
    auditMaterialRow,
    auditCatalogDataset
  };

})();
