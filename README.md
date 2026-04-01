# Solicitud VidaMás — Intake Form

Next.js wizard for capturing VidaMás insurance applications (solicitudes). Submits to Supabase with fire-and-forget backups to Google Sheets and Google Drive.

---

## Domain Model

See **[DOMAIN_MODEL.md](./DOMAIN_MODEL.md)** for the full canonical reference.

**TL;DR — Three essential entities per solicitud:**

1. **Contratante** — the payer (exactly 1)  
2. **Asegurado** — the insured/applicant (exactly 1)  
3. **Beneficiarios** — death beneficiaries (1+, must sum to 100%)

The TypeScript types and validation helpers live in `lib/types.ts`. Always validate with `validateSolicitudEntities(formData)` before submitting.

---

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Key Files

| File | Purpose |
|---|---|
| `lib/types.ts` | Domain types, entity extractors, validation helpers |
| `lib/supabase.ts` | Supabase client setup |
| `app/solicitud/actions.ts` | Server actions: submit, validate agent, OCR |
| `components/wizard/` | One component per wizard step |
| `sql/` | Database migration files (apply in order) |
| `DOMAIN_MODEL.md` | Canonical domain model reference |
| `GAP_ANALYSIS.md` | Airtable ↔ Supabase gap analysis |

### Database Migrations

**Source of truth:** `supabase/migrations/`

ASTRO now follows the standard Supabase migration pattern already used in other repos. Historical SQL from `sql/` has been mirrored into `supabase/migrations/` so schema changes can be tracked consistently in Git.

Legacy files still present for readability/reference:

```
sql/001_solicitudes_normalized.sql   — beneficiarios normalization + back-fill
sql/002_poliza_reconciliation.sql    — polizas + reconciliation_checks tables
sql/003_recibos_lifecycle.sql        — recibos lifecycle model + views
sql/004_solicitud_documentos.sql     — document tracking table
sql/005_solicitud_status_history.sql — append-only status audit log
sql/006_agentes_schema.sql           — agentes table formalization
sql/007_solicitudes_minor_gaps.sql   — minor column gaps: base_calculo, nombre_agente, week/year
```

For bulk updates / deletes / backfills, use `supabase/data-fixes/` with backup/apply/restore/verify artifacts.

See:
- [supabase/README.md](./supabase/README.md)
- [supabase/CHANGE_SAFETY.md](./supabase/CHANGE_SAFETY.md)
- [supabase/reconciliation/README.md](./supabase/reconciliation/README.md)
- [DOMAIN_MODEL.md](./DOMAIN_MODEL.md#migration-files)

### Operational DB workflow

From the repo root:

```bash
npm run db:project-ref
npm run db:link
export SUPABASE_DB_URL=<remote connection string>
npm run db:pull:remote
npm run db:reconcile
npm run db:new-migration -- <change_slug>
```

This is the path for the next structural ASTRO DB change. Bulk corrections still go through `supabase/data-fixes/`.

---

## Deploy

Deploy via [Vercel](https://vercel.com). Required environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
ANTHROPIC_API_KEY
```
