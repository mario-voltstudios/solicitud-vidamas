# New Digital Solicitud VidaMás — Product Spec
**Version:** 1.0  
**Date:** 2026-03-15  
**Author:** Jarvis (sub-agent)  
**Replaces:** vidamas.paperform.co (form ID: xqui5ohw)  
**Repo:** `solicitud-vidamas` (reuse — see §9)

---

## 0. Executive Summary

The current Paperform intake is a 14-section, ~60-field linear form that blocks submission if any document is missing and creates a parallel `solicitudes_paperform` table disconnected from the canonical emission pipeline. This spec replaces it with a **5-step progressive wizard** that:

1. **OCR-extracts** ~70% of fields from 2 uploaded documents (INE + talón de pago), asking the agent to type as little as possible.
2. **Detects dependencia** from the talón and shows only the additional docs required for that dependencia.
3. **Never blocks submission** — missing documents route into a `pending_docs` exception flow rather than hard-blocking the agent.
4. **Works on 2G / weak internet** — each step is independently saveable, uploads are chunked with resume.
5. **Writes directly to the canonical `solicitudes` table** — no more parallel Paperform table.

---

## 1. Product Principles

| Principle | Implementation |
|-----------|---------------|
| **Minimal typing** | OCR pre-fills from INE + talón; agent confirms, not re-enters |
| **Mobile-first, weak-internet tolerant** | Progressive steps saved to localStorage draft; background upload with retry; compresses images before upload |
| **Never block** | Every document upload is optional at submit time; system flags exceptions, not agents |
| **Dependencia-aware** | Talón upload triggers dependencia detection → conditional doc list shown |
| **Single source of truth** | Writes to `solicitudes` table directly; no Paperform intermediary |
| **Auditable** | Every step transition logged with timestamp; `solicitud_status_log` records lifecycle |

---

## 2. Roles & Entities (from Domain Model)

The form must always capture three distinct roles:

| Role | Always present | Key constraint |
|------|----------------|----------------|
| **Contratante** | Yes | Payer — exactly 1 |
| **Asegurado** | Yes (may equal Contratante) | Insured — exactly 1; `misma_persona=true` short-circuits Step 4 |
| **Beneficiarios** | Yes | 1–5; porcentajes must sum to 100% |

---

## 3. Information Architecture: Essential vs. Derivable

### 3.1 Truly Essential (agent must enter or confirm)

| Category | Fields | Source |
|----------|--------|--------|
| Agent | clave_agente, cedula_vigente | Typed |
| Signature date | fecha_firma, estado_firma | Typed |
| Contratante identity | nombres, ap_paterno, ap_materno, fecha_nac, genero, rfc | **Derived from INE OCR** → agent confirms |
| Contratante CURP | curp | **Derived from INE** |
| Contratante contact | email, telefono | Typed (not on INE) |
| Contratante address | calle, num_ext, num_int, cp, colonia, municipio, estado | **Derived from comprobante domicilio OCR** if uploaded; else typed |
| Cobro method | forma_cobro (nomina / CLABE / tarjeta) | Typed |
| Nomina fields | clave_delegacional, matricula, sub_dependencia, folio_contrato | **Derived from talón OCR** → confirm |
| Dependencia | dependencia | **Derived from talón** |
| Plan | plan, periodicidad, prima_base, suma_asegurada | Typed |
| Beneficiarios | nombres, parentesco, porcentaje, fecha_nac | Typed (no reliable doc source) |

### 3.2 Derivable / Auto-populated (never ask agent to type)

| Field | Derived from |
|-------|-------------|
| folio | System-generated (`{clave}-{year}-S{week}-{increment}`) |
| folio_ejecutivo | `"P" + clave_agente` |
| rfc_ejecutivo | If cedula_vigente=Si → agent RFC; else Mario's RFC (PUFM861020CR7) |
| gerente_comercial | Always "Prospera" (hardcoded) |
| nexos_delincuencia | Always "No" (safety-net hidden field) |
| fecha_llenado | Timestamp of final submission |
| regimen_fiscal | Default 605 (Sueldos y Salarios) — editable |
| nacionalidad | Default "Mexicana" — editable |
| pais | Default "México" — editable |
| edad | Computed from fecha_nac |
| base_calculo | Default "prima" — editable |
| contratante_entidad_nac | Derivable from CURP (positions 12-13) |

---

## 4. Screen-by-Screen Flow

### Overview

```
[S0] Pre-flight / Resume draft
        ↓
[S1] Agent + Signature Info          (~2 fields typed)
        ↓
[S2] Document Upload + OCR           (INE frente/reverso, talón de pago)
        ↓ dependencia detected from talón
[S3] Contratante Confirmation        (OCR pre-filled, agent confirms/corrects)
        ↓
[S3b] Asegurado (if misma_persona=No)
        ↓
[S4] Cobro + Plan
        ↓
[S5] Beneficiarios
        ↓
[S6] Additional Docs (conditional on dependencia)
        ↓
[S7] Review + Sign + Submit
        ↓
[CONFIRM] Folio displayed, pending docs flagged
```

---

### S0 — Pre-flight / Resume

**Purpose:** Check for existing draft; handle weak-internet awareness.

**Logic:**
- Check `localStorage` for draft keyed by `clave_agente` + current week.
- If draft found: show "Retomar solicitud en progreso" (name, % complete).
- Show network indicator: if `navigator.onLine` is false or RTT > 3s → show "Modo fuera de línea — los cambios se guardarán localmente".
- Offline mode: all OCR deferred to when connection resumes (images stored as base64 in IndexedDB).

---

### S1 — Agent + Signature Info

**Fields asked:**

| Field | Type | Notes |
|-------|------|-------|
| clave_agente | text | Validated against `agentes` table on blur |
| cedula_vigente | toggle Si/No | Determines whose RFC fills rfc_ejecutivo |
| fecha_firma | date picker | DD/MM/YYYY; defaults to today |
| estado_firma | select | Estado de la república; 32 options |

**Auto-derived:**
- `folio_ejecutivo` = "P" + clave_agente (shown read-only)
- `rfc_ejecutivo` = agent RFC if cedula=Si, else PUFM861020CR7 (shown read-only)
- `gerente_comercial` = "Prospera" (hidden)

**Validation:** Agent clave must exist and be active in `agentes`. No continue if clave not found.

---

### S2 — Document Upload + OCR

**Purpose:** Gather the 2–3 documents that unlock ~70% of all fields.

#### Step 2a: Upload INE (frente + reverso)

- Upload widget: drag-and-drop + camera button (mobile).
- Before upload: client-side image compression to max 800KB (sharp / browser Canvas API).
- On upload: trigger OCR job (server-side via Google Vision or similar).
- **OCR extracts:** nombres, ap_paterno, ap_materno, fecha_nac, genero, rfc, curp, clave_elector, vigencia_ine.
- Status indicator: "Leyendo tu INE..." → "✅ Datos extraídos" or "⚠️ No pudimos leer el INE — verifica la imagen".
- If OCR fails → **do not block**; pre-fill fields remain blank, agent types manually in S3.

#### Step 2b: Upload Talón de Pago

- Single file upload (PDF or image).
- **Critical OCR output:**
  - `dependencia` — detected name (e.g., "IMSS", "SEP", "ISSSTE", "GOB CDMX")
  - `matricula` — employee ID
  - `clave_delegacional` — if present
  - `sub_dependencia` — if present
  - `nombre_en_talon` — full name on payslip (cross-validated against INE name)
- **Dependencia detection logic** (see §5).
- If dependencia detected → system shows confirmation banner: "Detectamos que trabajas en **[DEPENDENCIA]**. ¿Correcto?" → Yes / No, let me pick.
- Talón may be **skipped** (weak internet scenario): agent chooses dependencia manually → system shows full conditional doc list for that dependencia.

#### Step 2c: Optional — Comprobante de Domicilio

- "¿Tienes comprobante de domicilio?" toggle.
- If Si → upload → OCR pre-fills address fields in S3.
- If No → address fields in S3 are blank, agent types.

**Offline mode:** If offline, images stored locally. Show "📤 Subida en cola — se procesará cuando haya conexión." Progress retained.

---

### S3 — Contratante Confirmation

**All fields pre-filled from OCR where available. Agent confirms or corrects.**

| Group | Fields | Source |
|-------|--------|--------|
| Nombre | nombres, ap_paterno, ap_materno | INE OCR |
| Nacimiento | fecha_nac (DD/MM/YYYY), genero | INE OCR |
| Identidad fiscal | rfc, curp | INE OCR |
| Identidad fiscal ext | entidad_nac, nacionalidad, regimen_fiscal | Derived / defaults |
| Identificación | tipo_id, organismo_emisor, num_id | Typed (not on OCR) |
| Dirección | calle, num_ext, num_int, cp, colonia, municipio, estado | Comprobante OCR or typed |
| Contacto | email, telefono | Typed (never on docs) |
| Ocupación | ocupacion | Select; no OCR source |

**UX pattern:** Each OCR-filled field has a subtle "pencil" icon. Unmodified OCR values shown in a slightly different shade to signal "auto-filled — please verify."

**Nexos con delincuencia:** Hidden field, always "No." If future scoring flags a name, this surfaces in ops review, not the form.

---

### S3b — Asegurado (conditional: only if misma_persona = No)

**Trigger:** Toggle at top of S3 — "¿El asegurado es la misma persona que el contratante?" default Si.

If No:
- Show same field groups as S3 but for Asegurado.
- INE upload for asegurado (separate from contratante's INE).
- OCR pre-fills same way.
- **Additional fields vs. domain model gap fix:** asegurado_curp, asegurado_email, asegurado_telefono (added per GAP_ANALYSIS §2B gap #6).

---

### S4 — Cobro + Plan

#### Cobro sub-section

| Field | Type | Notes |
|-------|------|-------|
| forma_cobro | select | Nómina / CLABE / Tarjeta crédito / Tarjeta débito |
| **If Nómina:** | | |
| clave_delegacional | text | Pre-filled from talón OCR; editable |
| matricula | text | Pre-filled from talón OCR; editable |
| sub_dependencia | select (dynamic) | Options filtered by dependencia |
| folio_contrato | text | Optional |
| **If CLABE / Tarjeta:** | | |
| clabe / num_tarjeta | text | Validated (CLABE: 18-digit Luhn) |
| banco | text / select | |
| fecha_inicio_cobro | date | |

#### Plan sub-section

| Field | Type | Notes |
|-------|------|-------|
| producto | display only | "Vida Más Constante" (always) |
| plan | select | Integral / Salud / Esencial / Accidentes (**Ahorra Más removed**) |
| periodicidad | select | Quincenal / Mensual / Anual |
| base_calculo | toggle | Prima / SA (default Prima) |
| suma_asegurada | number | Shown if base_calculo=SA |
| prima_base | currency | Shown if base_calculo=Prima |
| prima_adicional_ahorro | currency | Optional |
| prima_total | computed display | suma of prima_base + prima_adicional |

---

### S5 — Beneficiarios

**Dynamic list: 1–5 entries. At least 1 required.**

Per beneficiario:
- nombres, ap_paterno, ap_materno
- fecha_nac (DD/MM/YYYY)
- parentesco (select: Cónyuge, Hijo/a, Padre, Madre, Hermano/a, Otro)
- porcentaje (number; running total shown; must reach 100%)

**Live validation:** Running porcentaje tally shown as progress bar. Cannot proceed until total = 100%.  
**Shortcut:** "Distribuir igualmente" button splits 100% evenly.

---

### S6 — Additional Documents (Dependencia-Conditional)

**This screen is fully driven by the dependencia detected in S2b.**

#### Dependencia → Required Documents Matrix

| Dependencia | Required additional docs | Always-required docs |
|-------------|--------------------------|----------------------|
| **IMSS** (activos) | Talón de pago (✅ already uploaded) | INE frente+reverso, Solicitud páginas 3+4+6 |
| **IMSS** (jubilados) | Talón + Carta de Instrucción | INE, Solicitud pp 3+4+6 |
| **SEP Central** | Talón | INE, Solicitud pp 3+4+6 |
| **SEP Media** | Talón | INE, Solicitud pp 3+4+6 |
| **GOB CDMX** | Talón + Carta de Instrucción | INE, Solicitud pp 3+4+6 |
| **ISSSTE** | Talón | INE, Solicitud pp 3+4+6 |
| **AUTORIDAD** | Talón + Comprobante domicilio | INE, Solicitud pp 3+4+6 |
| **CLABE/Tarjeta** (no nomina) | Comprobante domicilio | INE, Solicitud pp 3+4+6 |

**Always-required (shown for all dependencias):**
- Solicitud página 3 (firma contratante)
- Solicitud página 4 (firma ejecutivo + datos ID)
- Solicitud página 6 (firma adicional)

> **Note:** If a doc was already uploaded in S2, it's marked ✅ here and not re-requested.

#### Upload UX for each doc:
- Status badge: `Pendiente` / `✅ Subido` / `⚠️ No subido (se puede enviar sin este doc)`.
- Each upload slot has: "Subir ahora" | "Subir después" | "No tengo este documento".
- Selecting "Subir después" or "No tengo" does NOT block submission — it flags the doc in `solicitud_documentos` as `pending` and routes the solicitud to the exception flow.

#### Foto/Video con cliente:
- Required for all new submissions.
- Can be: photo of agent + client holding signed solicitud, OR short video.
- **If weak internet:** can be skipped with a 24-hour upload window before ops review.

---

### S7 — Review + Sign + Submit

**Purpose:** Final summary screen; collect digital signature; submit.

#### Review panel
- Shows all key fields grouped: Agent, Contratante, Asegurado, Cobro, Plan, Beneficiarios, Documents.
- Each section has an "Editar" link to jump back.
- Missing docs shown as ⚠️ warnings (not errors): "La solicitud se enviará con documentos pendientes."

#### Digital signature
- Canvas-based signature pad (agent captures contratante's signature or attestation).
- **Offline:** Signature stored as base64 PNG in localStorage draft.
- Signature required before submit.

#### Submit button logic
```
if (all_required_entity_fields_present AND porcentaje_sum === 100 AND firma_present):
    → submit → write to solicitudes
    → for each missing/pending doc → write to solicitud_documentos with ocr_status='pending'
    → if any pending docs → set solicitud.intake_status = 'pending_docs'
    → else → set solicitud.intake_status = 'complete'
else:
    → block submit, highlight missing required fields
```

#### Confirmation screen
- Shows: Folio, Nombre del asegurado, Dependencia, Plan.
- If pending docs: "📋 Tienes **[N] documentos pendientes**. Puedes subirlos desde este enlace en las próximas 24 horas: [link]"
- Shareable link for doc upload (tokenized, expires 48h).

---

## 5. Dependencia Detection / Talón Logic

### Detection Algorithm

```typescript
function detectDependencia(ocr_text: string): DependenciaDetectionResult {
  const text = ocr_text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const patterns: [RegExp, string][] = [
    [/IMSS|INSTITUTO MEXICANO DEL SEGURO SOCIAL/, 'IMSS'],
    [/ISSSTE|INSTITUTO DE SEGURIDAD.*SERVICIOS.*ESTADO/, 'ISSSTE'],
    [/SEP\b|SECRETARIA.*EDUCACION/, 'SEP'],
    [/GOBIERNO.*CIUDAD.*MEXICO|CDMX|GOB.*CDMX/, 'GOB_CDMX'],
    [/PEMEX|PETROLEOS MEXICANOS/, 'PEMEX'],
    [/CFE|COMISION FEDERAL ELECTRICIDAD/, 'CFE'],
    [/IMSS.*JUBILADO|PENSIONADO.*IMSS/, 'IMSS_JUBILADOS'],
    [/AUTORIDAD|PODER JUDICIAL|SUPREMA CORTE/, 'AUTORIDAD'],
  ]

  for (const [pattern, dep] of patterns) {
    if (pattern.test(text)) {
      return { dependencia: dep, confidence: 'high', matched_pattern: pattern.source }
    }
  }

  // Second pass: extract candidate institution name from header lines
  const headerLines = ocr_text.split('\n').slice(0, 5)
  return { dependencia: null, confidence: 'low', candidate_text: headerLines.join(' ') }
}
```

### Confidence Levels & UX Response

| Confidence | UI action |
|------------|-----------|
| `high` | Banner: "Detectamos: **IMSS**. ¿Correcto?" [Sí / No] |
| `low` | Dropdown: "¿Cuál es la dependencia?" with OCR candidate pre-selected |
| `manual` | Agent chose manually from dropdown (talón not uploaded or OCR failed) |

### Conditional Doc Request (post-detection)

```typescript
function getRequiredDocs(dependencia: string, uploaded: string[]): RequiredDoc[] {
  const base = ['ine_frente', 'ine_reverso', 'solicitud_p3', 'solicitud_p4', 'solicitud_p6']
  
  const depDocs: Record<string, string[]> = {
    'IMSS':         ['talon'],
    'IMSS_JUBILADOS': ['talon', 'carta_instruccion'],
    'SEP':          ['talon'],
    'GOB_CDMX':     ['talon', 'carta_instruccion'],
    'ISSSTE':       ['talon'],
    'AUTORIDAD':    ['talon', 'comprobante_domicilio'],
    'CLABE':        ['comprobante_domicilio'],
  }

  const required = [...base, ...(depDocs[dependencia] ?? ['talon'])]
  return required.map(doc => ({
    doc_type: doc,
    status: uploaded.includes(doc) ? 'uploaded' : 'pending',
    blocking: false, // NEVER blocking
  }))
}
```

---

## 6. Exception & Error Flows

### 6.1 Missing Documents

**Rule:** Missing documents NEVER block submission. They trigger the `pending_docs` flow.

```
Agent submits with N missing docs
  → solicitud written to DB with intake_status = 'pending_docs'
  → solicitud_documentos rows created for each missing doc with ocr_status = 'pending'
  → Agent receives shareable upload link (token expires 48h)
  → Ops team notified: "[FOLIO] — falta(n): talón, solicitud_p6"
  → After 48h: if still missing → escalate to ops manager in Slack/Discord
  → Ops may override and proceed to emission (with notes) or put on hold
```

**DB status transitions:**
```
pending_docs → (all docs uploaded) → complete → en_emision → emitida
pending_docs → (ops override) → complete_with_exceptions → en_emision
pending_docs → (48h+, no upload) → stalled → (manual ops action)
```

### 6.2 OCR Failures

| Scenario | Response |
|----------|----------|
| OCR API unavailable | Fall back to manual entry; no OCR banner shown |
| OCR returned but confidence < 70% | Show fields as blank with hint "No pudimos leer esto — por favor escribe" |
| OCR extracted wrong data (user corrects) | Log correction event; original OCR stored in `solicitud_documentos.ocr_data` for audit |
| Talón OCR: dependencia not detected | Show manual dependencia picker; log `detection_confidence = 'low'` |

### 6.3 Weak Internet

| Scenario | Response |
|----------|----------|
| Offline on step load | Show "Sin conexión — tus cambios se guardan localmente" banner |
| Upload fails mid-stream | Chunked upload with resume; retry up to 5× with exponential backoff |
| Submit fails | Draft saved to localStorage; button changes to "Reintentar" |
| Step transition fails | Stay on current step; toast: "Error guardando — no te vayas, reintentando..." |
| OCR job times out (>15s) | Skip OCR for that doc; mark fields as needing manual input |

**Offline-first architecture:**
- All form state in IndexedDB (via `idb-keyval` or Dexie.js).
- Submit queued to service worker if offline; auto-submits when online.
- Max local draft size: ~10MB (compressed images + form data).

### 6.4 Duplicate RFC / Solicitud

```
On RFC blur (S3):
  → API call: GET /api/solicitudes/check-duplicate?rfc=XXX&semana=YY
  → If duplicate found in same week: show warning "Este RFC ya tiene una solicitud esta semana: [FOLIO]. ¿Quieres continuar?"
  → Agent can proceed (creates new record) or navigate to existing solicitud.

On final submit:
  → Server-side check: unique (rfc, week, clave_agente)
  → If exact duplicate: return 409 with folio of existing record
  → UX: "Ya existe una solicitud para este asegurado esta semana ([FOLIO]). ¿Reemplazar?"
```

### 6.5 Incomplete Signatures

| Scenario | Response |
|----------|----------|
| Signature canvas empty | Hard block: "Se requiere firma para enviar" |
| Signature too brief (<500ms draw time) | Soft warning: "La firma parece incompleta — ¿confirmar?" |
| Solicitud PDF page signatures missing | Not validated in form (physical doc) — ops reviews scanned pages |
| Seguro Provisional section blank | Warning shown on S7 review: "Asegúrate de que la cobertura provisional esté completa en la página 3" |

### 6.6 Validation Errors (inline)

- RFC format: `/^[A-Z]{4}[0-9]{6}[A-Z0-9]{3}$/` — show inline error, do not advance
- CLABE: 18-digit Luhn check — show inline error
- Beneficiary porcentaje ≠ 100%: block S5 completion with progress bar
- Fecha nac: must be 18–80 years old (GNP eligibility) — show age ineligibility warning
- Email: RFC 5322 format — inline error

---

## 7. Quality Strategy

### 7.1 Acceptance Criteria (definition of done)

The replacement intake is shippable when ALL of the following pass:

1. **AC-01:** Agent with real INE + talón can complete a full solicitud in < 5 minutes on 3G mobile.
2. **AC-02:** OCR pre-fills ≥ 70% of Contratante fields correctly (measured on 20-solicitud sample).
3. **AC-03:** Dependencia detected correctly for IMSS, SEP, GOB_CDMX, ISSSTE on test talones.
4. **AC-04:** Solicitud with 2 missing docs submits successfully; `solicitud.intake_status = 'pending_docs'`; agent receives upload link.
5. **AC-05:** Offline submission: agent fills form offline, submits when back online; record written correctly.
6. **AC-06:** Duplicate RFC in same week shows warning (not hard block) and correctly references existing folio.
7. **AC-07:** Beneficiary porcentaje UI prevents submission until sum = 100%.
8. **AC-08:** All three solicitud PDF signature pages are always requested (S6) regardless of dependencia.
9. **AC-09:** Folio generated correctly (`{clave}-{year}-S{week}-{increment}`); no duplicates under concurrent load.
10. **AC-10:** Solicitud written to `solicitudes` table (not `solicitudes_paperform`); `solicitud_beneficiarios` normalized rows created.
11. **AC-11:** `solicitud_documentos` rows created for every uploaded and every pending doc.
12. **AC-12:** Ahorra Más plan option does not appear.

---

### 7.2 Unit Tests

**Target: `lib/` and server actions**

```
lib/ocr/detectDependencia.test.ts
  ✓ returns 'IMSS' for text containing "INSTITUTO MEXICANO DEL SEGURO SOCIAL"
  ✓ returns 'IMSS_JUBILADOS' for text with "PENSIONADO IMSS"
  ✓ returns confidence='low' for unrecognized institution
  ✓ handles accent-normalized text correctly
  ✓ returns null dependencia for empty string

lib/docs/getRequiredDocs.test.ts
  ✓ IMSS returns talon + 3 signature pages + INE
  ✓ IMSS_JUBILADOS additionally requires carta_instruccion
  ✓ GOB_CDMX additionally requires carta_instruccion
  ✓ already-uploaded docs marked as 'uploaded' not 'pending'
  ✓ no doc is ever blocking=true

lib/types/validateBeneficiarios.test.ts
  ✓ rejects empty array
  ✓ rejects sum < 100
  ✓ rejects sum > 100
  ✓ rejects any individual porcentaje = 0
  ✓ accepts exactly 100% across 3 beneficiaries

lib/folio/generateFolio.test.ts
  ✓ format matches {clave}-{year}-S{week}-{increment}
  ✓ concurrent calls do not produce duplicates (mock Supabase)
  ✓ week number derived from ISO week of submission date

lib/rfc/resolveRfcEjecutivo.test.ts
  ✓ cedula=Si → returns agent's own RFC
  ✓ cedula=No → returns PUFM861020CR7

lib/cobro/validateClabe.test.ts
  ✓ valid 18-digit CLABE passes
  ✓ 17-digit CLABE fails
  ✓ invalid checksum fails
  ✓ non-numeric chars fail

lib/ocr/crossValidateName.test.ts
  ✓ INE name matches talón name → confidence=high
  ✓ significant mismatch → flag for ops review
```

**Target: `actions/submitSolicitud.ts`**
```
actions/submitSolicitud.test.ts
  ✓ valid payload writes to solicitudes + solicitud_beneficiarios + solicitud_documentos
  ✓ missing docs → intake_status='pending_docs', not rejection
  ✓ validateSolicitudEntities called before DB write
  ✓ duplicate RFC in same week returns 409 with existing folio
  ✓ misma_persona=true → asegurado extracted from contratante fields
```

---

### 7.3 Integration Tests

**Target: API routes + DB (using Supabase local / test schema)**

```
api/solicitudes/submit.integration.test.ts
  ✓ POST /api/solicitudes → creates row in solicitudes table with correct clave_agente
  ✓ POST with 5 beneficiaries → 5 rows in solicitud_beneficiarios, sum=100%
  ✓ POST with missing talon → solicitud_documentos row with ocr_status='pending'
  ✓ POST with all docs → intake_status='complete'
  ✓ Duplicate RFC same week → 409 response

api/ocr/talon.integration.test.ts
  ✓ POST /api/ocr/talon with IMSS test image → dependencia='IMSS' in response
  ✓ POST with unreadable image → 200 with confidence='low', dependencia=null (no 500)

api/solicitudes/check-duplicate.integration.test.ts
  ✓ GET ?rfc=XXX&semana=10 → returns existing folio if found
  ✓ GET for new RFC → returns null

api/docs/upload-token.integration.test.ts
  ✓ Token generated on submit with pending docs
  ✓ Token expires after 48h
  ✓ Expired token returns 401
  ✓ Valid token allows upload to correct solicitud_documentos row
```

---

### 7.4 E2E / High-Level Tests (Hi Tests)

**Tool: Playwright. Run against staging environment.**

```
e2e/happy-path-imss.spec.ts
  "IMSS agent submits complete solicitud"
  1. Navigate to /solicitud-vidamas/nueva
  2. S1: Enter clave_agente=7052, cedula_vigente=Si, fecha_firma=today, estado=CDMX
  3. S2: Upload test INE front → wait for OCR → verify name pre-filled
  4. S2: Upload test talón IMSS → verify dependencia banner shows "IMSS"
  5. S3: Verify OCR fields populated; change one field; verify edit tracked
  6. S4: Select Nómina cobro; verify clave_delegacional pre-filled from talón
  7. S4: Select Plan Integral, Quincenal, $500 prima
  8. S5: Add 2 beneficiaries summing to 100%
  9. S6: Upload solicitud_p3, p4, p6; verify all ✅
  10. S7: Sign, submit → verify folio displayed, intake_status='complete'
  Assert: solicitudes row exists with correct data; 2 beneficiario rows; 4 doc rows

e2e/missing-docs-flow.spec.ts
  "Agent submits with missing documents → exception flow"
  1–8. Same as above
  9. S6: Skip solicitud_p6 upload (click "Subir después")
  10. S7: Warning shown "1 documento pendiente"
  11. Submit → verify folio shown, warning about pending docs
  Assert: intake_status='pending_docs'; 1 doc row with ocr_status='pending'
  Assert: upload link visible and functional

e2e/offline-submit.spec.ts
  "Agent fills form offline, submits when online"
  1. go offline (Playwright network interception)
  2. Fill all steps — verify each step saves to localStorage
  3. Attempt submit → verify "En cola" state shown
  4. Go online → service worker auto-retries → verify submission
  Assert: solicitudes row created correctly

e2e/duplicate-rfc.spec.ts
  "Duplicate RFC shows warning, not hard block"
  1. Seed a solicitud with RFC=XXX in current week
  2. Fill new solicitud with same RFC=XXX
  3. On S3 RFC blur → verify warning toast appears with existing folio
  4. Continue to submit anyway → verify 409 → verify warning modal with existing folio link
  Assert: second solicitud NOT created (agent chose not to proceed)

e2e/weak-internet.spec.ts
  "Slow network: OCR timeout gracefully handled"
  1. Throttle to 3G (750 kbps) in Playwright
  2. Upload talón → OCR takes > 15s (mocked timeout)
  3. Verify: "No pudimos leer el talón — puedes continuar sin él" message
  4. Verify: dependencia dropdown shown for manual selection
  Assert: form continues normally; no crash

e2e/misma-persona-false.spec.ts
  "Contratante ≠ Asegurado flow"
  1. On S3: toggle misma_persona = No
  2. S3b: Upload asegurado INE → OCR fills asegurado fields
  3. Complete and submit
  Assert: solicitud has both contratante and asegurado fields populated distinctly
  Assert: extractAsegurado() returns asegurado-specific fields, not contratante clone
```

---

### 7.5 Quality / QS Process

#### Code Quality Gates (CI)
- `eslint` + `typescript --noEmit` on every PR
- Unit test coverage ≥ 80% on `lib/` directory
- Integration tests run against Supabase local in CI (Docker)
- E2E tests run on every merge to `main` against staging

#### Data Quality Checks (post-submit)
- Daily: query `solicitudes` for rows where `intake_status='pending_docs'` AND `created_at < now() - 24h` → alert ops
- Daily: query for `solicitud_beneficiarios` where sum(porcentaje) ≠ 100 (should be zero — trigger constraint backup)
- Weekly: query for `solicitudes` NOT in `polizas` older than 7 days → review why not emitted

#### OCR Quality
- Log OCR extracted values + agent-corrected values in `solicitud_documentos.ocr_data`.
- Weekly report: % of fields where OCR value ≠ final value (by field type) → tune extraction.
- Target: OCR accuracy ≥ 85% on nombre, ap_paterno, fecha_nac after first month.

#### Acceptance Testing with Agents
- Before launch: 3 agents run 5 real solicitudes each through staging.
- Measure: time-to-submit (target < 5 min), errors encountered, fields needing correction.
- Blocker to launch: any AC-01 through AC-12 failing.

---

## 8. Document Tracking: `solicitud_documentos` Table

This table must be created as P1 (per GAP_ANALYSIS):

```sql
CREATE TABLE solicitud_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN (
    'ine_frente','ine_reverso','talon','carta_instruccion',
    'comprobante_domicilio','solicitud_p3','solicitud_p4','solicitud_p6',
    'foto_video','asegurado_ine_frente','asegurado_ine_reverso','other'
  )),
  storage_path    text,
  storage_bucket  text DEFAULT 'solicitud-docs',
  file_size_bytes bigint,
  mime_type       text,
  ocr_status      text DEFAULT 'pending' CHECK (ocr_status IN (
    'pending','processing','completed','failed','skipped','not_uploaded'
  )),
  ocr_data        jsonb,             -- raw OCR result
  ocr_extracted   jsonb,             -- normalized field→value map
  upload_token    uuid,              -- for post-submit delayed upload
  upload_token_expires_at timestamptz,
  drive_backup_id text,
  drive_backup_at timestamptz,
  uploaded_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sol_docs_solicitud ON solicitud_documentos(solicitud_id);
CREATE INDEX idx_sol_docs_token ON solicitud_documentos(upload_token) WHERE upload_token IS NOT NULL;
```

---

## 9. Repo Strategy

### Recommendation: **Reuse `solicitud-vidamas` repo ✅**

**Rationale:**
- The domain model, TypeScript types, Supabase actions, and DB migrations are already there.
- The new wizard is a replacement of the intake frontend, not a new product.
- All the canonical infrastructure (Supabase client, `submitSolicitud`, `validateSolicitudEntities`, folio generation) lives there and should continue to live there.

**What changes in the repo:**

| Area | Current state | Change |
|------|--------------|--------|
| `app/nueva/` (or `app/wizard/`) | Linear Paperform-replacement form | Replace with 7-step wizard |
| `lib/ocr/` | Does not exist | Add: `detectDependencia.ts`, `extractFromIne.ts`, `extractFromTalon.ts` |
| `lib/docs/` | Does not exist | Add: `getRequiredDocs.ts`, `uploadToken.ts` |
| `lib/cobro/` | Does not exist | Add: `validateClabe.ts` |
| `actions/submitSolicitud.ts` | Exists | Update: write `solicitud_documentos` rows; set `intake_status` |
| `sql/004_solicitud_documentos.sql` | Does not exist | Add migration |
| `sql/005_solicitud_status_log.sql` | Does not exist | Add status history table |
| `app/pendiente-docs/[token]/` | Does not exist | Add: delayed doc upload page |
| Paperform webhook | Existing parallel pipeline | **Decommission** once wizard is live |

**What to keep:**
- All existing Supabase migrations (001–003)
- Domain model types (`Contratante`, `Asegurado`, `Beneficiario`)
- `validateSolicitudEntities()`, `validateBeneficiarios()` — used as-is
- Folio generation logic

### Branch strategy
```
main              ← production (Paperform still live)
feat/new-wizard   ← all new development
                    → merged to main after AC-01–AC-12 pass
                    → Paperform decommissioned same deploy
```

---

## 10. Implementation Plan

### Phase 1 — Foundation (Week 1–2)
- [ ] `sql/004_solicitud_documentos.sql` migration
- [ ] `sql/005_solicitud_status_log.sql` migration  
- [ ] `lib/ocr/detectDependencia.ts` + unit tests
- [ ] `lib/docs/getRequiredDocs.ts` + unit tests
- [ ] `actions/submitSolicitud.ts` updated: writes `solicitud_documentos`, handles `pending_docs` flow
- [ ] `lib/cobro/validateClabe.ts` + unit tests
- [ ] `lib/folio/` → existing folio gen — add concurrency test

### Phase 2 — Wizard UI (Week 2–4)
- [ ] S1: Agent + Signature (new form component)
- [ ] S2: Document upload + OCR integration (Google Vision or Textract)
- [ ] S3/S3b: Contratante/Asegurado with OCR pre-fill pattern
- [ ] S4: Cobro + Plan (with conditional nomina/CLABE sub-sections)
- [ ] S5: Beneficiarios with live porcentaje bar
- [ ] S6: Conditional docs (dependencia-driven)
- [ ] S7: Review + Signature + Submit
- [ ] Offline / IndexedDB draft persistence
- [ ] Image compression before upload (Canvas API)

### Phase 3 — Exception & Delayed Upload (Week 3–4)
- [ ] `app/pendiente-docs/[token]/` — delayed upload page
- [ ] Upload token generation + expiry
- [ ] Ops notification (Discord webhook to #emisiones) for stalled solicitudes

### Phase 4 — QA + Launch (Week 4–5)
- [ ] All unit tests passing (≥80% coverage on `lib/`)
- [ ] All integration tests passing
- [ ] E2E happy-path tests passing on staging
- [ ] 3-agent acceptance test (5 real solicitudes each)
- [ ] All AC-01–AC-12 verified
- [ ] Paperform webhook decommissioned
- [ ] Redirect vidamas.paperform.co → new URL (or sunset message)

### Estimated effort
| Phase | Effort |
|-------|--------|
| Foundation | 3–4 days (1 dev) |
| Wizard UI | 8–10 days (1 dev) |
| Exception flow | 2–3 days |
| QA + launch | 3–4 days |
| **Total** | **~16–21 dev-days** |

---

## 11. Open Questions for Mario

1. **OCR provider:** Google Vision API (already in stack via service account) or prefer a different provider? AWS Textract is also strong for forms.
2. **Signature method:** Digital signature pad (canvas base64) sufficient, or is a more legally robust e-signature (DocuSign, Mifiel) needed for GNP?
3. **Delayed upload window:** 48h assumed — is this the right SLA before ops escalates?
4. **Foto/video requirement:** Is this always required at submit time, or can it be deferred like other docs?
5. **Sub-dependencia options:** The current Paperform has a hardcoded select per dependencia. Should this be a database table (`sub_dependencias`) for easier management, or keep it static?
6. **Mobile app vs. web:** Is this always accessed via mobile browser, or is a native PWA (installable) wanted?

---

## Appendix A: Solicitud Pages 3, 4, 6 — Why Always Required

Per business rule confirmed by Mario (Feb 23, 2026):
> "ALL THREE signature pages must always be signed — no exceptions. GNP reviewers cannot reliably identify which section applies to which page. Agent must get client signatures on all three even if some sections are N/A."

This is encoded in `getRequiredDocs()` as a non-negotiable base set.

## Appendix B: Seguro Provisional

Seguro Provisional = temporary coverage from signature date until póliza vigencia begins. Must be completed on every solicitud. The form should show a reminder checklist item on S7: "¿Está completo el Seguro Provisional en la página 3 de la solicitud física?"

## Appendix C: Ahorra Más Removal

Per business rule confirmed by Mario: "Remove Ahorra Más — no one sells it." Valid plans in Plan select:
- Plan Integral ✅
- Plan Salud ✅  
- Plan Esencial ✅
- Plan Accidentes ✅
- ~~Plan Ahorra Más~~ ❌ REMOVED

---

*End of spec. Next action: review Open Questions with Mario, then begin Phase 1 implementation.*
