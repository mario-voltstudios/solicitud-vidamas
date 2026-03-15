# Solicitud VidaMás — Intake Form

Next.js wizard for capturing VidaMás insurance applications (solicitudes). Submits to Supabase with fire-and-forget backups to Google Sheets, Airtable, and Google Drive.

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

Apply these SQL files to Supabase **in order**:

```
sql/001_solicitudes_normalized.sql   — beneficiarios normalization + back-fill
sql/002_poliza_reconciliation.sql    — polizas + reconciliation_checks tables
sql/003_recibos_lifecycle.sql        — recibos lifecycle model + views
sql/004_solicitud_documentos.sql     — document tracking table (NEW)
sql/005_solicitud_status_history.sql — append-only status audit log (NEW)
sql/006_agentes_schema.sql           — agentes table formalization (NEW)
sql/007_solicitudes_minor_gaps.sql   — minor column gaps: base_calculo, nombre_agente, week/year (NEW)
```

See [DOMAIN_MODEL.md](./DOMAIN_MODEL.md#migration-files) for the full schema overview.

---

## Deploy

Deploy via [Vercel](https://vercel.com). Required environment variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
AIRTABLE_TOKEN
AIRTABLE_BASE_ID
ANTHROPIC_API_KEY
```
