# VidaMás Domain Model — Canonical Reference

> **Phase 1 — Established 2026-03-14**

---

## The Three Essential Entities

Every VidaMás solicitud and derived póliza must explicitly model **three roles**:

| Role | TypeScript Type | Rule |
|---|---|---|
| **Contratante** | `Contratante` | Payer — exactly 1 per policy |
| **Asegurado** | `Asegurado` | Insured/applicant — exactly 1 per policy |
| **Beneficiarios** | `Beneficiario[]` | Death beneficiaries — 1 or more, must sum to 100% |

> **Important:** Contratante and Asegurado are often the same person (`misma_persona = true`), but they are always **distinct roles**. The form and database must never conflate them.

---

## Entity Lifecycle

```
Solicitud (intake)
  │
  ├── contratante fields (Step 2)
  ├── asegurado fields (Step 4, or derived from contratante)
  ├── beneficiarios (Step 6, normalized in solicitud_beneficiarios)
  └── cobro / plan fields
  │
  ▼
Emisión (GNP Portal)
  │
  └── Póliza created
       │
       ├── Reconciliation: compare poliza vs solicitud role-by-role
       │   (see reconciliation_checks table)
       │
       └── Recibos generated (one per billing period)
            │
            ├── Pendiente → Liquidado (collected)
            ├── Pendiente → Cancelado (grace period ~90-120 days exceeded)
            └── Cancelado → Replacement Pendiente (reinstatement ~270 day window)
```

---

## TypeScript API

### Entity Extractors (`lib/types.ts`)

```typescript
import {
  extractContratante,
  extractAsegurado,
  extractCobroInfo,
  extractPlanInfo,
} from '@/lib/types'

const contratante = extractContratante(formData)  // → Contratante
const asegurado   = extractAsegurado(formData)    // → Asegurado (handles misma_persona)
const cobro       = extractCobroInfo(formData)    // → CobroInfo
const plan        = extractPlanInfo(formData)     // → PlanInfo
```

### Validation (`lib/types.ts`)

```typescript
import {
  validateBeneficiarios,
  validateContratante,
  validateAsegurado,
  validateSolicitudEntities,
} from '@/lib/types'

// Full entity-presence validation (all three roles)
const result = validateSolicitudEntities(formData)
if (!result.valid) {
  // result.errors is string[] with human-readable messages
  throw new Error(result.errors.join('\n'))
}

// Beneficiary-specific
const benResult = validateBeneficiarios(formData.beneficiarios)
// Checks: at least 1, each porcentaje > 0, sum === 100%
```

---

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `solicitudes` | Flat intake record — contratante/asegurado/cobro/plan columns |
| `solicitud_beneficiarios` | Normalized beneficiarios (replaces JSONB blob) |
| `solicitud_documentos` | Per-document tracking: upload/OCR/backup state, versioning |
| `solicitud_status_history` | Append-only log of every status transition |
| `agentes` | Agent directory — canonical source for clave validation |
| `polizas` | GNP-emitted policy, linked to solicitud |
| `reconciliation_checks` | Row-by-row cross-check results after emission |
| `recibos` | Premium receipt history (lifecycle rows, NOT unique-by-date) |

### Migration Files (apply in order)

```
sql/001_solicitudes_normalized.sql   — adds solicitud_beneficiarios, back-fills from JSONB
sql/002_poliza_reconciliation.sql    — adds polizas + reconciliation_checks tables
sql/003_recibos_lifecycle.sql        — adds recibos lifecycle table + views
sql/004_solicitud_documentos.sql     — document tracking: upload/OCR/backup states
sql/005_solicitud_status_history.sql — append-only status audit log
sql/006_agentes_schema.sql           — agentes table formalization + indexes
sql/007_solicitudes_minor_gaps.sql   — minor column gaps: base_calculo, nombre_agente, week/year
```

### Key Constraints

- `solicitud_beneficiarios.porcentaje`: enforced by trigger to keep sum ≤ 100 per solicitud
- `(poliza_id, periodo_fecha)` in `recibos`: intentionally NOT unique — multiple rows represent history
- `recibos.generacion`: 1 = original, 2+ = replacement after reinstatement
- `recibos.replaced_recibo_id`: FK to the Cancelado row that was superseded

### Compatibility Path for Existing Code

The `beneficiarios` JSONB column on `solicitudes` is **preserved** in Phase 1.  
A compatibility view `v_solicitud_with_beneficiarios` re-aggregates the normalized rows  
back into a JSONB array with the same shape, so existing readers continue working.

Phase 2 work (future): migrate readers to join `solicitud_beneficiarios` directly, then drop the JSONB column.

---

## Recibos Lifecycle Rules

| Status | Meaning |
|---|---|
| `Pendiente` | Created, awaiting payment |
| `Liquidado` | Collected/paid |
| `Cancelado` | Grace period (~90-120 days) exceeded, not collected |

### Reinstatement (replacement recibos)

Within the reinstatement window (~270 days), a new `Pendiente` recibo may be created for the same period as an old `Cancelado` row. **Both rows are kept** — the Cancelado row is the audit trail.

Use `fn_create_replacement_recibo(cancelled_recibo_id, monto)` to do this correctly.

### Reporting Queries

- `v_recibos_current` — "most relevant" row per period (use for balance reports)
- `v_recibos_cobranza_resumen` — collection summary per policy (dashboard)
- `v_recibos_all_history` — full history including superseded rows (audit)

---

## Solicitud → Póliza Reconciliation

After emission, **always** call `fn_create_reconciliation_checks(poliza_id)` to populate the standard set of `reconciliation_checks` rows. The emisor bot then fills in `solicitud_value`, `poliza_value`, and sets `status` to `ok` or `discrepancy`.

Any row with `status = 'discrepancy'` must be addressed in **Paso 2** (SLA: 6 hours from emission).

Use `v_polizas_pending_reconciliation` for the daily Paso 2 queue.

---

## Document Tracking (solicitud_documentos)

Each uploaded file (INE front, INE back, talón, solicitud pages 1-6, video) gets a row in `solicitud_documentos`. The table tracks the full lifecycle independently:

| State type | Values |
|---|---|
| `upload_state` | `pending` → `uploaded` \| `failed` |
| `ocr_state` | `skipped` \| `pending` → `processing` → `done` \| `failed` |
| `backup_state` | `skipped` \| `pending` → `done` \| `failed` |

**Versioning:** Documents can be re-uploaded (e.g., agent replaces a blurry INE). All versions are preserved; `is_latest = true` marks the active version per `(solicitud_id, doc_type)`.

**Views:**
- `v_solicitud_documentos_latest` — one row per (solicitud_id, doc_type) for the active version
- `v_solicitud_doc_completeness` — rollup: docs uploaded/pending/failed, OCR done count per solicitud

---

## Status History (solicitud_status_history)

Every status change on a solicitud is recorded in `solicitud_status_history` as an immutable row. Use `fn_transition_solicitud_status()` to update status and log atomically:

```sql
SELECT fn_transition_solicitud_status(
  p_solicitud_id  => '<uuid>',
  p_to_status     => 'en_emision',
  p_actor_type    => 'emisor_bot',
  p_actor_id      => 'emisor_bot',
  p_source        => 'emisor_bot',
  p_reason        => 'Iniciando emisión en portal GNP'
);
```

**Canonical status flow:**
```
pendiente → en_revision → en_emision → emitida → completada
                                    ↘ rechazada → pendiente (re-open)
```

The `solicitudes.status` column holds the current state. The history table holds the audit trail. **Never update history rows — append only.**

---

## Agentes Table

The `agentes` table is the canonical agent directory. It is queried by `validateAgente()` in `actions.ts` before any solicitud can be submitted.

**Key columns:**
- `clave` — unique identifier, used in folio generation and all cross-system references
- `status` — `active | inactive | suspended` (only `active` agents can submit)
- `banda_comision` — commission band (points to future `bandas_comisiones` table)
- `gerencia`, `oficina` — org hierarchy

**Do not duplicate clave logic.** Always validate against this table.

---

## Development Notes

- `misma_persona = true` is the common case (contratante IS the asegurado). The form short-circuits Steps 4 when this is set. The `extractAsegurado()` helper correctly derives asegurado fields from contratante in this case.
- Never call `submitSolicitud()` without running `validateSolicitudEntities()` first.
- Beneficiary `id` fields in the TypeScript type are client-side UUIDs (for React key props). They are not stored in the database — the `solicitud_beneficiarios` table assigns its own UUIDs.
