/**
 * =============================================================================
 * Consistency & Compliance Engine (TEL SCS, NATO ACodP-1, MESC Aligned)
 * Memeriksa kesesuaian data material master terhadap aturan kataloging:
 * 1. Susunan / Urutan Katalog Standar:
 *    - NOUN (Kata Benda Utama)
 *    - MODIFIER(S) (Kata Pembatas / Tipe)
 *    - Characteristics and Values (Karakteristik & Nilai Spesifikasi Teknis)
 *    - Dimensions + Material + Class and/or Grade and/or Schedule
 *    - Equipment Name + Equipment Reference Information (Model No., Drawing No., Position No., Mfr, P/N)
 * 2. Konsistensi Penulisan Tanda Baca & Delimiter (Koma spasi ', ', KEY=VALUE, dsb.)
 * 3. Kepatuhan Kamus Singkatan Baku (Abbreviation Table)
 * 4. Pengecekan Typo & Karakter Anomali
 * 5. Generator Rekomendasi "Text Saran" Terstandarisasi untuk Side-by-Side Review
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

    // Tambahan singkatan esensial domain cataloguing jika belum ada di kamus
    const coreAbvs = {
      'STAINLESS STEEL': 'SS',
      'CARBON STEEL': 'CS',
      'CAST IRON': 'CI',
      'DUCTILE IRON': 'DI',
      'DIAMETER': 'DIA',
      'THICKNESS': 'THK',
      'LENGTH': 'LG',
      'HEIGHT': 'HT',
      'WIDTH': 'WD',
      'PRESSURE': 'PRESS',
      'TEMPERATURE': 'TEMP',
      'STANDARD': 'STD',
      'SPECIFICATION': 'SPEC',
      'MANUFACTURER': 'MFR',
      'MANUFACTURE': 'MFR',
      'PART NUMBER': 'P/N',
      'PART NO': 'P/N',
      'MODEL NUMBER': 'MDL',
      'MODEL NO': 'MDL',
      'DRAWING NUMBER': 'DWG',
      'DRAWING NO': 'DWG',
      'POSITION NUMBER': 'POS',
      'POSITION NO': 'POS',
      'SCHEDULE': 'SCH',
      'CLASS': 'CL',
      'GRADE': 'GR',
      'POUND': 'LB',
      'POUNDS': 'LB',
      'INCH': 'IN',
      'INCHES': 'IN',
      'FEET': 'FT',
      'FOOT': 'FT',
      'GALVANIZED': 'GALV',
      'COUPLING': 'CPLG',
      'FLANGED': 'FLG',
      'THREADED': 'THD'
    };
    Object.entries(coreAbvs).forEach(([full, abv]) => {
      if (!fullToAbvMap.has(full)) fullToAbvMap.set(full, abv);
      if (!abvMap.has(abv)) abvMap.set(abv, full);
    });
  }

  function clean(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  function isBlankOrInvalid(val) {
    const s = clean(val).toUpperCase();
    return !s || s === 'NONE' || s === '???' || s === '??' || s === '-' || s === 'NULL' || s === 'N/A';
  }

  /**
   * Mengonversi kata atau frasa menjadi singkatan baku
   */
  function applyStandardAbbreviations(text) {
    if (!text) return '';
    initMaps();

    let res = String(text).toUpperCase();

    // 1. Ganti unit & tanda kutip fisik:
    // e.g. 2" -> 2 IN, 1/2" -> 1/2 IN
    res = res.replace(/(\d+(?:\.\d+)?|\d+\/\d+)\s*"/g, '$1 IN');
    res = res.replace(/(\d+(?:\.\d+)?|\d+\/\d+)\s*'/g, '$1 FT');

    // 2. Ganti frasa panjang lebih dulu (misal STAINLESS STEEL -> SS)
    const sortedFullKeys = Array.from(fullToAbvMap.keys()).sort((a, b) => b.length - a.length);
    sortedFullKeys.forEach(full => {
      if (full.length >= 4) {
        const regex = new RegExp(`\\b${full.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
        const abv = fullToAbvMap.get(full);
        if (abv && abv !== full) {
          res = res.replace(regex, abv);
        }
      }
    });

    return res;
  }

  /**
   * Membersihkan tanda baca dan menstandarisasi delimiter
   */
  function cleanPunctuationAndDelimiters(text) {
    if (!text) return '';
    let res = text.toUpperCase();

    // Ubah titik koma atau slash ganda menjadi koma
    res = res.replace(/;/g, ',');
    res = res.replace(/\/{2,}/g, ',');

    // Standardisasi pasangan KEY-VALUE menjadi KEY=VALUE
    // Contoh: SIZE-2 IN -> SIZE=2 IN, DIA-50 MM -> DIA=50 MM, MAT-SS316 -> MAT=SS316
    res = res.replace(/\b(SIZE|DIA|OD|ID|THK|LG|WD|HT|PRESS|TEMP|RATING|VOLT|AMP|KW|HP|RATIO|PITCH|MAT|SCH|CL|GR|MDL|DWG|POS|MFR|PN|P\/N)-([0-9A-Z/]+)\b/gi, '$1=$2');

    // Bersihkan spasi di sekitar koma dan tanda sama dengan
    res = res.replace(/\s*,\s*/g, ', ');
    res = res.replace(/\s*=\s*/g, '=');
    res = res.replace(/,\s*,/g, ',');
    res = res.replace(/\s{2,}/g, ' ');
    res = res.replace(/^[, ]+|[, ]+$/g, '');

    return res;
  }

  /**
   * Ekstraksi dan pengelompokan segmen sesuai 5 urutan standar katalog:
   * 1. Noun
   * 2. Modifier(s)
   * 3. Characteristics & Values
   * 4. Dimensions + Material + Class/Grade/Schedule
   * 5. Equipment Name + Equipment Reference Info
   */
  function parseAndCategorizeSegments(item, rawText) {
    initMaps();

    const result = {
      noun: '',
      modifiers: [],
      characteristics: [],
      dimensions_material_class: [],
      equipment_ref: [],
      raw_segments: []
    };

    // Bersihkan tanda baca awal
    const normalizedRaw = cleanPunctuationAndDelimiters(applyStandardAbbreviations(rawText));
    const parts = normalizedRaw.split(',').map(p => p.trim()).filter(Boolean);
    result.raw_segments = parts.slice();

    // 1. Ekstrak NOUN
    let nounCandidate = clean(item.major_name || item.noun || '').toUpperCase();
    if (!nounCandidate && parts.length > 0) {
      // Kata pertama dari segmen pertama
      const seg1Words = parts[0].split(/\s+/);
      nounCandidate = seg1Words[0] || '';
    }
    nounCandidate = applyStandardAbbreviations(nounCandidate);
    result.noun = nounCandidate;

    // 2. Ekstrak Modifiers dari item atau parts
    const modCandidateSet = new Set();
    [item.modifier1, item.modifier2, item.modifier3].forEach(m => {
      const c = clean(m).toUpperCase();
      if (c && !isBlankOrInvalid(c)) modCandidateSet.add(applyStandardAbbreviations(c));
    });

    // 3. Klasifikasikan sisa segmen dari parts
    parts.forEach((seg, idx) => {
      if (!seg) return;
      const upperSeg = seg.toUpperCase();

      // Jika segmen adalah Noun itu sendiri
      if (idx === 0 && (upperSeg === nounCandidate || upperSeg.startsWith(nounCandidate + ' '))) {
        const remaining = upperSeg.slice(nounCandidate.length).trim();
        if (remaining) modCandidateSet.add(remaining);
        return;
      }

      // Cek apakah ini Equipment Name atau Equipment Reference
      // Pattern: FOR PUMP..., MODEL..., DWG..., POS..., P/N..., MFR...
      if (
        /^(FOR\b|EQPT\b|EQUIPMENT\b|MDL\b|MODEL\b|DWG\b|DRAWING\b|POS\b|POSITION\b|MFR\b|MANUFACTURER\b|P\/N\b|PART\s*NO)/i.test(upperSeg) ||
        /\b(DWG|POS|MDL|P\/N)=/i.test(upperSeg)
      ) {
        result.equipment_ref.push(upperSeg);
        return;
      }

      // Cek apakah ini Dimensions, Material, atau Class/Grade/Schedule
      // Dimensions: SIZE=..., DIA=..., OD=..., ID=..., THK=..., LG=..., 2 IN, 50 MM, dsb.
      // Material: MAT=..., SS316, CS, BRASS, PVC, dsb.
      // Class/Grade/Schedule: CL 150, SCH 40, GR B, dsb.
      if (
        /^(SIZE|DIA|OD|ID|THK|LG|WD|HT|DIM|DIMENSIONS?)=/i.test(upperSeg) ||
        /\b(\d+(?:\.\d+)?|\d+\/\d+)\s*(IN|MM|CM|M|FT)\b/i.test(upperSeg) ||
        /^(MAT|MATERIAL)=/i.test(upperSeg) ||
        /\b(SS316|SS304|SS|CS|CARBON STEEL|BRASS|BRONZE|COPPER|PVC|PTFE|RUBBER|EPDM|VITON|ALUMINUM|AL|CI|DI)\b/i.test(upperSeg) ||
        /^(CL|CLASS|SCH|SCHEDULE|GR|GRADE|RATING\s*CLASS)=/i.test(upperSeg) ||
        /\b(CL\s*\d+|CLASS\s*\d+|SCH\s*\d+|GR\s*[A-Z0-9]+)\b/i.test(upperSeg)
      ) {
        result.dimensions_material_class.push(upperSeg);
        return;
      }

      // Cek apakah ini Characteristics and Values (misal PRESS=..., TEMP=..., RATING=..., VOLT=...)
      if (
        /^(TYPE|RATING|PRESS|PRESSURE|TEMP|TEMPERATURE|VOLT|VOLTAGE|AMP|AMPERE|KW|HP|RPM|FLOW|PITCH|THREAD|CONN|CONNECTION|RATIO)=/i.test(upperSeg) ||
        /\b(BAR|PSI|DEG\s*C|VAC|VDC|RPM|M3\/H|GPM|NPT|FLG|RF|FF)\b/i.test(upperSeg)
      ) {
        result.characteristics.push(upperSeg);
        return;
      }

      // Jika cocok dengan salah satu modifier eksplisit
      if (modCandidateSet.has(upperSeg)) {
        return; // Akan ditambahkan dari modCandidateSet
      }

      // Default: jika masih berada di awal, masukkan ke modifier; jika di tengah/akhir masukkan ke characteristics
      if (idx <= 2 && !result.characteristics.length && !result.dimensions_material_class.length) {
        modCandidateSet.add(upperSeg);
      } else {
        result.characteristics.push(upperSeg);
      }
    });

    result.modifiers = Array.from(modCandidateSet);

    // Tambahan dari structured fields jika di deskripsi belum masuk
    if (item.size && !isBlankOrInvalid(item.size)) {
      const s = applyStandardAbbreviations(clean(item.size));
      if (!result.dimensions_material_class.some(d => d.includes(s))) {
        result.dimensions_material_class.unshift(s.startsWith('SIZE=') ? s : `SIZE=${s}`);
      }
    }
    if (item.material && !isBlankOrInvalid(item.material)) {
      const m = applyStandardAbbreviations(clean(item.material));
      if (!result.dimensions_material_class.some(d => d.includes(m))) {
        result.dimensions_material_class.push(m.startsWith('MAT=') ? m : `MAT=${m}`);
      }
    }
    if (item.class && !isBlankOrInvalid(item.class)) {
      const c = applyStandardAbbreviations(clean(item.class));
      if (!result.dimensions_material_class.some(d => d.includes(c))) {
        result.dimensions_material_class.push(c);
      }
    }

    // Equipment ref dari structured fields
    if (item.manufacture && !isBlankOrInvalid(item.manufacture)) {
      const mfr = `MFR=${applyStandardAbbreviations(clean(item.manufacture))}`;
      if (!result.equipment_ref.some(e => e.includes('MFR='))) result.equipment_ref.push(mfr);
    }
    if (item.part_no && !isBlankOrInvalid(item.part_no)) {
      const pn = `P/N=${applyStandardAbbreviations(clean(item.part_no))}`;
      if (!result.equipment_ref.some(e => e.includes('P/N='))) result.equipment_ref.push(pn);
    }
    if (item.model_no && !isBlankOrInvalid(item.model_no)) {
      const mdl = `MDL=${applyStandardAbbreviations(clean(item.model_no))}`;
      if (!result.equipment_ref.some(e => e.includes('MDL='))) result.equipment_ref.push(mdl);
    }
    if (item.dwg_no && !isBlankOrInvalid(item.dwg_no)) {
      const dwg = `DWG=${applyStandardAbbreviations(clean(item.dwg_no))}`;
      if (!result.equipment_ref.some(e => e.includes('DWG='))) result.equipment_ref.push(dwg);
    }
    if (item.pos_no && !isBlankOrInvalid(item.pos_no)) {
      const pos = `POS=${applyStandardAbbreviations(clean(item.pos_no))}`;
      if (!result.equipment_ref.some(e => e.includes('POS='))) result.equipment_ref.push(pos);
    }

    return result;
  }

  /**
   * Membangun teks saran katalog standar yang terstruktur:
   * [NOUN], [MODIFIER(S)], [CHARACTERISTICS & VALUES], [DIMENSIONS + MATERIAL + CLASS], [EQUIPMENT REF]
   */
  function buildSuggestedDescription(categorized, isService = false) {
    const segments = [];

    // Jika Jasa / Service
    if (isService) {
      segments.push('SERVICE:');
    }

    // 1. NOUN
    if (categorized.noun) {
      segments.push(categorized.noun);
    }

    // 2. MODIFIER(S)
    if (categorized.modifiers && categorized.modifiers.length > 0) {
      categorized.modifiers.forEach(m => {
        if (m && !segments.includes(m)) segments.push(m);
      });
    }

    // 3. CHARACTERISTICS AND VALUES
    if (categorized.characteristics && categorized.characteristics.length > 0) {
      categorized.characteristics.forEach(c => {
        if (c && !segments.includes(c)) segments.push(c);
      });
    }

    // 4. DIMENSIONS + MATERIAL + CLASS AND/OR GRADE AND/OR SCHEDULE
    if (categorized.dimensions_material_class && categorized.dimensions_material_class.length > 0) {
      categorized.dimensions_material_class.forEach(d => {
        if (d && !segments.includes(d)) segments.push(d);
      });
    }

    // 5. EQUIPMENT NAME + EQUIPMENT REFERENCE INFORMATION (MODEL/DWG/POS/MFR/PN)
    if (categorized.equipment_ref && categorized.equipment_ref.length > 0) {
      categorized.equipment_ref.forEach(e => {
        if (e && !segments.includes(e)) segments.push(e);
      });
    }

    let finalStr = segments.join(', ');
    if (isService && finalStr.startsWith('SERVICE:, ')) {
      finalStr = finalStr.replace('SERVICE:, ', 'SERVICE: ');
    }

    return cleanPunctuationAndDelimiters(finalStr);
  }

  /**
   * Evaluasi satu baris material secara menyeluruh (Urutan, Tanda Baca, Singkatan, Typo, dan Pembanding)
   */
  function auditMaterialRow(item) {
    initMaps();

    const issues = [];
    const suggestions = [];
    let score = 100;

    const rawText = clean(item.item_text_result || item.item_text || item.description || '');
    const templateCode = clean(item.template_code || '').toUpperCase();
    const isService = templateCode.startsWith('SVC') || rawText.toUpperCase().startsWith('SERVICE:');

    // 1. Parsing & Kategorisasi 5 Segmen Standar
    const categorized = parseAndCategorizeSegments(item, rawText);
    const suggestedText = buildSuggestedDescription(categorized, isService);

    // Checkpoints status
    const checkpoints = {
      order_ok: true,
      punctuation_ok: true,
      abbreviations_ok: true,
      completeness_ok: true
    };

    // -------------------------------------------------------------------------
    // 2. RULE: Pemeriksaan Kapitalisasi (Harus UPPERCASE)
    // -------------------------------------------------------------------------
    if (rawText && rawText !== rawText.toUpperCase()) {
      score -= 5;
      checkpoints.punctuation_ok = false;
      issues.push({
        type: 'CASING',
        severity: 'minor',
        field: 'item_text_result',
        message: 'Deskripsi mengandung huruf kecil. Standar katalog mewajibkan SEMUA HURUF KAPITAL (UPPERCASE).'
      });
      suggestions.push({
        field: 'item_text_result',
        suggested: rawText.toUpperCase(),
        reason: 'Ubah seluruh huruf menjadi kapital'
      });
    }

    // -------------------------------------------------------------------------
    // 3. RULE: Pemeriksaan Tanda Baca, Kutip Inch, & Delimiter
    // -------------------------------------------------------------------------
    // Cek tanda kutip inch (misal 2" atau 1/2")
    if (/(\d+(?:\.\d+)?|\d+\/\d+)\s*["']/.test(rawText)) {
      score -= 5;
      checkpoints.punctuation_ok = false;
      issues.push({
        type: 'PUNCTUATION_QUOTE',
        severity: 'minor',
        field: 'item_text_result',
        message: 'Penggunaan tanda kutip (" atau \') untuk satuan ukuran tidak baku. Gunakan "IN" untuk inch atau "FT" untuk feet.'
      });
    }

    // Cek koma tidak beraturan (spasi sebelum koma, koma ganda, titik koma)
    if (/;\s*|,\s*,|\s+,/.test(rawText)) {
      score -= 5;
      checkpoints.punctuation_ok = false;
      issues.push({
        type: 'PUNCTUATION_DELIMITER',
        severity: 'minor',
        field: 'item_text_result',
        message: 'Penulisan tanda baca koma/titik-koma tidak rapi. Gunakan pemisah koma dan satu spasi (, ).'
      });
    }

    // Cek delimiter KEY-VALUE yang memakai strip bukan '='
    const dashDelimiterRegex = /\b(SIZE|DIA|OD|ID|THK|LG|WD|HT|PRESS|TEMP|RATING|VOLT|AMP|KW|HP|RATIO|PITCH|MAT|SCH|CL|GR|MDL|DWG|POS|MFR|PN|P\/N)-([0-9/])/gi;
    if (dashDelimiterRegex.test(rawText)) {
      score -= 5;
      checkpoints.punctuation_ok = false;
      issues.push({
        type: 'SYNTAX_DELIMITER',
        severity: 'minor',
        field: 'item_text_result',
        message: 'Penulisan atribut spesifikasi menggunakan tanda minus (-). Standar baku menggunakan tanda sama dengan (=), misal: SIZE=2 IN, MAT=SS316.'
      });
    }

    // -------------------------------------------------------------------------
    // 4. RULE: Pemeriksaan Kepatuhan Urutan Katalog (Noun -> Modifiers -> Char -> Dim/Mat/Class -> Equip)
    // -------------------------------------------------------------------------
    if (rawText && categorized.noun) {
      const upperRaw = rawText.toUpperCase();
      const firstSegment = (upperRaw.split(',')[0] || '').trim();

      // Cek apakah Noun berada di segmen paling depan
      if (!isService && !firstSegment.includes(categorized.noun)) {
        score -= 15;
        checkpoints.order_ok = false;
        issues.push({
          type: 'ORDER_VIOLATION',
          severity: 'critical',
          field: 'item_text_result',
          message: `Urutan katalog tidak sesuai standar. NOUN ('${categorized.noun}') harus berada di awal deskripsi sebelum modifier atau dimensi.`
        });
        suggestions.push({
          field: 'item_text_result',
          suggested: suggestedText,
          reason: 'Atur ulang urutan: NOUN, MODIFIERS, CHARACTERISTICS, DIMENSIONS/MAT/CLASS, EQUIPMENT REF'
        });
      }
    }

    // -------------------------------------------------------------------------
    // 5. RULE: Pemeriksaan Kamus Singkatan (Abbreviation Compliance)
    // -------------------------------------------------------------------------
    if (rawText) {
      const words = rawText.toUpperCase().split(/[\s,]+/);
      for (const w of words) {
        if (fullToAbvMap.has(w)) {
          const recAbv = fullToAbvMap.get(w);
          if (w.length > 3 && recAbv !== w) {
            score -= 3;
            checkpoints.abbreviations_ok = false;
            issues.push({
              type: 'ABBREVIATION_VIOLATION',
              severity: 'info',
              field: 'item_text_result',
              message: `Kata '${w}' dapat disingkat menjadi '${recAbv}' sesuai kamus standar SCS.`
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 6. RULE: Deteksi Typo Spesifik
    // -------------------------------------------------------------------------
    const commonTypos = [
      { wrong: 'COPLING', right: 'COUPLING', field: 'major_name' },
      { wrong: 'CLIB', right: 'CLIP', field: 'modifier1' },
      { wrong: 'GREATHER', right: 'GREATER', field: 'item_text_result' },
      { wrong: 'REINFORCEED', right: 'REINFORCED', field: 'item_text_result' },
      { wrong: 'ENVIRONTMENTAL', right: 'ENVIRONMENTAL', field: 'item_text_result' },
      { wrong: 'GALVANIZE', right: 'GALV', field: 'material' },
      { wrong: 'BEERNG', right: 'BEARING', field: 'major_name' },
      { wrong: 'VLVE', right: 'VALVE', field: 'major_name' }
    ];

    commonTypos.forEach(t => {
      const safeWrong = String(t.wrong).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${safeWrong}\\b`, 'i');
      if (regex.test(rawText)) {
        score -= 8;
        checkpoints.abbreviations_ok = false;
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

    // -------------------------------------------------------------------------
    // 7. RULE: Template Mandatory Fields Check
    // -------------------------------------------------------------------------
    const tempPrefix = templateCode.split('-')[0];
    const templateDef = (window.CATALOG_RULES?.TEMPLATES || []).find(t => t.code === tempPrefix);

    if (!templateCode) {
      score -= 20;
      checkpoints.completeness_ok = false;
      issues.push({
        type: 'TEMPLATE_MISSING',
        severity: 'critical',
        field: 'template_code',
        message: 'Kode template belum ditentukan (misal: GEN-XX, UNT-XX, OEM-XX, STR-XX).'
      });
    } else if (templateDef) {
      const mfr = clean(item.manufacture || item.manufacturer || '').toUpperCase();
      const dwgNo = clean(item.dwg_no || item.drawing_no || '').toUpperCase();
      const partNo = clean(item.part_no || item.part_number || '').toUpperCase();
      const modelNo = clean(item.model_no || '').toUpperCase();
      const size = clean(item.size || item.dimensions || '').toUpperCase();
      const matl = clean(item.material || '').toUpperCase();

      if (templateDef.code === 'OEM') {
        if (isBlankOrInvalid(mfr)) {
          score -= 15;
          checkpoints.completeness_ok = false;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'manufacture',
            message: 'Template OEM wajib memiliki Manufacture/Brand spesifik.'
          });
        }
        if (isBlankOrInvalid(partNo)) {
          score -= 20;
          checkpoints.completeness_ok = false;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'part_no',
            message: 'Template OEM wajib memiliki Part Number yang valid dari pabrikan.'
          });
        }
        if (isBlankOrInvalid(dwgNo) && isBlankOrInvalid(modelNo)) {
          score -= 10;
          checkpoints.completeness_ok = false;
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
          checkpoints.completeness_ok = false;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'manufacture',
            message: 'Template UNIT wajib memiliki Manufacture/Brand.'
          });
        }
        if (isBlankOrInvalid(partNo) && isBlankOrInvalid(modelNo)) {
          score -= 15;
          checkpoints.completeness_ok = false;
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
          checkpoints.completeness_ok = false;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'size',
            message: 'Template Construction (STR) wajib memiliki dimensi/ukuran fisik (Size).'
          });
        }
        if (isBlankOrInvalid(matl)) {
          score -= 15;
          checkpoints.completeness_ok = false;
          issues.push({
            type: 'MANDATORY_MISSING',
            severity: 'critical',
            field: 'material',
            message: 'Template Construction (STR) wajib mencantumkan jenis material (misal SS316, SS400).'
          });
        }
      }
    }

    // Batasi skor minimum 0 dan maksimum 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = 'COMPLIANT';
    if (score < 60) status = 'NON_COMPLIANT';
    else if (score < 90) status = 'WARNING';

    return {
      material_id: item.material_code || item.id || '-',
      material_code: item.material_code || item.id || '-',
      item_text: rawText,
      suggested_text: suggestedText || rawText,
      final_text: item.final_text || suggestedText || rawText,
      template_code: templateCode,
      score,
      status,
      review_status: item.review_status || 'PENDING', // PENDING | APPROVED_SUGGESTION | REVISED_MANUAL | REJECTED_ORIGINAL
      reviewed_by: item.reviewed_by || null,
      reviewed_at: item.reviewed_at || null,
      review_notes: item.review_notes || '',
      issue_count: issues.length,
      issues,
      suggestions,
      segments: categorized,
      checkpoints
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
    let pendingReviewCount = 0;
    let approvedCount = 0;
    let revisedCount = 0;
    let rejectedCount = 0;

    results.forEach(res => {
      totalScore += res.score;
      if (res.status === 'COMPLIANT') compliantCount++;
      else if (res.status === 'WARNING') warningCount++;
      else nonCompliantCount++;

      if (res.review_status === 'APPROVED_SUGGESTION') approvedCount++;
      else if (res.review_status === 'REVISED_MANUAL') revisedCount++;
      else if (res.review_status === 'REJECTED_ORIGINAL') rejectedCount++;
      else pendingReviewCount++;

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
        pending_review_count: pendingReviewCount,
        approved_count: approvedCount,
        revised_count: revisedCount,
        rejected_count: rejectedCount,
        reviewed_count: (approvedCount + revisedCount + rejectedCount),
        compliance_rate: total > 0 ? Math.round((compliantCount / total) * 100) : 100
      },
      results
    };
  }

  // Export ke global window
  window.ConsistencyEngine = {
    auditMaterialRow,
    auditCatalogDataset,
    applyStandardAbbreviations,
    cleanPunctuationAndDelimiters,
    parseAndCategorizeSegments,
    buildSuggestedDescription
  };

})();
