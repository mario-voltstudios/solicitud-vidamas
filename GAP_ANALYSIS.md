# VidaMás — Airtable + Paperform vs Supabase Gap Analysis

> **Date:** 2026-03-15  
> **Author:** Jarvis (sub-agent)  
> **Scope:** Solicitud VidaMás intake (Paperform + Next.js wizard), Airtable legacy, Supabase schema

---

## Executive Summary

The Supabase schema covers the **core solicitud→póliza→recibos lifecycle** well. The biggest gaps are: (1) Paperform submissions live in a separate `solicitudes_paperform` table with no sync to the canonical `solicitudes` table, (2) Airtable receives only a thin summary (6 fields) losing most data, (3) document/file metadata has no Supabase table, (4) several Airtable operational tables (estados de cuenta, charging system, prestamos, canceladas, comisiones) have no Supabase equivalent, and (5) the `agentes` table is referenced but its schema is undocumented.

---

## 1. Data Flow Map

```
Paperform (xqui5ohw)                Next.js Wizard (solicitud-vidamas)
  │ (separate pipeline)                │
  ▼                                    ▼
solicitudes_paperform (Supabase)    solicitudes (Supabase)
  │                                    ├── solicitud_beneficiarios
  │ NO SYNC ❌                         ├── → polizas
  │                                    ├──── reconciliation_checks
  │                                    └──── recibos
  │
  └── v_produccion_semanal (view combines both sources)

Next.js Wizard also fire-and-forgets to:
  ├── Airtable (tblQx1hUA3JoDgcH0) — 6 summary fields only
  ├── Google Sheets (backup row)
  └── Google Drive (document files)
```

---

## 2. Field-by-Field Matrix

### A. Already Covered ✅

| Domain | Fields | Where |
|--------|--------|-------|
| Contratante identity | nombres, ap_paterno, ap_materno, fecha_nac, genero, rfc, curp | `solicitudes` table |
| Contratante ID | tipo_id, num_id | `solicitudes` table |
| Contratante contact | email, telefono | `solicitudes` table |
| Contratante address | calle, num_ext, num_int, cp, colonia, estado, municipio | `solicitudes` table |
| Contratante work | ocupacion, dependencia | `solicitudes` table |
| Asegurado identity | nombres, ap_paterno, ap_materno, fecha_nac, genero, rfc, misma_persona | `solicitudes` table |
| Cobro info | forma_cobro, clave_delegacional, matricula, sub_dependencia, folio_contrato, clabe, banco, fecha_inicio_cobro | `solicitudes` table |
| Plan | plan, periodicidad, prima_base, prima_adicional, suma_asegurada | `solicitudes` table |
| Beneficiarios | nombres, ap_paterno, ap_materno, fecha_nac, parentesco, porcentaje | `solicitud_beneficiarios` table |
| Póliza core | num_poliza, num_certificado, fecha_emision, vigencia, status, GNP mirror fields | `polizas` table |
| Paso 2/2.5 tracking | paso2_completado, paso2_fecha, paso25_verificado | `polizas` table |
| Reconciliation | category/field/status per check item | `reconciliation_checks` table |
| Recibos lifecycle | periodo, monto, status, replacement lineage, generacion | `recibos` table |
| Agent validation | clave lookup against `agentes` table | `actions.ts` |
| Folio generation | `{clave}-{year}-S{week}-{increment}` | `actions.ts` |
| Firma | firma_base64, fecha_firma | `solicitudes` payload |
| ASTRO views | Paso 2 queue, cobranza dashboard | `astro_paso2_queue`, `astro_cobranza_dashboard` |

### B. Partially Covered ⚠️

| Gap | Detail | Risk |
|-----|--------|------|
| **Paperform ↔ solicitudes sync** | `solicitudes_paperform` is a separate table with different column names (e.g., `prima` as text). `v_produccion_semanal` bridges them for reporting, but there's no canonical record merge. | **HIGH** — Two sources of truth for the same solicitudes. Can't reconcile a Paperform submission with a póliza through the standard `polizas.solicitud_id → solicitudes.id` FK. |
| **Airtable write is summary-only** | Only 6 fields written: Clave Agente, Status, Nombre Asegurado (actually contratante name!), Forma Cobro, Dependencia, NOTAS. Airtable `POLIZAS` table (`tblQx1hUA3JoDgcH0`) is used but field mapping is thin. | **MEDIUM** — If Stacker/ASTRO relies on Airtable fields beyond these 6, data is missing. But Airtable is intended as legacy/backup, so acceptable if Supabase is canonical. |
| **`base_calculo` column** | Exists in TypeScript `FormData` (`'prima'` default), written to the form, but NOT in the SQL migration columns for `solicitudes`. | **LOW** — Missing column, easy to add. |
| **semana_id / week_number / year on solicitudes** | In `FormData` as `semana_id?`, `week_number?`, `year?` but not in the `submitSolicitud` payload or SQL columns. Folio encodes the week, but no explicit FK to `semanas` table. | **LOW** — Folio is parseable, but explicit FK would improve queries. |
| **Agente name on solicitudes** | `nombre_agente` is in FormData but not in the insert payload — only `clave_agente` is persisted. | **LOW** — Can join to `agentes` table, but denormalized name is convenient for views. |

### C. Still Missing / Risky ❌

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| 1 | **No `solicitud_documentos` table** | Documents (INE front/back, talón, solicitud pages 1-6, video) are stored as Supabase Storage paths in `docs_*` fields on the solicitudes payload, but there's no dedicated table tracking document type, upload status, storage path, file size, OCR status, or Drive backup status. Google Drive backup is fire-and-forget with no receipt. | **P1** |
| 2 | **Paperform → solicitudes unification** | `solicitudes_paperform` and `solicitudes` are parallel tables. No ETL/sync maps Paperform submissions into the canonical `solicitudes` schema. Paperform field `7o5sb` maps to folio, but other field IDs are unmapped. | **P1** |
| 3 | **Airtable operational tables not in Supabase** | 11 Airtable tables documented in `phase2-schema-exploration.md` — Recibos Prospera, Estados de Cuenta, Prestamos, Canceladas, Transferencias Agentes, Descomisiones, Metas, Metas Gerencia, Meta Semanas, Bandas Comisiones, Charging System — have NO Supabase equivalents except partial overlap with `recibos` and `metas_agente_semanal`. | **P2** |
| 4 | **`agentes` table schema undocumented** | Code references `agentes` table (clave, nombre_completo, nombre_corto, status) but no SQL migration defines it. Unclear if it has: gerencia, oficina, comision_band, fecha_ingreso, contact info. | **P2** |
| 5 | **No `solicitud_status_history` / audit trail** | `solicitudes.status` is a single field (`pendiente`). No history of status transitions (pendiente → en_emision → emitida → rechazada). The `polizas` table has its own status but no link back for pre-emission rejections or corrections. | **P2** |
| 6 | **Asegurado CURP/address missing** | `Asegurado` TypeScript type only has: nombres, ap_paterno, ap_materno, fecha_nac, genero, rfc, misma_persona. No CURP, no address, no email/phone for the asegurado when `misma_persona=false`. GNP may require these. | **P2** |
| 7 | **No cancelaciones/reinstalaciones table** | Airtable `Canceladas` table tracks policy cancellations with reasons, process types (PRODUCCION NUEVA, ANULACION), and agent info. Supabase `polizas.status` can be `cancelada` but there's no structured cancellation reason, date, or reinstatement tracking beyond recibos lineage. | **P2** |
| 8 | **Comisiones schema absent** | Airtable has Bandas Comisiones, Descomisiones, Transferencias Agentes. No Supabase tables for commission bands, agent commission calculations, decommissions, or agent payment transfers. | **P3** |
| 9 | **Estados de Cuenta / agent financial statements** | Complex Airtable table with period-based financial summaries per agent. No Supabase equivalent. | **P3** |
| 10 | **Charging System (payment processing)** | Airtable tracks Stripe/custom payment transactions. No Supabase table. If payment processing moves to Supabase, this needs migration. | **P3** |
| 11 | **`backup_airtable_polizas` schema undocumented** | Referenced in `v_produccion_semanal` view but no migration defines it. Has fields like `clave_agente`, `fecha_emitido`, `prima_mensual_riesgo`, `semana_emision`. | **P3** |
| 12 | **Airtable field ID → name mapping incomplete** | `phase2-schema-exploration.md` documents field IDs (fldXXXXXX) but NOT their human-readable names from Airtable. Any future migration will need this mapping. | **P3** |

---

## 3. Recommended Next-Schema / Next-Sync Plan

### Phase 2A — Immediate (P1, this sprint)

1. **Create `solicitud_documentos` table**
   ```sql
   CREATE TABLE solicitud_documentos (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     solicitud_id    uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
     doc_type        text NOT NULL,  -- 'ine_frente','ine_reverso','talon','solicitud_p1'...'video'
     storage_path    text NOT NULL,  -- Supabase Storage path
     storage_bucket  text NOT NULL DEFAULT 'solicitud-docs',
     file_size_bytes bigint,
     mime_type       text,
     ocr_status      text DEFAULT 'pending',  -- 'pending','completed','failed','skipped'
     ocr_data        jsonb,
     drive_backup_id text,           -- Google Drive file ID if backed up
     drive_backup_at timestamptz,
     created_at      timestamptz NOT NULL DEFAULT now()
   );
   ```

2. **Unify Paperform → solicitudes**
   - Option A: ETL script that maps `solicitudes_paperform` rows into `solicitudes` format (one-time backfill + ongoing sync)
   - Option B: Create a mapping view that presents `solicitudes_paperform` in the `solicitudes` shape
   - **Recommended:** Option A — backfill historical, then modify Paperform webhook to write directly to `solicitudes` going forward

3. **Add missing columns to `solicitudes`**
   ```sql
   ALTER TABLE solicitudes
     ADD COLUMN IF NOT EXISTS base_calculo text DEFAULT 'prima',
     ADD COLUMN IF NOT EXISTS semana_id int REFERENCES semanas(id),
     ADD COLUMN IF NOT EXISTS nombre_agente text;
   ```

### Phase 2B — Near-term (P2, next 2 weeks)

4. **Define `agentes` table migration** — document and version-control the existing table schema
5. **Add `solicitud_status_log`** — append-only status transition history
6. **Expand Asegurado fields** — add CURP, address, email, phone for non-misma_persona cases
7. **Create `cancelaciones` table** — structured cancellation reasons linked to `polizas`

### Phase 2C — Operational migration (P3, next month)

8. **Commission tables** — `bandas_comisiones`, `comisiones_agente`, `descomisiones`
9. **Agent financial statements** — `estados_cuenta_agente`
10. **Payment processing** — `cobros_transacciones` (if moving from Stripe/Airtable)
11. **Document `backup_airtable_polizas`** and decide: keep as legacy read-only, or migrate into `polizas`

---

## 4. Airtable → Supabase Overlap Summary

| Airtable Table | Supabase Equivalent | Status |
|----------------|---------------------|--------|
| POLIZAS (tblQx1hUA3JoDgcH0) | `polizas` + `solicitudes` | Partial — Airtable gets 6 summary fields, Supabase is canonical |
| Agentes (tblCzyD81OuIkHEep) | `agentes` | Exists but undocumented |
| Recibos Prospera | `recibos` | Overlaps — Airtable is legacy, Supabase is canonical |
| backup_airtable_polizas | `backup_airtable_polizas` | Legacy read-only in Supabase |
| solicitudes_paperform | `solicitudes_paperform` | Parallel table, NOT unified |
| Estados de Cuenta | ❌ None | |
| Prestamos | ❌ None | |
| Canceladas | ❌ None (partial via polizas.status) | |
| Transferencias Agentes | ❌ None | |
| Descomisiones | ❌ None | |
| Metas | `metas_agente_semanal` | Partial |
| Metas Gerencia | ❌ None | |
| Meta Semanas | `semanas` | Partial |
| Bandas Comisiones | ❌ None | |
| Charging System | ❌ None | |

---

## 5. Key Risk: Dual Source of Truth

The most dangerous architectural issue is `solicitudes_paperform` vs `solicitudes`. Right now:

- **Paperform** submissions go to `solicitudes_paperform` (via webhook or API sync)
- **Next.js wizard** submissions go to `solicitudes` (via `submitSolicitud()`)
- **`v_produccion_semanal`** unions both for reporting, but prefers Paperform
- **`polizas.solicitud_id`** only references `solicitudes` — Paperform submissions can't have polizas linked

This means a solicitud that came through Paperform **cannot go through the standard emission → reconciliation → recibos pipeline** without first being copied into `solicitudes`. This is the #1 gap to close.
