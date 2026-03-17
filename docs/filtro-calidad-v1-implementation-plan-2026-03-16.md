# Filtro de Calidad v1 — Implementation Plan
**Created:** 2026-03-16
**Author:** Jarvis (sub-agent: filtro-intake-retro)
**Status:** Scaffolding complete — ready for Phase 2 wiring

---

## What Was Built (this session)

### New files created (do NOT conflict with schema work):

| File | Purpose |
|------|---------|
| `sql/011_filtro_calidad_schema.sql` | All 5 quality tables + 2 views. Isolated — no edits to existing tables. |
| `lib/quality/types.ts` | TypeScript types: `QualityFinding`, `RunScope`, `QualityRunResult`, `RULE_CODES`, status labels |
| `lib/quality/intake-hook.ts` | `runIntakeFiltro()` — called from `submitSolicitud()` before DB insert |
| `lib/quality/retro-runner.ts` | `runRetroFiltro(scope, supabase)` — promptable bulk scanner |
| `lib/quality/prompt-runner.ts` | `parseRunScope(text)` — natural-language → structured `RunScope` |

---

## Phase Integration Map

### Phase 2 — Wire intake hook into `submitSolicitud()`

**File:** `app/solicitud/actions.ts`

Insert these lines right after the existing duplicate-RFC check block and before the Supabase insert:

```typescript
// ~line 95, after duplicate check, before payload construction
import { runIntakeFiltro } from '@/lib/quality/intake-hook'

// Inside submitSolicitud(), after folio generation:
const intakeFiltro = await runIntakeFiltro(formData, supabase)
if (intakeFiltro.blocked) {
  return {
    success: false,
    error: intakeFiltro.summary_text,
    quality_findings: intakeFiltro.findings,
    quality_blocked: true,
  }
}
// Continue with existing payload insert...
```

**Return type change needed:** Add `quality_findings?` and `quality_blocked?` to the return type so the wizard can show specific stop reasons to the agent.

**After successful insert:** pass `data.id` back into `runIntakeFiltro` so findings are linked to the solicitud_id:

```typescript
// After insert succeeds, persist findings with solicitud_id:
await runIntakeFiltro(formData, supabase, data.id)
// (second call — the first was for blocking; this one persists with the real ID)
```

*Better approach:* Refactor `runIntakeFiltro` to accept `solicitudId?: string` and only persist if provided (already implemented). Run rules-only pass first, then persist after insert. See `intake-hook.ts` for `solicitudId` param.

---

### Phase 4 — Retro runner invocation (Jarvis prompt layer)

When Mario says "run filtro calidad for…", Jarvis:

1. Calls `parseRunScope(input)` → `RunScope`
2. Calls `runRetroFiltro(scope, supabase)` → `QualityRunResult`
3. Formats summary for Mario:

```typescript
import { parseRunScope } from '@/lib/quality/prompt-runner'
import { runRetroFiltro } from '@/lib/quality/retro-runner'
import { createServerClient } from '@/lib/supabase'

// In a server action or API route:
const scope = parseRunScope("Run filtro calidad for all pólizas in February")
const supabase = createServerClient()
const result = await runRetroFiltro(scope, supabase, 'mario')

// Format for Mario:
const msg = `
📊 Filtro de Calidad — ${result.summary.total_evaluated} pólizas evaluadas
❌ Paradas duras: ${result.summary.hard_stops}
⚠️  Flags: ${result.summary.flags}
Por categoría: ${JSON.stringify(result.summary.by_category, null, 2)}

Cola de acción: ${result.action_queue.length} items requieren revisión de Mario.
`
```

---

### Phase 5 — Review Queue (CEO Dashboard / ASTRO ops)

Add a `/quality-review` page or widget that queries:

```sql
-- Open hard stops for Mario review
SELECT * FROM v_open_hard_stops ORDER BY detected_at DESC;

-- Expediente SLA status
SELECT * FROM v_expediente_sla WHERE expediente_state != 'expediente_resolved_in_sla';
```

**Supabase RLS:** Quality tables should allow `SELECT` for authenticated ops users, but `INSERT/UPDATE` on `quality_overrides` should be restricted to Mario's user ID only.

---

## Rule Codes Reference

| Rule Code | Severity | Category | Trigger |
|-----------|----------|----------|---------|
| `VIDEO_MISSING` | stop | doc_authenticity | docs_video is null |
| `SELLER_NAME_MISSING` | stop | seller_mismatch | nombre_agente blank + video present |
| `SELLER_NAME_MISMATCH` | stop | seller_mismatch | Video analysis name ≠ agent of record |
| `EXISTING_POLICY_NO_CONSENT` | flag/stop | existing_policy | asegurado_tiene_otras_polizas=Si; stop if no video consent confirmed |
| `DUPLICATE_RFC` | stop | duplicate | Same RFC, different identity |
| `PAYROLL_NOMIPAY_FAIL` | stop | payroll_capacity | GOB CDMX/SEP — Nomipay verify fails |
| `PAYROLL_IMSS_LIQUIDEZ_FAIL` | stop | payroll_capacity | IMSS capacidad de líquido fails |
| `PAYROLL_IMSS_STRICT_FORMULA` | flag | payroll_capacity | IMSS carpetas strict formula — advisory only |
| `EXPEDIENTE_ISSUE_OPEN` | stop | expediente | GNP email signal, no COMPLETO |
| `EXPEDIENTE_SLA_BREACHED` | stop | expediente | > 5 business days, no COMPLETO |
| `EXPEDIENTE_RESOLVED_LATE` | stop | expediente | COMPLETO arrived after SLA |
| `CANCELLATION_EMAIL_MATCH` | stop | cancellation | Email with policy # + cancelar signal |
| `FACE_MATCH_INCONCLUSIVE` | stop | face_match | Low confidence vendor result |
| `FACE_MATCH_MISMATCH` | stop | face_match | Faces don't match |
| `MISSING_REQUIRED_DOC` | stop | dependency_requirement | Missing doc per carpeta de liberación |

---

## Open Questions for Mario / Next Sub-agent

1. **Intake blocking UX:** When intake filtro returns `blocked=true`, should the wizard:
   - (a) Hard-block submission entirely until Mario override
   - (b) Allow agent to submit but flag as `blocked_*` status for ops review
   - (c) Show a warning with "submit anyway" that auto-routes to Mario queue
   *Recommendation: (b) for flags, (a) for stops. Confirm?*

2. **Nomipay integration:** How does Jarvis call Nomipay? Is there an existing API client or is this a manual check? The intake hook currently flags GOB CDMX/SEP as "pending verification" — not a hard block — until this is confirmed.

3. **Video analysis pipeline:** Seller name detection requires a video-to-transcript step (e.g., Whisper + name matching). Currently `SELLER_NAME_MISSING` fires when `nombre_agente` is blank. Full video analysis is a separate Phase 2+ task.

4. **Face match vendor:** The spec says "pluggable vendor abstraction". Has a vendor been selected? If not, `lib/quality/face-match.ts` should be a stub that returns `inconclusive` until wired.

5. **`policy_number` column in `solicitudes`:** The retro runner queries `sol.policy_number`. Does this column exist in the current schema, or does it need to be added in an earlier migration? (Checked SQL migrations 001–010 but it may be in a separate Supabase column not yet defined.)

6. **Email ingestion job:** The retro runner depends on `email_policy_events` being populated. That requires a Gmail ingest cron (Phase 3). Who owns Phase 3, and when is it scheduled?

7. **CEO Dashboard routing:** Should the quality review queue live in the existing CEO Dashboard app, or in ASTRO (Stacker)? Both are referenced in the bible. Stacker is faster to ship; CEO Dashboard is richer.

8. **Retro runner API route:** The `runRetroFiltro` function should be exposed as a server action or API route so Jarvis can call it via natural language. Where should this live — `app/api/quality/run/route.ts` or a Discord-triggered server action?

---

## What's NOT done yet (needs separate sub-agent or Phase 3+)

- Gmail ingestion → `email_policy_events` (Phase 3)
- Face match vendor stub (Phase 2+)
- Video transcript + seller name extraction (Phase 2+)
- Full Nomipay integration (Phase 2+)
- CEO Dashboard / ASTRO queue UI (Phase 5)
- Mario override action (UI + `quality_overrides` insert)
- Supabase RLS policies for quality tables
- Unit tests for `parseRunScope` and `evaluateSolicitud`

---

## Files NOT modified (safe from conflicts)

- `app/solicitud/actions.ts` — intentionally NOT modified; intake hook wiring is documented above
- `lib/types.ts` — no changes
- `lib/intake-status.ts` — no changes
- All existing SQL migrations — no changes
