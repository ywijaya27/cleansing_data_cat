-- =============================================================================
-- AI Material Master Cleansing, Rationalization & Explainability Engine
-- Versi 2.1 (Ultra High Performance for 20,000+ Rows - Fast Blocking & No Timeout)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 0. Normalisasi candidate_id dan material_a/b menjadi TEXT jika sebelumnya bertipe UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'duplicate_analysis' 
          AND column_name = 'candidate_id' 
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE public.duplicate_analysis ALTER COLUMN candidate_id TYPE TEXT USING candidate_id::text;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'review_queue' 
          AND column_name = 'candidate_id' 
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE public.review_queue ALTER COLUMN candidate_id TYPE TEXT USING candidate_id::text;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'similar_material' 
          AND column_name = 'material_a' 
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE public.similar_material ALTER COLUMN material_a TYPE TEXT USING material_a::text;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'similar_material' 
          AND column_name = 'material_b' 
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE public.similar_material ALTER COLUMN material_b TYPE TEXT USING material_b::text;
    END IF;
END $$;

-- 1. Perbarui kolom tabel duplicate_analysis
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS candidate_id TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS cluster_id TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS material_id_a UUID;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS material_id_b UUID;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS code_a TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS code_b TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS desc_a TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS desc_b TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS mfr_a TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS mfr_b TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS pn_a TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS pn_b TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS qty_a NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS qty_b NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS val_a NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS val_b NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS part_number_score NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS manufacturer_score NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS attribute_score NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS description_score NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS vector_score NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS duplicate_score NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS is_master_a BOOLEAN DEFAULT false;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS is_master_b BOOLEAN DEFAULT false;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS recommended_master_id UUID;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS recommended_master_code TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS rationalization_action TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS potential_saving NUMERIC DEFAULT 0;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS confidence_level TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS ai_explanation TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS match_factors JSONB;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'PENDING';
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS assigned_reviewer TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE public.duplicate_analysis ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 2. Perbarui kolom tabel similar_material
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS material_a TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS material_b TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS material_id_a UUID;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS material_id_b UUID;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS similarity_score NUMERIC DEFAULT 0;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS similarity_type TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS desc_a TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS desc_b TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS mfr_a TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS mfr_b TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS pn_a TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS pn_b TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS saving_opportunity NUMERIC DEFAULT 0;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS ai_explanation TEXT;
ALTER TABLE public.similar_material ADD COLUMN IF NOT EXISTS spec_attributes JSONB;

-- 3. Fungsi Utilitas Normalisasi String
CREATE OR REPLACE FUNCTION public.clean_part_number(val TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN UPPER(REGEXP_REPLACE(COALESCE(val, ''), '[^A-Za-z0-9]', '', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.clean_brand(val TEXT)
RETURNS TEXT AS $$
DECLARE
    b TEXT;
BEGIN
    b := UPPER(TRIM(COALESCE(val, '')));
    IF b IN ('SKF BEARING', 'SKF INDONESIA') THEN RETURN 'SKF';
    ELSIF b IN ('SIEMENS AG', 'SIEMENS INDONESIA') THEN RETURN 'SIEMENS';
    ELSIF b IN ('SCHNEIDER ELECTRIC', 'TELEMECANIQUE', 'MERLIN GERIN') THEN RETURN 'SCHNEIDER';
    ELSIF b IN ('KITZ VALVE', 'KITZ CORP') THEN RETURN 'KITZ';
    ELSIF b IN ('EBARA PUMP', 'EBARA INDONESIA') THEN RETURN 'EBARA';
    ELSIF b IN ('FAG', 'SCHAEFFLER', 'INA') THEN RETURN 'SCHAEFFLER-FAG';
    END IF;
    RETURN b;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. MESIN UTAMA DENGAN INDEXED FAST BLOCKING, BATCH SLICING & EXTENDED TIMEOUT
CREATE OR REPLACE FUNCTION public.run_material_cleansing_ai(
    p_min_duplicate_score NUMERIC DEFAULT 75,
    p_min_similarity_score NUMERIC DEFAULT 60,
    p_limit INT DEFAULT 1000
)
RETURNS JSONB 
SET statement_timeout = '120s'
SET lock_timeout = '30s'
AS $$
DECLARE
    v_total_materials INT;
    v_processed_count INT := 0;
    v_duplicates_found INT := 0;
    v_similar_found INT := 0;
    v_clusters_count INT := 0;
    v_total_potential_savings NUMERIC := 0;
    v_effective_limit INT;
BEGIN
    -- Tingkatkan batas waktu eksekusi lokal dan toleransi lock timeout
    PERFORM set_config('statement_timeout', '120000', true);
    PERFORM set_config('lock_timeout', '30000', true);

    SELECT COUNT(*) INTO v_total_materials FROM public.material_raw;
    IF v_total_materials < 2 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Dibutuhkan minimal 2 data material untuk menjalankan analisis duplikasi dan similarity.'
        );
    END IF;

    -- Tentukan limit efektif (jika p_limit <= 0 atau NULL maka proses semua)
    v_effective_limit := CASE WHEN p_limit IS NOT NULL AND p_limit > 0 THEN p_limit ELSE NULL END;

    -- Bersihkan hasil lama dengan DELETE aman (Menghindari ACCESS EXCLUSIVE lock dari TRUNCATE yang memicu lock timeout)
    DELETE FROM public.duplicate_analysis WHERE true;
    DELETE FROM public.similar_material WHERE true;

    -- LANGKAH 1: Buat Temp Table dengan Pra-Kalkulasi Token & Normalisasi (Batch Slicing)
    DROP TABLE IF EXISTS temp_mat_prep;
    CREATE TEMP TABLE temp_mat_prep ON COMMIT DROP AS
    SELECT 
        sub.id,
        sub.material_code,
        sub.material_description,
        COALESCE(sub.manufacturer, '') AS manufacturer,
        clean_brand(sub.manufacturer) AS norm_brand,
        COALESCE(sub.part_number, '') AS part_number,
        clean_part_number(sub.part_number) AS norm_pn,
        COALESCE(NULLIF(TRIM(sub.material_group), ''), 'UNCLASSIFIED') AS material_group,
        COALESCE(sub.base_uom, '') AS base_uom,
        COALESCE(sub.stock_qty, 0) AS stock_qty,
        COALESCE(sub.stock_value, 0) AS stock_value,
        UPPER(NULLIF(SPLIT_PART(TRIM(REGEXP_REPLACE(sub.material_description, '[^A-Za-z0-9 ]', ' ', 'g')), ' ', 1), '')) AS token1,
        UPPER(NULLIF(SPLIT_PART(TRIM(REGEXP_REPLACE(sub.material_description, '[^A-Za-z0-9 ]', ' ', 'g')), ' ', 2), '')) AS token2,
        (
            CASE WHEN sub.material_code IS NOT NULL AND sub.material_code != '' THEN 20 ELSE 0 END +
            CASE WHEN sub.material_description IS NOT NULL AND LENGTH(sub.material_description) > 10 THEN 30 ELSE 0 END +
            CASE WHEN sub.manufacturer IS NOT NULL AND sub.manufacturer != '' THEN 25 ELSE 0 END +
            CASE WHEN sub.part_number IS NOT NULL AND sub.part_number != '' THEN 25 ELSE 0 END
        ) AS quality_weight
    FROM (
        SELECT * FROM public.material_raw
        ORDER BY created_at DESC
        LIMIT v_effective_limit
    ) sub;

    SELECT COUNT(*) INTO v_processed_count FROM temp_mat_prep;

    CREATE INDEX idx_tmp_mat_pn ON temp_mat_prep (norm_pn);
    CREATE INDEX idx_tmp_mat_tok1_tok2 ON temp_mat_prep (token1, token2);
    CREATE INDEX idx_tmp_mat_tok1_brand ON temp_mat_prep (token1, norm_brand);

    -- LANGKAH 2: CANDIDATE PAIRS DENGAN TARGETED FAST BLOCKING (< 2 detik untuk 50.000+ data)
    DROP TABLE IF EXISTS temp_candidate_pairs;
    CREATE TEMP TABLE temp_candidate_pairs ON COMMIT DROP AS
    -- Block 1: Part number bersih sama persis (>= 4 karakter) -> Hash Join super cepat
    SELECT 
        a.id AS id_a, b.id AS id_b,
        a.material_code AS code_a, b.material_code AS code_b,
        a.material_description AS desc_a, b.material_description AS desc_b,
        a.manufacturer AS mfr_a, b.manufacturer AS mfr_b,
        a.norm_brand AS brand_a, b.norm_brand AS brand_b,
        a.part_number AS pn_a, b.part_number AS pn_b,
        a.norm_pn AS npn_a, b.norm_pn AS npn_b,
        a.material_group AS group_a, b.material_group AS group_b,
        a.base_uom AS uom_a, b.base_uom AS uom_b,
        a.stock_qty AS qty_a, b.stock_qty AS qty_b,
        a.stock_value AS val_a, b.stock_value AS val_b,
        a.quality_weight AS qw_a, b.quality_weight AS qw_b,
        'PART_NUMBER_MATCH' AS block_reason
    FROM temp_mat_prep a
    JOIN temp_mat_prep b ON a.id < b.id AND a.norm_pn = b.norm_pn
    WHERE LENGTH(a.norm_pn) >= 4

    UNION

    -- Block 2: 2 Kata Kunci Pertama sama (token1 & token2, misal VALVE GLOBE = VALVE GLOBE)
    SELECT 
        a.id AS id_a, b.id AS id_b,
        a.material_code AS code_a, b.material_code AS code_b,
        a.material_description AS desc_a, b.material_description AS desc_b,
        a.manufacturer AS mfr_a, b.manufacturer AS mfr_b,
        a.norm_brand AS brand_a, b.norm_brand AS brand_b,
        a.part_number AS pn_a, b.part_number AS pn_b,
        a.norm_pn AS npn_a, b.norm_pn AS npn_b,
        a.material_group AS group_a, b.material_group AS group_b,
        a.base_uom AS uom_a, b.base_uom AS uom_b,
        a.stock_qty AS qty_a, b.stock_qty AS qty_b,
        a.stock_value AS val_a, b.stock_value AS val_b,
        a.quality_weight AS qw_a, b.quality_weight AS qw_b,
        'DUAL_KEYWORD_MATCH' AS block_reason
    FROM temp_mat_prep a
    JOIN temp_mat_prep b ON a.id < b.id 
      AND a.token1 = b.token1 
      AND a.token2 = b.token2
    WHERE (a.norm_pn != b.norm_pn OR a.norm_pn = '')
      AND a.token1 IS NOT NULL AND a.token2 IS NOT NULL
      AND LENGTH(a.token1) >= 3 AND LENGTH(a.token2) >= 3
      AND similarity(a.material_description, b.material_description) >= 0.40

    UNION

    -- Block 3: Kata Kunci Pertama sama DAN Brand/Pabrikan sama (misal BEARING SKF = BEARING SKF)
    SELECT 
        a.id AS id_a, b.id AS id_b,
        a.material_code AS code_a, b.material_code AS code_b,
        a.material_description AS desc_a, b.material_description AS desc_b,
        a.manufacturer AS mfr_a, b.manufacturer AS mfr_b,
        a.norm_brand AS brand_a, b.norm_brand AS brand_b,
        a.part_number AS pn_a, b.part_number AS pn_b,
        a.norm_pn AS npn_a, b.norm_pn AS npn_b,
        a.material_group AS group_a, b.material_group AS group_b,
        a.base_uom AS uom_a, b.base_uom AS uom_b,
        a.stock_qty AS qty_a, b.stock_qty AS qty_b,
        a.stock_value AS val_a, b.stock_value AS val_b,
        a.quality_weight AS qw_a, b.quality_weight AS qw_b,
        'KEYWORD_AND_BRAND_MATCH' AS block_reason
    FROM temp_mat_prep a
    JOIN temp_mat_prep b ON a.id < b.id 
      AND a.token1 = b.token1 
      AND a.norm_brand = b.norm_brand
    WHERE (a.norm_pn != b.norm_pn OR a.norm_pn = '')
      AND a.token1 IS NOT NULL AND a.norm_brand != ''
      AND LENGTH(a.token1) >= 3
      AND similarity(a.material_description, b.material_description) >= 0.40

    UNION

    -- Block 4: Kata Kunci Terbalik (misal BALL BEARING = BEARING BALL)
    SELECT 
        a.id AS id_a, b.id AS id_b,
        a.material_code AS code_a, b.material_code AS code_b,
        a.material_description AS desc_a, b.material_description AS desc_b,
        a.manufacturer AS mfr_a, b.manufacturer AS mfr_b,
        a.norm_brand AS brand_a, b.norm_brand AS brand_b,
        a.part_number AS pn_a, b.part_number AS pn_b,
        a.norm_pn AS npn_a, b.norm_pn AS npn_b,
        a.material_group AS group_a, b.material_group AS group_b,
        a.base_uom AS uom_a, b.base_uom AS uom_b,
        a.stock_qty AS qty_a, b.stock_qty AS qty_b,
        a.stock_value AS val_a, b.stock_value AS val_b,
        a.quality_weight AS qw_a, b.quality_weight AS qw_b,
        'CROSS_TOKEN_MATCH' AS block_reason
    FROM temp_mat_prep a
    JOIN temp_mat_prep b ON a.id < b.id 
      AND a.token1 = b.token2 
      AND a.token2 = b.token1
    WHERE (a.norm_pn != b.norm_pn OR a.norm_pn = '')
      AND a.token1 IS NOT NULL AND a.token2 IS NOT NULL
      AND LENGTH(a.token1) >= 3 AND LENGTH(b.token2) >= 3
      AND similarity(a.material_description, b.material_description) >= 0.45;

    -- LANGKAH 3: SCORING MULTI-KRITERIA TERBOBOT
    WITH scored_pairs AS (
        SELECT 
            cp.*,
            -- Skor Part Number (35%)
            CASE 
                WHEN cp.npn_a = cp.npn_b AND LENGTH(cp.npn_a) >= 4 THEN 100.0
                WHEN LENGTH(cp.npn_a) >= 4 AND LENGTH(cp.npn_b) >= 4 AND (cp.npn_a LIKE '%' || cp.npn_b || '%' OR cp.npn_b LIKE '%' || cp.npn_a || '%') THEN 85.0
                WHEN cp.npn_a != '' AND cp.npn_b != '' THEN ROUND((similarity(cp.pn_a, cp.pn_b) * 100)::numeric, 1)
                ELSE 50.0
            END AS score_pn,
            -- Skor Pabrikan (20%)
            CASE 
                WHEN cp.brand_a = cp.brand_b AND cp.brand_a != '' THEN 100.0
                WHEN cp.brand_a != '' AND cp.brand_b != '' AND (cp.brand_a LIKE '%' || cp.brand_b || '%' OR cp.brand_b LIKE '%' || cp.brand_a || '%') THEN 85.0
                WHEN cp.brand_a = '' OR cp.brand_b = '' THEN 50.0
                ELSE 20.0
            END AS score_mfr,
            -- Skor Deskripsi (25%)
            ROUND((similarity(cp.desc_a, cp.desc_b) * 100)::numeric, 1) AS score_desc,
            -- Skor Atribut (20%)
            (
                (CASE WHEN cp.uom_a = cp.uom_b AND cp.uom_a != '' THEN 50.0 ELSE 20.0 END) +
                (CASE WHEN cp.group_a = cp.group_b AND cp.group_a != '' THEN 50.0 ELSE 10.0 END)
            ) AS score_attr
        FROM temp_candidate_pairs cp
    ),
    calculated_pairs AS (
        SELECT 
            sp.*,
            ROUND(
                (sp.score_pn * 0.35) + 
                (sp.score_mfr * 0.20) + 
                (sp.score_desc * 0.25) + 
                (sp.score_attr * 0.20),
                1
            ) AS total_duplicate_score,
            CASE 
                WHEN (sp.qw_a + (sp.val_a * 0.00001)) >= (sp.qw_b + (sp.val_b * 0.00001)) THEN sp.id_a
                ELSE sp.id_b
            END AS master_id,
            CASE 
                WHEN (sp.qw_a + (sp.val_a * 0.00001)) >= (sp.qw_b + (sp.val_b * 0.00001)) THEN sp.code_a
                ELSE sp.code_b
            END AS master_code,
            CASE 
                WHEN (sp.qw_a + (sp.val_a * 0.00001)) >= (sp.qw_b + (sp.val_b * 0.00001)) THEN sp.val_b
                ELSE sp.val_a
            END AS redundant_saving
        FROM scored_pairs sp
    )
    INSERT INTO public.duplicate_analysis (
        candidate_id,
        cluster_id,
        material_id_a,
        material_id_b,
        code_a,
        code_b,
        desc_a,
        desc_b,
        mfr_a,
        mfr_b,
        pn_a,
        pn_b,
        qty_a,
        qty_b,
        val_a,
        val_b,
        part_number_score,
        manufacturer_score,
        attribute_score,
        description_score,
        vector_score,
        duplicate_score,
        recommended_master_id,
        recommended_master_code,
        is_master_a,
        is_master_b,
        rationalization_action,
        potential_saving,
        confidence_level,
        recommendation,
        ai_explanation,
        match_factors,
        review_status
    )
    SELECT
        'DUP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(ROW_NUMBER() OVER ()::text, 4, '0') AS candidate_id,
        'CLUST-' || LPAD((DENSE_RANK() OVER (ORDER BY LEAST(cp.id_a::text, cp.id_b::text)))::text, 4, '0') AS cluster_id,
        cp.id_a,
        cp.id_b,
        cp.code_a,
        cp.code_b,
        cp.desc_a,
        cp.desc_b,
        cp.mfr_a,
        cp.mfr_b,
        cp.pn_a,
        cp.pn_b,
        cp.qty_a,
        cp.qty_b,
        cp.val_a,
        cp.val_b,
        cp.score_pn,
        cp.score_mfr,
        cp.score_attr,
        cp.score_desc,
        cp.score_desc,
        cp.total_duplicate_score,
        cp.master_id,
        cp.master_code,
        (cp.master_id = cp.id_a),
        (cp.master_id = cp.id_b),
        CASE 
            WHEN cp.total_duplicate_score >= 95 THEN 'MERGE_IMMEDIATELY'
            WHEN cp.total_duplicate_score >= 85 THEN 'REVIEW_FOR_MERGE'
            WHEN cp.total_duplicate_score >= 75 THEN 'FLAG_POSSIBLE_DUPLICATE'
            ELSE 'KEEP_SEPARATE'
        END,
        cp.redundant_saving,
        CASE 
            WHEN cp.total_duplicate_score >= 95 THEN 'VERY_HIGH'
            WHEN cp.total_duplicate_score >= 85 THEN 'HIGH'
            WHEN cp.total_duplicate_score >= 75 THEN 'MEDIUM'
            ELSE 'LOW'
        END,
        CASE 
            WHEN cp.total_duplicate_score >= 95 THEN 'Duplikat identik terkonfirmasi. Gabungkan stok material ke Golden Record [' || cp.master_code || '] dan nonaktifkan kode duplikat.'
            WHEN cp.total_duplicate_score >= 85 THEN 'Kandidat duplikat kuat. Verifikasi spesifikasi fisik sebelum penggabungan master data.'
            ELSE 'Tinjau perbedaan spesifikasi pada deskripsi material.'
        END,
        'Analisis AI mendeteksi ' || 
        CASE WHEN cp.total_duplicate_score >= 95 THEN 'duplikasi identik ' ELSE 'indikasi duplikasi ' END ||
        'dengan skor ' || cp.total_duplicate_score || '%. ' ||
        CASE 
            WHEN cp.score_pn = 100 THEN 'Part Number [' || cp.pn_a || '] cocok 100%. '
            WHEN cp.score_pn >= 80 THEN 'Part Number memiliki kemiripan ' || cp.score_pn || '%. '
            ELSE 'Part number tidak identik namun deskripsi memiliki kemiripan kuat. '
        END ||
        CASE 
            WHEN cp.score_mfr = 100 THEN 'Pabrikan [' || cp.brand_a || '] identik. '
            WHEN cp.brand_a != '' AND cp.brand_b != '' THEN 'Pabrikan [' || cp.brand_a || '] vs [' || cp.brand_b || ']. '
            ELSE 'Pabrikan tidak terisi lengkap pada salah satu material. '
        END ||
        'Kemiripan deskripsi mencapai ' || cp.score_desc || '%. ' ||
        'Material [' || cp.master_code || '] direkomendasikan sebagai Golden Master karena kelengkapan metadata dan nilai inventori yang lebih tinggi. ' ||
        'Potensi efisiensi penggabungan inventori: Rp ' || TO_CHAR(cp.redundant_saving, 'FM999,999,999,999') || '.',
        jsonb_build_object(
            'score_pn', cp.score_pn,
            'score_mfr', cp.score_mfr,
            'score_desc', cp.score_desc,
            'score_attr', cp.score_attr,
            'block_reason', cp.block_reason,
            'master_code', cp.master_code
        ),
        'PENDING'
    FROM calculated_pairs cp
    WHERE cp.total_duplicate_score >= p_min_duplicate_score;

    GET DIAGNOSTICS v_duplicates_found = ROW_COUNT;

    -- LANGKAH 4: HITUNG CLUSTER HASIL ANALISIS
    SELECT COUNT(DISTINCT cluster_id) INTO v_clusters_count FROM public.duplicate_analysis;

    -- LANGKAH 5: SIMILARITY DETECTION ENGINE (Alternatif Pabrikan / Brand Cross-Reference)
    INSERT INTO public.similar_material (
        material_a,
        material_b,
        material_id_a,
        material_id_b,
        desc_a,
        desc_b,
        mfr_a,
        mfr_b,
        pn_a,
        pn_b,
        similarity_score,
        similarity_type,
        saving_opportunity,
        ai_explanation,
        spec_attributes
    )
    SELECT 
        cp.code_a,
        cp.code_b,
        cp.id_a,
        cp.id_b,
        cp.desc_a,
        cp.desc_b,
        cp.mfr_a,
        cp.mfr_b,
        cp.pn_a,
        cp.pn_b,
        ROUND(
            (CASE WHEN cp.npn_a = cp.npn_b AND LENGTH(cp.npn_a) >= 4 THEN 92.0 ELSE similarity(cp.desc_a, cp.desc_b) * 100 END)::numeric,
            1
        ) AS sim_score,
        CASE 
            WHEN cp.npn_a = cp.npn_b AND LENGTH(cp.npn_a) >= 4 AND cp.brand_a != cp.brand_b THEN 'ALTERNATIVE_BRAND'
            WHEN cp.group_a = cp.group_b AND similarity(cp.desc_a, cp.desc_b) >= 0.70 THEN 'EQUIVALENT_SPEC'
            WHEN similarity(cp.desc_a, cp.desc_b) >= 0.55 THEN 'INTERCHANGEABLE'
            ELSE 'SUBSTITUTE'
        END AS sim_type,
        ABS(COALESCE(cp.val_a, 0) - COALESCE(cp.val_b, 0)) AS saving_opp,
        'Terdeteksi kesamaan fungsional antara [' || cp.code_a || '] dan [' || cp.code_b || ']. ' ||
        CASE 
            WHEN cp.npn_a = cp.npn_b AND cp.brand_a != cp.brand_b THEN 
                'Part Number sama (' || cp.pn_a || ') dari pabrikan berbeda (' || COALESCE(cp.mfr_a, '-') || ' vs ' || COALESCE(cp.mfr_b, '-') || '). Sangat berpotensi dijadikan opsi cross-reference atau alternatif substitusi pengadaan.'
            ELSE 
                'Karakteristik teknis pada grup ' || COALESCE(cp.group_a, 'Umum') || ' memiliki kemiripan ' || ROUND((similarity(cp.desc_a, cp.desc_b)*100)::numeric, 1) || '%.'
        END,
        jsonb_build_object(
            'brand_a', cp.mfr_a,
            'brand_b', cp.mfr_b,
            'group', cp.group_a,
            'uom_a', cp.uom_a,
            'uom_b', cp.uom_b
        )
    FROM temp_candidate_pairs cp
    WHERE (
        (cp.npn_a = cp.npn_b AND LENGTH(cp.npn_a) >= 4 AND cp.brand_a != cp.brand_b)
        OR 
        similarity(cp.desc_a, cp.desc_b) >= 0.45
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.duplicate_analysis da 
        WHERE da.material_id_a = cp.id_a AND da.material_id_b = cp.id_b AND da.duplicate_score >= 90
    )
    LIMIT 2000;

    GET DIAGNOSTICS v_similar_found = ROW_COUNT;

    SELECT COALESCE(SUM(potential_saving), 0) INTO v_total_potential_savings FROM public.duplicate_analysis;

    -- Jurnal Audit Trail
    INSERT INTO public.audit_trail (module_name, action_name, user_email, record_id, description)
    VALUES (
        'AI_CLEANSING_ENGINE',
        'RUN_ANALYSIS',
        'SYSTEM_AI',
        'BATCH-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
        'Analisis AI selesai untuk ' || v_processed_count || ' material (dari total ' || v_total_materials || '): ' || v_duplicates_found || ' duplikat terdeteksi (' || v_clusters_count || ' cluster), ' || v_similar_found || ' similar items.'
    );

    RETURN jsonb_build_object(
        'success', true,
        'totalMaterials', v_total_materials,
        'processedMaterials', v_processed_count,
        'duplicatesFound', v_duplicates_found,
        'similarFound', v_similar_found,
        'clustersCount', v_clusters_count,
        'potentialSavings', v_total_potential_savings,
        'message', 'Analisis AI sukses memproses ' || v_processed_count || ' material: ' || v_duplicates_found || ' duplikat (' || v_clusters_count || ' cluster) dan ' || v_similar_found || ' substitusi alternatif berhasil diidentifikasi.'
    );
END;
$$ LANGUAGE plpgsql;

-- Overload fallback untuk panggilan 2 argumen
CREATE OR REPLACE FUNCTION public.run_material_cleansing_ai(
    p_min_duplicate_score NUMERIC,
    p_min_similarity_score NUMERIC
)
RETURNS JSONB AS $$
BEGIN
    RETURN public.run_material_cleansing_ai(p_min_duplicate_score, p_min_similarity_score, 1000);
END;
$$ LANGUAGE plpgsql;

-- 5. Hak akses
GRANT EXECUTE ON FUNCTION public.clean_part_number(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clean_brand(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_material_cleansing_ai(NUMERIC, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_material_cleansing_ai(NUMERIC, NUMERIC, INT) TO anon, authenticated, service_role;
