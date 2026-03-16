# VidaMás — Migration Plan & Clarifying Questions

> **Date:** 2026-03-15 | **Author:** Jarvis (sub-agent)  
> **Input:** GAP_ANALYSIS.md, vidamas-archaeology-2026-03-15.md, SQL migrations 001–003

---

## 1. Current Supabase Architecture (what's already solid)

The existing 3 migrations give us a clean **solicitud → póliza → recibos** lifecycle:

| Table | Status |
|-------|--------|
| `solicitudes` (full contratante/asegurado/cobro/plan columns) | ✅ Good |
| `solicitud_beneficiarios` (normalized from JSONB) | ✅ Good |
| `polizas` (GNP mirror + paso2/paso2.5 tracking) | ✅ Good |
| `reconciliation_checks` (post-emission field-by-field audit) | ✅ Good |
| `recibos` (lifecycle history with replacement lineage) | ✅ Good |
| Views: `v_produccion_semanal`, `v_polizas_pending_reconciliation`, `v_recibos_current`, `v_recibos_cobranza_resumen` | ✅ Good |

**This core is sound. Don't touch it.**

---

## 2. Migration Triage

### 🟢 MIGRATE NOW (no-regret)

These add obvious value, have no ambiguity, and don't depend on Mario's answers.

#### M1. `solicitud_documentos` table
```sql
CREATE TABLE solicitud_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,  -- 'ine_frente','ine_reverso','talon','solicitud_p1'...'p6','video'
  storage_path    text NOT NULL,
  storage_bucket  text NOT NULL DEFAULT 'solicitud-docs',
  file_size_bytes bigint,
  mime_type       text,
  upload_status   text NOT NULL DEFAULT 'uploaded' CHECK (upload_status IN ('uploading','uploaded','failed')),
  drive_backup_id text,
  drive_backup_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```
**Why now:** Documents are currently fire-and-forget paths with no tracking. Every solicitud generates 5-10 docs. No ambiguity.

#### M2. `solicitud_status_log` (append-only transition history)
```sql
CREATE TABLE solicitud_status_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id  uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  old_status    text,
  new_status    text NOT NULL,
  changed_by    text,          -- 'system', 'jarvis', user email, agent clave
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```
**Why now:** Zero cost to add, enables all future status-based analytics. Currently there's a single `status` field with no history.

#### M3. Missing columns on `solicitudes`
```sql
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS base_calculo    text DEFAULT 'prima',
  ADD COLUMN IF NOT EXISTS semana_id       int,
  ADD COLUMN IF NOT EXISTS nombre_agente   text,
  ADD COLUMN IF NOT EXISTS asegurado_curp  text,
  ADD COLUMN IF NOT EXISTS asegurado_email text,
  ADD COLUMN IF NOT EXISTS asegurado_telefono text,
  ADD COLUMN IF NOT EXISTS asegurado_calle text,
  ADD COLUMN IF NOT EXISTS asegurado_num_ext text,
  ADD COLUMN IF NOT EXISTS asegurado_num_int text,
  ADD COLUMN IF NOT EXISTS asegurado_cp    text,
  ADD COLUMN IF NOT EXISTS asegurado_colonia text,
  ADD COLUMN IF NOT EXISTS asegurado_estado text,
  ADD COLUMN IF NOT EXISTS asegurado_municipio text;
```
**Why now:** TypeScript `FormData` already has `base_calculo`. Asegurado address/CURP needed when `misma_persona = false`. GNP requires them.

#### M4. `cancelaciones` table
```sql
CREATE TABLE cancelaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id       uuid NOT NULL REFERENCES polizas(id),
  tipo            text NOT NULL,  -- 'cancelacion','anulacion','reinstalacion'
  motivo          text,
  fecha_efectiva  date,
  solicitado_por  text,           -- 'agente','contratante','gnp','sistema'
  proceso         text,           -- 'produccion_nueva','anulacion' (matches Airtable)
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```
**Why now:** Airtable `Canceladas` has real data. `polizas.status = 'cancelada'` alone loses the why/when/who.

---

### 🟡 MIGRATE BUT NORMALIZE FIRST (need minimal schema, not Airtable clone)

These Airtable tables carry real business data but are over-structured or denormalized in Airtable. Proposed clean schemas below — but need Mario's answers on usage first.

#### M5. `agentes` table (document what exists + fill gaps)

The table exists in Supabase but has no migration. Proposed canonical schema:

```sql
CREATE TABLE IF NOT EXISTS agentes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave             text UNIQUE NOT NULL,      -- '5156'
  nombre_completo   text NOT NULL,
  nombre_corto      text,
  status            text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','inactivo','baja')),
  gerencia          text,                      -- org unit
  oficina           text,
  fecha_ingreso     date,
  telefono          text,
  email             text,
  rfc               text,
  curp              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```
**Blocked on:** Q1 below (what fields does the existing `agentes` table actually have?)

#### M6. `metas` (agent production goals)

Airtable has 3 tables: Metas, Metas Gerencia, Meta Semanas. Supabase has `metas_agente_semanal` + `semanas`. Propose consolidating:

```sql
-- semanas already exists. Just ensure:
-- metas_agente_semanal covers: agente_clave, semana_id, meta_polizas, meta_prima, logrado_polizas, logrado_prima

-- Add gerencia-level rollup as a VIEW, not a table:
CREATE OR REPLACE VIEW v_metas_gerencia AS
SELECT
  a.gerencia,
  m.semana_id,
  SUM(m.meta_polizas)    AS meta_polizas,
  SUM(m.logrado_polizas) AS logrado_polizas,
  SUM(m.meta_prima)      AS meta_prima,
  SUM(m.logrado_prima)   AS logrado_prima
FROM metas_agente_semanal m
JOIN agentes a ON a.clave = m.agente_clave
GROUP BY a.gerencia, m.semana_id;
```
**Why view not table:** Gerencia metas are just rollups. Don't store what you can compute.

#### M7. `comisiones` (commission bands + agent payments)

Airtable has: Bandas Comisiones, Descomisiones, Transferencias Agentes. Proposed normalized version:

```sql
CREATE TABLE bandas_comisiones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,            -- 'Banda A', 'Banda B' etc.
  rango_min   int NOT NULL,             -- min policies in period
  rango_max   int,                      -- max (null = unlimited)
  porcentaje  numeric(5,2) NOT NULL,    -- commission %
  vigencia_desde date NOT NULL,
  vigencia_hasta date,                  -- null = current
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comisiones_agente (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_clave    text NOT NULL,
  periodo         text NOT NULL,        -- '2026-S08', '2026-02', etc.
  banda_id        uuid REFERENCES bandas_comisiones(id),
  polizas_count   int NOT NULL DEFAULT 0,
  prima_total     numeric(12,2) NOT NULL DEFAULT 0,
  comision_monto  numeric(12,2) NOT NULL DEFAULT 0,
  status          text DEFAULT 'calculada' CHECK (status IN ('calculada','pagada','retenida')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
```
**Blocked on:** Q3 (how are bands calculated? weekly/monthly? who sets them?)

---

### 🔴 DO NOT MIGRATE LITERALLY (recompute/derive instead)

| Airtable Table | Why NOT to clone | What to do instead |
|---|---|---|
| **Estados de Cuenta** | These are period-end financial statements built from recibos + comisiones + prestamos. They are **derived output**, not source data. | **Generate from queries.** Once recibos + comisiones exist in Supabase, build `v_estado_cuenta_agente` as a view or materialized view. |
| **Charging System** | Payment transaction log (Stripe?). Should not be replicated — Stripe is the source of truth. | **Keep in Stripe/payment processor.** If needed, sync settlement status to `comisiones_agente.status`. |
| **Metas Gerencia** | Rollup of individual agent metas by gerencia. Pure aggregation. | **View** `v_metas_gerencia` (see M6 above). |
| **Meta Semanas** | Already have `semanas` table. | **Already exists.** Verify schema parity, backfill if needed. |
| **`backup_airtable_polizas`** | Legacy read-only snapshot from Airtable. Used in `v_produccion_semanal` for historical data. | **Keep as-is** (read-only). Don't add to it. Eventually the view should only need `solicitudes` + `polizas`. |
| **`solicitudes_paperform`** | Parallel table that should NOT continue as a separate entity. | **ETL into `solicitudes`** (one-time backfill), then point Paperform webhook to write to `solicitudes` directly. Archive original table. |

---

## 3. Paperform Unification Strategy

This is the **#1 architectural fix**. Current state: two separate tables, no FK between Paperform submissions and pólizas.

**Plan:**
1. Map all Paperform field IDs → `solicitudes` columns (field mapping exists in `paperform-field-mapping.md`)
2. Write ETL script: `solicitudes_paperform` → `solicitudes` (backfill ~5,000 rows)
3. Set `solicitudes.source = 'paperform'` vs `'wizard'` to track origin
4. Modify Paperform webhook to write directly to `solicitudes` going forward
5. Keep `solicitudes_paperform` as read-only archive
6. Update `v_produccion_semanal` to only read from `solicitudes`

**Requires:** `ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS source text DEFAULT 'wizard';`

---

## 4. Clarifying Questions for Mario

### Q1 — `agentes` table: what's actually in it?
> The code references `agentes` with fields `clave, nombre_completo, nombre_corto, status`. Is that all that exists in Supabase today? Does the Airtable `Agentes` table have additional fields we need (gerencia, oficina, fecha_ingreso, RFC, CURP, commission band, contact info)?  
> **Why it matters:** Every operational table joins on agente. If we're missing gerencia/oficina, we can't build metas rollups or org-level reports.

### Q2 — Préstamos: what are these?
> Airtable has a `Prestamos` table. Are these loans/advances to agents against future commissions? What's the lifecycle — request → approved → disbursed → deducted from estados de cuenta? How active is this?  
> **Why it matters:** If préstamos are deducted from commission payments, we need to model them. If it's a dead feature, skip it.

### Q3 — Commission bands: how do they work?
> Airtable has `Bandas Comisiones`. Is this: (a) a fixed lookup table (X policies = Y% commission), or (b) does it change per period/gerencia? Who sets the bands — Mario manually, or GNP? Are Descomisiones (decommissions) penalties that reduce commission, or agent termination records?  
> **Why it matters:** Determines whether we need a simple lookup table or a full commission calculation engine.

### Q4 — Transferencias Agentes: what's being transferred?
> Is this transferring a policy's ownership from one agent to another? Or transferring money between agents? Or moving agents between gerencias?  
> **Why it matters:** Each scenario needs a completely different schema.

### Q5 — Charging System: is this Stripe or custom?
> What payment processor does the "Charging System" Airtable table track? Is it Stripe, Conekta, bank transfers, or internal accounting? Is it charging agents (for kit/materials) or charging contratantes (premium collection)?  
> **Why it matters:** If it's a payment gateway, we don't clone it — we read from the gateway. If it's internal accounting, we model it.

### Q6 — Estados de Cuenta: who consumes them?
> Are estados de cuenta generated for agents (showing their commission statement), or for GNP (showing collection status)? How often — weekly, monthly? Is someone manually building these in Airtable today, or is it automated?  
> **Why it matters:** If they're agent-facing commission statements, they're a computed report from recibos + comisiones. If they're something else, we need to understand the source data.

### Q7 — Paperform: kill or keep?
> The Next.js wizard covers all Paperform fields plus adds OCR, offline mode, and validation. Is the plan to (a) sunset Paperform once the wizard is deployed, or (b) keep both running? If keep both, for how long?  
> **Why it matters:** If sunsetting, we do a one-time ETL and move on. If keeping both, we need a real-time sync pipeline — much more work.

---

## 5. Recommended Implementation Workstreams

Run these as Sonnet sub-agents in parallel where possible.

| # | Workstream | Depends on | Estimated effort |
|---|-----------|------------|-----------------|
| **W1** | SQL migration 004: `solicitud_documentos` + `solicitud_status_log` + missing columns on `solicitudes` + `cancelaciones` | Nothing — run now | 1 hour |
| **W2** | SQL migration 005: `agentes` schema formalization | Q1 answer | 30 min |
| **W3** | Paperform → solicitudes ETL script + `source` column | Q7 answer (but ETL is no-regret either way) | 2-3 hours |
| **W4** | Commission tables (`bandas_comisiones`, `comisiones_agente`) | Q3 answer | 1-2 hours |
| **W5** | `v_estado_cuenta_agente` materialized view | W4 + Q6 answer | 1 hour |
| **W6** | Préstamos table (if confirmed active) | Q2 answer | 30 min |
| **W7** | Transferencias table (once meaning clarified) | Q4 answer | 30 min |

### Immediate next action (no blockers):
**Spawn W1 now** — the 4 no-regret tables/columns. Then spawn W3 (Paperform ETL) since it's valuable regardless of whether Paperform is sunset or not.

---

## 6. What NOT to Build

| Temptation | Why not |
|---|---|
| Clone all 11 Airtable tables as-is | Half are derived data. You'd be maintaining two systems. |
| Build a real-time Airtable↔Supabase sync | Airtable is being sunset. One-time ETL + archive. |
| Migrate Charging System | Payment processors are source of truth. Don't clone transaction logs. |
| Store `edad` or `antiguedad` fields | Calculate from `fecha_nac` / `fecha_ingreso` at query time. |
| Store `nombre_completo` on solicitudes | Compute from `nombres + ap_paterno + ap_materno`. Keep the parts. |
| Store gerencia-level metas | View over agent-level metas. |
