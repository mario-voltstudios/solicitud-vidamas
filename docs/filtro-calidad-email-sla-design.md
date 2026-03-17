# Filtro de Calidad v1 — Email & SLA Design Artifact
**Created:** 2026-03-16  
**Scope:** Email intelligence + Expediente SLA + Cancellation detection  
**Status:** Scaffolded (Phase 3 of build order)

---

## What this covers

This doc describes the email/SLA subsystem of Filtro de Calidad.  
It maps directly to Phase 3 of the spec (`filtro-calidad-v1-spec-2026-03-16.md`).

---

## Data flow

```
Gmail (GNP emails)
       │
       ▼
 [email-intel.ts]
 parseEmailForPolicy()         ← exact policy number match + keyword match
       │
       ▼
 email_policy_events (table)   ← persisted, idempotent by (message_id, event_type)
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
 [expediente-sla.ts]            [cancellation-rules.ts]
 deriveExpedienteState()         deriveCancellationState()
       │                                  │
       ▼                                  ▼
 ExpedienteSlaResult             CancellationResult
       │                                  │
       ▼                                  ▼
 expedienteSlaToFinding()       cancellationToFinding()
       │                                  │
       └──────────────┬───────────────────┘
                      ▼
              quality_findings (table)
                      │
                      ▼
              policy_quality_state (table)
                      │
                      ▼
              Review queue / CEO Dashboard
```

---

## Matching rules (from bible — strict)

### Cancellation detection

| Signal | Trigger | Severity |
|--------|---------|----------|
| `EMAIL_CANCEL_EXACT_POLIZA` | Email contains exact policy number **AND** cancelar/cancelación (accented or not) | `stop` |

- Rule code: `EMAIL_CANCEL_EXACT_POLIZA`
- Category: `cancellation`
- Status label: `blocked_cancellation_risk`
- v2: person-level linkage (RFC/phone/matrícula) can add `flag` — not in v1

### Expediente issue detection

| Signal | Trigger | Severity |
|--------|---------|----------|
| `EXPEDIENTE_ISSUE_OPEN` | Email contains exact policy number + "expediente" (no COMPLETO) | `stop` |
| `EXPEDIENTE_SLA_BREACHED` | Issue detected, 5 biz days passed, no COMPLETO | `stop` |
| `EXPEDIENTE_RESOLVED_LATE` | COMPLETO arrived but after SLA | `stop` / manual review |
| `EXPEDIENTE_RESOLVED_IN_SLA` | COMPLETO within 5 biz days | No finding (clean) |

---

## SLA computation

- SLA: **5 business days** from `expediente_issue` event date
- Business days: Mon–Fri, skip weekends
- Holiday support: pluggable `isHoliday(date)` function (default: no holidays)
- SLA deadline: end-of-day (23:59:59) on day 5
- `addBusinessDays(issueDate, 5)` → deadline
- `countBusinessDays(issueDate, completeDate)` → days to resolve

---

## Email event types

| event_type | Trigger |
|------------|---------|
| `cancellation_signal` | policy + cancelar/cancelación |
| `expediente_issue` | policy + expediente (no COMPLETO) |
| `expediente_complete` | policy + expediente + COMPLETO |

Note: if an email has both "expediente" and "COMPLETO", it is classified only as `expediente_complete` (COMPLETO supersedes issue detection).

---

## Idempotency

- `email_policy_events` has a UNIQUE index on `(source_message_id, event_type)`
- Re-ingesting the same Gmail message is safe — it will upsert, not duplicate

---

## Quality finding status labels used

| Label | When |
|-------|------|
| `blocked_cancellation_risk` | Cancellation signal detected |
| `blocked_cancellation_risk` | Expediente issue open or SLA breached |
| `retroactive_urgent` | Expediente resolved late |

---

## What is NOT implemented in this scaffolding

- Supabase DB write layer (persisting findings/events) — Phase 1/2 dependency
- Gmail API polling job — connects email-intel.ts to real Gmail
- `quality_runs` orchestrator — runs the full engine over a policy set
- Person-level cancellation linkage — TODO v2
- Mexican public holiday calendar — defaultIsHoliday returns false
- COMPLETO from a *different* email thread — the current logic handles it correctly as long as events are parsed and stored

---

## Files created

| File | Purpose |
|------|---------|
| `sql/011_filtro_calidad_quality_layer.sql` | DB migration for 5 quality tables |
| `lib/filtro-calidad/types.ts` | All TypeScript types for the module |
| `lib/filtro-calidad/email-intel.ts` | Email parsing + policy number matching |
| `lib/filtro-calidad/expediente-sla.ts` | 5-biz-day SLA derivation + finding factory |
| `lib/filtro-calidad/cancellation-rules.ts` | Cancellation state derivation + finding factory |
| `lib/filtro-calidad/index.ts` | Module entry point / re-exports |
| `docs/filtro-calidad-email-sla-design.md` | This document |

---

## Open questions

1. **Policy number format**: What is the exact GNP format? (e.g. digits only? alphanumeric with dashes?) The current regex uses a word-boundary approach that should work for most formats but should be tightened once confirmed.

2. **Mexican holiday calendar**: Should we inject a full MX public holiday list for accurate 5-biz-day SLA? The current implementation skips only weekends.

3. **Gmail scope**: Which Gmail account receives GNP expediente/cancellation emails? `mario@veseguro.com` or a shared inbox? The ingestion job needs to target the right account.

4. **Expediente email format from GNP**: Is the policy number always in the subject, or sometimes only in the body? Does GNP use a consistent template?

5. **COMPLETO signal confidence**: Can a single email contain BOTH an expediente issue AND a COMPLETO (i.e., "issue found and immediately resolved")? Current logic treats expediente+COMPLETO → only `expediente_complete`. Is that correct?

6. **Cancellation email source**: Are cancellation emails sent BY GNP, or are they client/agent emails? This affects parsing approach (structured vs. freeform).

7. **DB migration sequence**: Migration `011` references `solicitudes(id)` from `001`. Confirm migration run order is enforced before applying.
