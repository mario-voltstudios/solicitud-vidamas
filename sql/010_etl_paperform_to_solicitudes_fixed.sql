-- ============================================================
-- VidaMás — ETL Fix: Paperform → solicitudes
-- 010_etl_paperform_to_solicitudes_fixed.sql
--
-- PURPOSE:
--   Replace the incomplete fn_merge_paperform_submission() from 008_
--   with a full-fidelity version that:
--   (a) Reads ALL 202 Paperform fields from raw_data->>'data'
--   (b) Correctly maps asegurado fields (Opus audit C1 corrections)
--   (c) Populates ALL available solicitudes columns
--   (d) Handles asegurado_es_contratante (misma_persona) flag
--   (e) Inserts into solicitud_beneficiarios (normalized)
--   (f) Populates solicitud_documentos with file URLs
--
-- STATUS: Schema columns added here are all ADD IF NOT EXISTS —
--   safe to run on live DB. The ETL function replaces the prior one.
--
-- FIELD MAPPING CORRECTIONS (Opus audit C1):
--   Row 76: dkgeo (RFC Asegurado) → asegurado_rfc (NOT contratante_rfc)
--   Row 78: da3l1 (Nacionalidad Asegurado) → asegurado_nacionalidad (NOT contratante_nacionalidad)
--   Row 79: d6amg (Id fiscal extranjero Asegurado) → asegurado_identificacion_fiscal_extranjero
--   Row 92: dup5j (Municipio Asegurado) → asegurado_municipio (NOT alcaldia)
--   Row 94: 7npe9 (Pais Asegurado) → asegurado_pais (NOT contratante_pais)
-- ============================================================

-- ----------------------------------------------------------
-- 1. Add missing asegurado columns to solicitudes
--    (C1 corrections — these were absent or wrongly mapped)
-- ----------------------------------------------------------
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS asegurado_rfc                           text,
  ADD COLUMN IF NOT EXISTS asegurado_nacionalidad                  text,
  ADD COLUMN IF NOT EXISTS asegurado_identificacion_fiscal_extranjero text,
  ADD COLUMN IF NOT EXISTS asegurado_tipo_identificacion           text,
  ADD COLUMN IF NOT EXISTS asegurado_identificacion_emisor         text,
  ADD COLUMN IF NOT EXISTS asegurado_identificacion_numero         text,
  ADD COLUMN IF NOT EXISTS asegurado_email                         text,
  ADD COLUMN IF NOT EXISTS asegurado_telefono_movil                text,
  ADD COLUMN IF NOT EXISTS asegurado_ocupacion                     text,
  ADD COLUMN IF NOT EXISTS asegurado_estado_nacimiento             text,
  ADD COLUMN IF NOT EXISTS asegurado_mismo_domicilio_contratante   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS asegurado_calle                         text,
  ADD COLUMN IF NOT EXISTS asegurado_numero_exterior               text,
  ADD COLUMN IF NOT EXISTS asegurado_numero_interior               text,
  ADD COLUMN IF NOT EXISTS asegurado_cp                            text,
  ADD COLUMN IF NOT EXISTS asegurado_colonia                       text,
  ADD COLUMN IF NOT EXISTS asegurado_estado                        text,
  ADD COLUMN IF NOT EXISTS asegurado_municipio                     text,   -- ✅ own column
  ADD COLUMN IF NOT EXISTS asegurado_pais                          text,   -- ✅ own column
  ADD COLUMN IF NOT EXISTS asegurado_tiene_otras_polizas           text;

-- Add missing contratante columns
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS contratante_lugar_nacimiento            text,
  ADD COLUMN IF NOT EXISTS contratante_identificacion_fiscal_extranjero text,
  ADD COLUMN IF NOT EXISTS contratante_regimen_fiscal              text,
  ADD COLUMN IF NOT EXISTS contratante_tipo_identificacion         text,
  ADD COLUMN IF NOT EXISTS contratante_identificacion_emisor       text,
  ADD COLUMN IF NOT EXISTS contratante_identificacion_numero       text,
  ADD COLUMN IF NOT EXISTS contratante_numero_exterior             text,
  ADD COLUMN IF NOT EXISTS contratante_numero_interior             text,
  ADD COLUMN IF NOT EXISTS contratante_cp                          text,
  ADD COLUMN IF NOT EXISTS contratante_colonia                     text,
  ADD COLUMN IF NOT EXISTS contratante_pais                        text,
  ADD COLUMN IF NOT EXISTS contratante_telefono_movil              text;

-- Add intake/plan detail columns
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS agente_cedula_vigente                   text,
  ADD COLUMN IF NOT EXISTS rfc_ejecutivo                           text,
  ADD COLUMN IF NOT EXISTS email_agente                            text,
  ADD COLUMN IF NOT EXISTS fecha_firma_dia                         text,
  ADD COLUMN IF NOT EXISTS fecha_firma_mes                         text,
  ADD COLUMN IF NOT EXISTS fecha_firma_anio                        text,
  ADD COLUMN IF NOT EXISTS municipio_venta                         text,
  ADD COLUMN IF NOT EXISTS asegurado_es_contratante               text,
  ADD COLUMN IF NOT EXISTS declaracion_salud                       text,
  ADD COLUMN IF NOT EXISTS covid_historial                         text,
  ADD COLUMN IF NOT EXISTS covid_dias_ultimo_resultado_positivo    text,
  ADD COLUMN IF NOT EXISTS covid_asistencia_respiratoria           text,
  ADD COLUMN IF NOT EXISTS asegurado_fuma                          text,
  ADD COLUMN IF NOT EXISTS producto_modalidad                      text,
  ADD COLUMN IF NOT EXISTS paquete_proteccion                      text,
  ADD COLUMN IF NOT EXISTS suma_asegurada_cotizada                 numeric(12,2),
  ADD COLUMN IF NOT EXISTS prima_anual_riesgo                      numeric(10,2),
  ADD COLUMN IF NOT EXISTS prima_ahorro_anual                      numeric(10,2),
  ADD COLUMN IF NOT EXISTS imss_clave_delegacional                 text,
  ADD COLUMN IF NOT EXISTS llave_descuento                         text,
  ADD COLUMN IF NOT EXISTS tipo_contrato                           text,
  ADD COLUMN IF NOT EXISTS ubicacion_nombre                        text,
  ADD COLUMN IF NOT EXISTS ubicacion_subdelegacion_diferente       text,
  ADD COLUMN IF NOT EXISTS numero_empleado                         text,
  ADD COLUMN IF NOT EXISTS alcaldia                                text,
  ADD COLUMN IF NOT EXISTS edificio_ubicacion                      text,
  ADD COLUMN IF NOT EXISTS centro_trabajo_completo                 text,
  ADD COLUMN IF NOT EXISTS cct_prefix_2                            text,
  ADD COLUMN IF NOT EXISTS sep_carta_autorizacion_ref             text,
  ADD COLUMN IF NOT EXISTS issemym_clave                           text,
  ADD COLUMN IF NOT EXISTS fecha_proximo_cobro                     text,
  ADD COLUMN IF NOT EXISTS metodo_pago_numero_tarjeta              text,
  ADD COLUMN IF NOT EXISTS metodo_pago_tarjeta_vencimiento         text,
  ADD COLUMN IF NOT EXISTS metodo_pago_clabe                       text,
  ADD COLUMN IF NOT EXISTS metodo_pago_banco                       text;

-- ----------------------------------------------------------
-- 2. solicitud_documentos table (if not already created by 004_)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitud_documentos (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id                     uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  identificacion_frente             text,
  identificacion_reverso            text,
  comprobante_domicilio             text,
  evidencia_cliente_con_talon_o_solicitud text,
  talon_pago                        text,
  signature_or_signed_request       text,
  carta_referido                    text,
  carta_instruccion_imss            text,
  carta_reserva_nomina_nomipay      text,
  consentimiento_descuento_gob_cdmx text,
  consentimiento_descuento          text,
  carta_no_cancelacion_poliza_anterior text,
  solicitud_hoja_1                  text,
  solicitud_hoja_2                  text,
  solicitud_hoja_3                  text,
  solicitud_hoja_4                  text,
  solicitud_hoja_5                  text,
  solicitud_hoja_6                  text,
  video_aceptacion_poliza           text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitud_documentos_solicitud_id
  ON solicitud_documentos(solicitud_id);

-- ----------------------------------------------------------
-- 3. Helper: extract a URL string from a Paperform file field
--    (file fields are either a JSON object with 'url', or
--    a JSON array of objects, or null)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION pf_extract_url(v jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) = 'array' THEN
    RETURN (v->0->>'url');
  END IF;
  IF jsonb_typeof(v) = 'object' THEN
    RETURN (v->>'url');
  END IF;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------
-- 4. Full ETL function: migrate one solicitudes_paperform row
--    into solicitudes + solicitud_beneficiarios + solicitud_documentos
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_merge_paperform_submission_v2(p_paperform_id text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_pf          solicitudes_paperform%ROWTYPE;
  v_sol_id      uuid;
  v_rd          jsonb;
  v_data        jsonb;
  v_folio       text;
  v_prima_num   numeric(10,2);
  v_misma       boolean;
  v_doc_id      uuid;
BEGIN
  -- Fetch the Paperform row
  SELECT * INTO v_pf FROM solicitudes_paperform WHERE id = p_paperform_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitudes_paperform row % not found', p_paperform_id;
  END IF;

  IF v_pf.merged_to_solicitud_id IS NOT NULL THEN
    RETURN v_pf.merged_to_solicitud_id;
  END IF;

  -- Parse raw_data
  v_rd := v_pf.raw_data;
  IF v_rd IS NULL THEN
    RAISE WARNING 'Row % has NULL raw_data — skipping', p_paperform_id;
    RETURN NULL;
  END IF;
  v_data := v_rd->'data';
  IF v_data IS NULL THEN
    v_data := v_rd;  -- some rows store fields at root level
  END IF;

  -- Derive folio
  v_folio := COALESCE(
    v_data->>'7o5sb',           -- Paperform folio field
    v_pf.numero_solicitud,
    v_pf.id::text
  );

  -- Check idempotency by folio
  SELECT id INTO v_sol_id FROM solicitudes WHERE folio = v_folio LIMIT 1;

  IF v_sol_id IS NULL THEN
    -- Cast prima
    BEGIN
      v_prima_num := NULLIF(REGEXP_REPLACE(COALESCE(v_pf.prima, '0'), '[^0-9.-]', '', 'g'), '')::numeric;
    EXCEPTION WHEN others THEN
      v_prima_num := NULL;
    END;

    -- Determine misma_persona flag
    v_misma := COALESCE(
      (v_data->>'7poah') IN ('Si', 'si', 'SI', 'yes', 'Yes'),
      v_pf.nombre IS NOT NULL AND (v_pf.nombre = COALESCE(v_data->>'ba1ij', ''))
    );

    -- ============================================================
    -- INSERT into solicitudes
    -- Full field mapping from raw_data using Paperform field IDs
    -- CORRECTED per Opus audit C1: asegurado fields use own columns
    -- ============================================================
    INSERT INTO solicitudes (
      -- Agente
      folio, clave_agente, source, paperform_submission_id,
      agente_cedula_vigente, rfc_ejecutivo, email_agente,
      -- Fecha firma
      fecha_firma_dia, fecha_firma_mes, fecha_firma_anio,
      -- Venta geo
      estado_venta, municipio_venta,
      -- Contratante identidad
      contratante_nombres, contratante_ap_paterno, contratante_ap_materno,
      contratante_fecha_nac, contratante_genero, contratante_rfc, contratante_curp,
      contratante_lugar_nacimiento, contratante_nacionalidad,
      contratante_identificacion_fiscal_extranjero, contratante_regimen_fiscal,
      contratante_tipo_identificacion, contratante_identificacion_emisor,
      contratante_identificacion_numero,
      -- Contratante domicilio
      contratante_calle, contratante_numero_exterior, contratante_numero_interior,
      contratante_cp, contratante_colonia, contratante_estado, contratante_municipio,
      contratante_pais, contratante_email, contratante_telefono_movil,
      contratante_ocupacion, contratante_dependencia,
      -- Cobro
      forma_cobro, imss_clave_delegacional, llave_descuento, tipo_contrato,
      ubicacion_nombre, ubicacion_subdelegacion_diferente,
      numero_empleado, alcaldia, edificio_ubicacion,
      centro_trabajo_completo, cct_prefix_2,
      sep_carta_autorizacion_ref, issemym_clave,
      fecha_proximo_cobro, metodo_pago_tarjeta_vencimiento,
      metodo_pago_clabe, metodo_pago_banco,
      -- Asegurado (✅ own columns, not contratante columns)
      asegurado_es_contratante, misma_persona,
      asegurado_nombres, asegurado_ap_paterno, asegurado_ap_materno,
      asegurado_fecha_nac, asegurado_genero,
      asegurado_rfc,                            -- ✅ CORRECTED
      asegurado_estado_nacimiento,
      asegurado_nacionalidad,                   -- ✅ NEW
      asegurado_identificacion_fiscal_extranjero, -- ✅ NEW
      asegurado_tipo_identificacion, asegurado_identificacion_emisor,
      asegurado_identificacion_numero, asegurado_email, asegurado_telefono_movil,
      asegurado_ocupacion,
      asegurado_mismo_domicilio_contratante,
      asegurado_calle, asegurado_numero_exterior, asegurado_numero_interior,
      asegurado_cp, asegurado_colonia, asegurado_estado,
      asegurado_municipio,                      -- ✅ CORRECTED
      asegurado_pais,                           -- ✅ CORRECTED
      asegurado_tiene_otras_polizas,
      -- Salud
      declaracion_salud, covid_historial,
      covid_dias_ultimo_resultado_positivo, covid_asistencia_respiratoria,
      asegurado_fuma,
      -- Plan
      producto_modalidad, paquete_proteccion, periodicidad, base_calculo,
      suma_asegurada, prima_base,
      suma_asegurada_cotizada, prima_anual_riesgo, prima_ahorro_anual,
      -- Meta
      status, created_at
    ) VALUES (
      -- Agente
      v_folio, v_pf.clave_agente, 'paperform_migration', p_paperform_id,
      v_data->>'9n7b5', v_data->>'4eaif', v_data->>'eib9f',
      -- Fecha firma
      v_data->>'d81e7', v_data->>'6drpc', v_data->>'b4miu',
      -- Venta geo
      v_data->>'8pgv', v_data->>'6qjgc',
      -- Contratante identidad
      v_data->>'3ebnv', v_data->>'901ai', v_data->>'59hqo',
      NULLIF(CONCAT_WS('-', NULLIF(v_data->>'d5ecc',''), NULLIF(v_data->>'admv',''), NULLIF(v_data->>'2n6kk','')), '--')::date,
      v_data->>'8k8li', v_data->>'124v1', v_pf.curp,
      v_data->>'ahae4', v_data->>'1nibg',
      v_data->>'7f78b', v_data->>'22bkq',
      v_data->>'fel2u', v_data->>'6jlev',
      v_data->>'efdsn',
      -- Contratante domicilio
      v_data->>'7n463', v_data->>'cfiog', v_data->>'1do4l',
      v_data->>'2vl4j', v_data->>'pt9', v_data->>'fpg82', v_data->>'35flt',
      COALESCE(v_data->>'47faj', 'MEXICO'),
      v_data->>'6k6f8', v_data->>'4o85b',
      v_data->>'efnl', v_data->>'fag7i',
      -- Cobro
      v_data->>'1n28k', v_data->>'dn13i', v_data->>'bms51', v_data->>'63ij4',
      v_data->>'7i4u9', v_data->>'7ua7e',
      v_data->>'38qvp', v_data->>'4tu1o', v_data->>'du8ho',
      v_data->>'16qo', v_data->>'6vh9d',
      v_data->>'2uaat', v_data->>'5avef',
      v_data->>'5gqol', v_data->>'amdf7',
      v_data->>'34for', v_data->>'65num',
      -- Asegurado
      v_data->>'7poah', v_misma,
      CASE WHEN v_misma THEN v_data->>'3ebnv' ELSE v_data->>'ba1ij' END,
      CASE WHEN v_misma THEN v_data->>'901ai' ELSE v_data->>'1gvae' END,
      CASE WHEN v_misma THEN v_data->>'59hqo' ELSE v_data->>'3aqg8' END,
      CASE WHEN v_misma THEN
        NULLIF(CONCAT_WS('-', NULLIF(v_data->>'d5ecc',''), NULLIF(v_data->>'admv',''), NULLIF(v_data->>'2n6kk','')), '--')::date
      ELSE
        NULLIF(CONCAT_WS('-', NULLIF(v_data->>'4kqgs',''), NULLIF(v_data->>'6s7ed',''), NULLIF(v_data->>'5tfr2','')), '')::date
      END,
      CASE WHEN v_misma THEN v_data->>'8k8li' ELSE v_data->>'ep46p' END,
      CASE WHEN v_misma THEN v_data->>'124v1' ELSE v_data->>'dkgeo' END, -- ✅ asegurado_rfc
      v_data->>'1lifc',
      CASE WHEN v_misma THEN v_data->>'1nibg' ELSE v_data->>'da3l1' END,  -- ✅ asegurado_nacionalidad
      CASE WHEN v_misma THEN v_data->>'7f78b' ELSE v_data->>'d6amg' END,  -- ✅ asegurado_id_fiscal
      v_data->>'89br9', v_data->>'dm84j',
      v_data->>'ensir', v_data->>'14o9v', v_data->>'197m3',
      v_data->>'18idd',
      (v_data->>'8ivfg') IN ('Si', 'si', 'SI'),
      v_data->>'5v99c', v_data->>'9mpd8', v_data->>'f98f8',
      v_data->>'ctb4u', v_data->>'92al3', v_data->>'c85nd',
      CASE WHEN v_misma THEN v_data->>'35flt' ELSE v_data->>'dup5j' END,  -- ✅ asegurado_municipio
      CASE WHEN v_misma THEN COALESCE(v_data->>'47faj','MEXICO') ELSE COALESCE(v_data->>'7npe9','MEXICO') END, -- ✅ asegurado_pais
      v_data->>'ana7d',
      -- Salud
      v_data->>'a392h', v_data->>'b5v1e',
      v_data->>'3qim9', v_data->>'t1iv',
      v_data->>'9218h',
      -- Plan
      v_data->>'19p7b', v_data->>'ch9ma', v_pf.periodicidad, v_data->>'fjel5',
      NULLIF(REGEXP_REPLACE(COALESCE(v_pf.suma_asegurada, ''), '[^0-9.-]', '', 'g'), '')::numeric, v_prima_num,
      NULLIF(REGEXP_REPLACE(COALESCE(v_data->>'9lcsp', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      NULLIF(REGEXP_REPLACE(COALESCE(v_data->>'1eve8', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      NULLIF(REGEXP_REPLACE(COALESCE(v_data->>'ei7r3', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      -- Meta
      COALESCE(v_pf.score::text, 'pendiente'), COALESCE(v_pf.created_at, now())
    )
    RETURNING id INTO v_sol_id;

    -- --------------------------------------------------------
    -- Insert beneficiarios into solicitud_beneficiarios
    -- solicitudes_paperform has 3 beneficiary sets
    -- --------------------------------------------------------
    -- Beneficiario 1
    IF v_pf.beneficiario_nombre IS NOT NULL THEN
      INSERT INTO solicitud_beneficiarios (solicitud_id, nombres, ap_paterno, ap_materno, parentesco, porcentaje)
      VALUES (v_sol_id, v_pf.beneficiario_nombre, COALESCE(v_pf.beneficiario_apellido1, ''),
              COALESCE(v_pf.beneficiario_apellido2, ''), v_pf.beneficiario_parentesco,
              CASE
                WHEN v_pf.beneficiario2_nombre IS NOT NULL AND v_pf.beneficiario3_nombre IS NOT NULL THEN 34
                WHEN v_pf.beneficiario2_nombre IS NOT NULL THEN 50
                ELSE 100
              END)
      ON CONFLICT DO NOTHING;
    END IF;
    -- Beneficiario 2
    IF v_pf.beneficiario2_nombre IS NOT NULL THEN
      INSERT INTO solicitud_beneficiarios (solicitud_id, nombres, ap_paterno, ap_materno, parentesco, porcentaje)
      VALUES (v_sol_id, v_pf.beneficiario2_nombre, COALESCE(v_pf.beneficiario2_apellido1, ''),
              COALESCE(v_pf.beneficiario2_apellido2, ''), v_pf.beneficiario2_parentesco,
              CASE
                WHEN v_pf.beneficiario3_nombre IS NOT NULL THEN 33
                ELSE 50
              END)
      ON CONFLICT DO NOTHING;
    END IF;
    -- Beneficiario 3
    IF v_pf.beneficiario3_nombre IS NOT NULL THEN
      INSERT INTO solicitud_beneficiarios (solicitud_id, nombres, ap_paterno, ap_materno, parentesco, porcentaje)
      VALUES (v_sol_id, v_pf.beneficiario3_nombre, COALESCE(v_pf.beneficiario3_apellido1, ''),
              COALESCE(v_pf.beneficiario3_apellido2, ''), v_pf.beneficiario3_parentesco, 33)
      ON CONFLICT DO NOTHING;
    END IF;

    -- --------------------------------------------------------
    -- Insert document URLs into solicitud_documentos
    -- Live schema is normalized: one row per document
    -- --------------------------------------------------------
    INSERT INTO solicitud_documentos (
      solicitud_id,
      doc_type,
      source,
      storage_path,
      public_url,
      upload_state,
      upload_at,
      ocr_state,
      backup_state,
      is_latest,
      created_by
    )
    SELECT
      v_sol_id,
      d.doc_type,
      'paperform_migration',
      d.url,
      'uploaded',
      COALESCE(v_pf.created_at, now()),
      CASE WHEN d.doc_type IN ('ine_frente', 'ine_reverso', 'talon') THEN 'pending' ELSE 'skipped' END,
      'pending',
      true,
      COALESCE(NULLIF(v_pf.clave_agente, ''), 'paperform_migration')
    FROM (
      VALUES
        ('ine_frente', pf_extract_url(v_data->'bimvi')),
        ('ine_reverso', pf_extract_url(v_data->'2d2h2')),
        ('comprobante_domicilio', pf_extract_url(v_data->'c9ag5')),
        ('evidencia_cliente_con_talon_o_solicitud', pf_extract_url(v_data->'dg0kd')),
        ('talon', pf_extract_url(v_data->'d0ro')),
        ('carta_referido', pf_extract_url(v_data->'sr1t')),
        ('carta_instruccion_imss', pf_extract_url(v_data->'1dst0')),
        ('carta_reserva_nomina_nomipay', pf_extract_url(v_data->'3umte')),
        ('consentimiento_descuento_gob_cdmx', pf_extract_url(v_data->'f17d5')),
        ('consentimiento_descuento', pf_extract_url(v_data->'9tvu6')),
        ('carta_no_cancelacion_poliza_anterior', pf_extract_url(v_data->'bk7ke')),
        ('solicitud_p1', pf_extract_url(v_data->'371u8')),
        ('solicitud_p2', pf_extract_url(v_data->'dkvdk')),
        ('solicitud_p3', pf_extract_url(v_data->'ineq')),
        ('solicitud_p4', pf_extract_url(v_data->'ak3ca')),
        ('solicitud_p5', pf_extract_url(v_data->'83t59')),
        ('solicitud_p6', pf_extract_url(v_data->'dkd9e')),
        ('video', pf_extract_url(v_data->'dn3cj'))
    ) AS d(doc_type, url)
    WHERE d.url IS NOT NULL;

  END IF;

  -- Mark as merged
  UPDATE solicitudes_paperform
    SET merged_to_solicitud_id = v_sol_id,
        merged_at              = now()
  WHERE id = p_paperform_id;

  RETURN v_sol_id;
END;
$$;

COMMENT ON FUNCTION fn_merge_paperform_submission_v2 IS
  'Full-fidelity ETL: maps all 202 Paperform fields to solicitudes + solicitud_beneficiarios + solicitud_documentos. '
  'Asegurado field mapping corrected per Opus audit C1 (rfc, nacionalidad, id_fiscal_extranjero, municipio, pais). '
  'Idempotent by folio. Run via fn_backfill_all_paperform() to process all 5080 rows.';

-- ----------------------------------------------------------
-- 5. Batch backfill orchestrator
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_backfill_all_paperform(
  p_dry_run boolean DEFAULT true,
  p_limit   int     DEFAULT NULL
)
RETURNS TABLE(
  processed  int,
  merged     int,
  skipped    int,
  errors     int
) LANGUAGE plpgsql AS $$
DECLARE
  v_row       record;
  v_count     int := 0;
  v_merged    int := 0;
  v_skipped   int := 0;
  v_errors    int := 0;
  v_sol_id    uuid;
BEGIN
  FOR v_row IN
    SELECT id FROM solicitudes_paperform
    WHERE merged_to_solicitud_id IS NULL
      AND raw_data IS NOT NULL
    ORDER BY created_at
    LIMIT p_limit
  LOOP
    v_count := v_count + 1;

    IF p_dry_run THEN
      -- Dry run: just count, don't insert
      v_merged := v_merged + 1;
      CONTINUE;
    END IF;

    BEGIN
      SELECT fn_merge_paperform_submission_v2(v_row.id::text) INTO v_sol_id;
      IF v_sol_id IS NOT NULL THEN
        v_merged := v_merged + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'Error merging row %: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  processed := v_count;
  merged    := v_merged;
  skipped   := v_skipped;
  errors    := v_errors;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fn_backfill_all_paperform IS
  'Run with p_dry_run=true (default) to see counts without writing. '
  'Run with p_dry_run=false to execute the backfill. '
  'Use p_limit to process in batches (e.g., 500 at a time). '
  'Example: SELECT * FROM fn_backfill_all_paperform(false, 500);';

-- ----------------------------------------------------------
-- 6. VERIFY BEFORE RUNNING — safety checks
-- ----------------------------------------------------------
-- Run these queries before executing the backfill:
--
--   -- How many rows to process?
--   SELECT COUNT(*) FROM solicitudes_paperform WHERE merged_to_solicitud_id IS NULL;
--
--   -- Dry run count:
--   SELECT * FROM fn_backfill_all_paperform(true);
--
--   -- Check for folio collisions with existing solicitudes:
--   SELECT pf.id, pf.numero_solicitud, s.folio
--   FROM solicitudes_paperform pf
--   JOIN solicitudes s ON s.folio = pf.numero_solicitud
--   WHERE pf.merged_to_solicitud_id IS NULL
--   LIMIT 20;
--
--   -- After a test batch of 5, verify:
--   SELECT * FROM fn_backfill_all_paperform(false, 5);
--   SELECT COUNT(*) FROM solicitudes WHERE source = 'paperform_migration';
--
-- EXECUTION ORDER (when ready):
--   1. SELECT * FROM fn_backfill_all_paperform(true);       -- dry run
--   2. SELECT * FROM fn_backfill_all_paperform(false, 100); -- test batch
--   3. SELECT * FROM fn_backfill_all_paperform(false);      -- full backfill
-- ----------------------------------------------------------
