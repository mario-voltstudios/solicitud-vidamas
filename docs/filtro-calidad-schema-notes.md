# Filtro de Calidad v1 — Schema Notes

**Migration:** `sql/011_filtro_calidad_v1.sql`
**Created:** 2026-03-16
**Phase:** 1 — Schema + rule persistence

## Tables created

| Table | Purpose |
|---|---|
| `quality_runs` | One row per scan invocation (intake / retroactive / on_demand) |
| `quality_findings` | One finding/stop/flag per rule per policy or case |
| `quality_overrides` | Mario-only override trail (one per finding max) |
| `policy_quality_state` | Materialized current quality state per policy/case |
| `email_policy_events` | Normalized email-derived signals (cancellation + expediente) |
| `quality_rule_codes` | Registry of all rule codes — source of truth for the engine |

## Views

- `v_quality_hard_stop_queue` — open hard stops pending Mario review
- `v_expediente_sla_watch` — policies with open/breached expediente SLA

## Enums

- `quality_run_type`: `intake | retroactive | on_demand`
- `quality_scope_type`: `policy | agent | date_range | dependencia | team`
- `quality_severity`: `stop | flag | info`
- `quality_category`: 11 categories (fraud, duplicate, seller_mismatch, existing_policy, cancellation, expediente, payroll_capacity, doc_authenticity, face_match, dependency_requirement, legal_compliance)
- `override_decision`: `approved | rejected`
- `email_event_type`: `cancellation_signal | expediente_issue | expediente_complete`
- `expediente_state`: 5 states per bible (clean → sla_breached)

## Status labels (Spanish-friendly CHECK constraint)

```
approved_for_emision
blocked_fraud_risk
blocked_duplicate_risk
blocked_eligibility_risk
blocked_existing_policy_risk
blocked_cancellation_risk
blocked_doc_authenticity_risk
pending_manual_review
retroactive_watch
retroactive_urgent
```

## Rule codes seeded (26 rules)

| Range | Category |
|---|---|
| FD-001..005 | Duplicate identity |
| SM-001..002 | Seller mismatch |
| EP-001..002 | Existing policy / reciclado |
| CX-001..002 | Cancellation email |
| EX-001..005 | Expediente Digital SLA |
| PC-001..003 | Payroll capacity |
| FM-001..003 | Face match |
| DA-001 | Doc authenticity |
| DR-001..002 | Dependency requirement |
| LC-001 | Legal compliance |

## Mario-only overrides

RLS policy is included but **commented out** — uncomment and replace
`MARIO_UID_HERE` with Mario's actual Supabase `auth.uid()` before enabling.

## Open questions

1. **Mario's Supabase UID** — needed to activate RLS on `quality_overrides`.
2. **`policy_quality_state` primary key** — uses composite PK on `(COALESCE(policy_number,''), COALESCE(solicitud_id,''))`. If a policy can exist with *both* keys, confirm upsert key preference.
3. **Expediente SLA calendar** — "5 business days" requires a Mexican holiday calendar or a helper function. Currently not encoded; Phase 3 (email normalization) will need to implement this.
4. **`solicitud_id` FK** — intentionally not a hard FK to `solicitudes.id` to allow retro runs on policies with no solicitud record. Confirm if soft reference is acceptable.
5. **Face match vendor** — `FM-*` rule codes are seeded but vendor integration (pluggable abstraction) is Phase 2+.
