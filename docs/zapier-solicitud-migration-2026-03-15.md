# Zapier Solicitud Digital — Migration Report

> **Date:** 2026-03-15  
> **Author:** Jarvis (sub-agent)  
> **Status:** Analysis based on context clues, existing codebase, and operational docs (no raw Zapier JSON export found on disk)

---

## Executive Summary

Three live Zapier zaps power the legacy "Solicitud Digital Vida Más" pipeline. Together they handle intake → validation → finalization/send. The new `solicitud-vidamas` Next.js app + Supabase already replaces ~70% of ZAP 1111's intake logic and ZAP 1191's Airtable writes. What remains is: PDF merge/generation, Drive folder routing by assignee, duplicate validation (ZAP 835), and the email/notification send step.

---

## 1. The Three Live Zaps

### ZAP 1111 — "Nueva Solicitud Digital Vida Mas 2023" (Intake/Build)

**Trigger:** New row in Google Sheet "Solicitudes Vida Mas 2022" (likely via Paperform webhook → Sheet)

**Reconstructed flow:**

| Step | Action | System | Detail |
|------|--------|--------|--------|
| 1 | Trigger on new row | Google Sheets | Sheet: "Solicitudes Vida Mas 2022" |
| 2 | Call ZAP 835 | Zapier (sub-zap) | Duplicate/exists check — passes folio + contratante |
| 3 | Lookup agent | Airtable | Table: AGENTES (`tblCzyD81OuIkHEep`), key: clave_agente |
| 4 | Lookup contratante | Airtable | Table: Contratantes, match on name/RFC |
| 5 | Lookup existing póliza | Airtable | Table: POLIZAS (`tblQx1hUA3JoDgcH0`), check for duplicates |
| 6 | Conditional: dependencia routing | Zapier Paths | Different doc handling per dependencia (IMSS, SEP, GOB, etc.) |
| 7 | PDF merge | PDF.co / Zapier PDF merge | Template: `merge2024v2.pdf` — merges solicitud pages + docs into single PDF |
| 8 | Upload to Drive | Google Drive | Folder routing by assignee (agent's supervisor/gerencia folder) |
| 9 | Create/update Airtable record | Airtable | POLIZAS table — status "Solicitud Recibida" + metadata |
| 10 | Multiple file paths | Google Drive | INE, talón, carta, solicitud pages routed to named subfolders |

**Key integrations:** Google Sheets (read), Airtable (read/write across 3+ tables), Google Drive (create folders, upload files), PDF merge service, Zapier sub-zap call

### ZAP 835 — "Valida Existe Solicitud Digital" (Validation)

**Trigger:** Called by ZAP 1111 (sub-zap / webhook)

**Reconstructed flow:**

| Step | Action | System | Detail |
|------|--------|--------|--------|
| 1 | Receive folio + contratante data | Zapier webhook | From ZAP 1111 |
| 2 | Search Drive folder | Google Drive | Check if folio folder already exists |
| 3 | Search Airtable | Airtable | POLIZAS table — match on contratante name + dependencia |
| 4 | Return exists/not-exists | Zapier response | Boolean + existing record ID if found |

**Purpose:** Prevents duplicate solicitudes from creating duplicate folders/records. Guards against agents re-submitting the same person.

### ZAP 1191 — "2024 BUENA Solicitud Digital Vida Mas 2023 - Envío" (Send/Finalize)

**Trigger:** Status change or manual trigger (likely when solicitud is approved for emission)

**Reconstructed flow:**

| Step | Action | System | Detail |
|------|--------|--------|--------|
| 1 | Read from Prospera/Solicitudes table | Airtable | Solicitudes tracking table |
| 2 | Lookup agent details | Airtable | AGENTES table — get email, phone, gerencia |
| 3 | Lookup contratante | Airtable | Contratantes table |
| 4 | Lookup póliza | Airtable | POLIZAS table |
| 5 | Generate/retrieve final PDF | Google Drive | Merged solicitud PDF |
| 6 | Send notification | Email / WhatsApp? | Notify agent + internal team that solicitud is ready |
| 7 | Update status | Airtable | Mark as "Enviada" or "En Emisión" |

**Purpose:** The "output" side — once a solicitud passes validation, this zap packages it and notifies relevant parties.

---

## 2. Dependency Map — External Systems

| System | Used By | Access Type | Purpose |
|--------|---------|-------------|---------|
| **Google Sheets** | ZAP 1111 | Read (trigger) | "Solicitudes Vida Mas 2022" — intake source |
| **Airtable — AGENTES** | 1111, 1191 | Read | Agent lookup (clave, name, email, gerencia) |
| **Airtable — Contratantes** | 1111, 1191 | Read | Contratante lookup/validation |
| **Airtable — POLIZAS** | 1111, 835, 1191 | Read/Write | Core tracking table |
| **Airtable — Solicitudes** | 1191 | Read | Solicitud status tracking (Prospera base?) |
| **Google Drive** | 1111, 835, 1191 | Read/Write/Create | Folder creation, file upload, existence checks |
| **PDF merge service** | 1111 | Write | `merge2024v2.pdf` template — merges multi-page solicitud |
| **Email** | 1191 | Send | Notifications to agents/team |
| **Zapier sub-zap** | 1111→835 | Internal | Validation call |

### Airtable Tables Referenced

| Table | Base | Table ID | Used For |
|-------|------|----------|----------|
| POLIZAS | app4s0fxoSQStY8Jn | tblQx1hUA3JoDgcH0 | Core policy records |
| AGENTES | app4s0fxoSQStY8Jn | tblCzyD81OuIkHEep | Agent directory |
| Contratantes | app4s0fxoSQStY8Jn | (unknown ID) | Contratante records |
| Solicitudes (Prospera) | (unknown) | (unknown) | Solicitud tracking for send step |

### Google Drive Structure

- Root folder per gerencia/assignee
  - Subfolder per folio (e.g., `5156-2026-S08-01`)
    - INE_frente, INE_reverso
    - Talon
    - Solicitud pages (1-6)
    - Carta instrucción
    - Video
    - Merged PDF (`merge2024v2.pdf` output)

---

## 3. Minimum Permissions/Scopes for Replacement

| Service | Scope | Why |
|---------|-------|-----|
| Google Sheets | `spreadsheets.readonly` | Read trigger rows (can retire if Paperform → Supabase direct) |
| Google Drive | `drive` (full) | Create folders, upload files, search for existence |
| Airtable | Read/write on POLIZAS, AGENTES, Contratantes | Agent lookup, record create/update, duplicate check |
| PDF generation | Server-side PDF library (pdf-lib, puppeteer) | Replace Zapier PDF merge — merge solicitud pages into single PDF |
| Email (SMTP/API) | Send | Notification to agents when solicitud ready |
| Supabase | Full access to `solicitudes`, `agentes`, `polizas` | Already in place for new wizard |

---

## 4. Migration Classification

### ✅ Must Replicate Now

| Behavior | Current Owner | Replacement |
|----------|---------------|-------------|
| **Duplicate detection** (ZAP 835) | Zapier sub-zap | Supabase query: check `solicitudes` for matching contratante + dependencia before insert. Already partially done in `actions.ts` folio generation. |
| **Drive folder creation + file upload** | ZAP 1111 | Already implemented in `lib/google-drive.ts` — creates folio folder, uploads docs from Supabase Storage. **Needs:** assignee-based routing (gerencia folders). |
| **Airtable POLIZAS write** | ZAP 1111 | Already implemented in `lib/airtable.ts` — writes 6 summary fields. Sufficient for legacy compatibility. |
| **Agent lookup/validation** | ZAP 1111 | Already implemented — `actions.ts` validates clave against `agentes` table in Supabase. |
| **PDF merge** (multi-page solicitud → single PDF) | ZAP 1111 via PDF.co | **NOT yet replicated.** Need server-side PDF merge using `pdf-lib` or equivalent. Template: `merge2024v2.pdf`. |
| **Notification on solicitud ready** | ZAP 1191 | **NOT yet replicated.** Need email/Discord notification when solicitud moves to "ready for emission." |

### 🔄 Should Improve/Change

| Behavior | Current Issue | Improvement |
|----------|---------------|-------------|
| **Google Sheets as trigger** | Fragile — depends on Paperform → Sheet → Zapier chain | Replace with direct Supabase webhook/trigger. New wizard already writes to Supabase. |
| **Dependencia-based conditional routing** | Zapier Paths — hard to maintain, opaque logic | Move to config-driven rules in code (`dependencia-rules.md` already exists). |
| **Drive folder structure by assignee** | Manual mapping in Zapier | Drive helper should accept gerencia/assignee from `agentes` table and route automatically. |
| **Airtable as source of truth** | 4 tables across read/write — creates sync issues | Supabase is already canonical. Airtable writes become fire-and-forget backup only. |
| **Sub-zap pattern (1111→835)** | Zapier-specific, adds latency and complexity | Inline the duplicate check as a Supabase RPC or pre-insert query. |
| **PDF template `merge2024v2.pdf`** | Static template, requires Zapier PDF service | Generate PDFs server-side; update template in code, version-controlled. |

### 🗑️ Can Retire

| Component | Why |
|-----------|-----|
| **Google Sheets "Solicitudes Vida Mas 2022" as intake** | New wizard writes directly to Supabase. Sheets append is already just a backup (`lib/google-sheets.ts`). |
| **ZAP 835 as a standalone zap** | Duplicate check becomes a simple DB query. No need for a separate zap. |
| **Zapier PDF.co integration** | Replace with `pdf-lib` (open source, no per-call cost). |
| **All 12+ historical/lineage zaps** (523, 593, 713, 724, 750, 774, 865, 969, 991, 1051, 1219) | Iterations/experiments that led to the current 3. Already superseded. |
| **Zapier MCP connector** | Once all 3 live zaps are replaced, the Zapier integration can be fully retired. |

---

## 5. Recommended Replacement Architecture

```
                    ┌─────────────────────────┐
                    │  solicitud-vidamas app   │
                    │  (Next.js + Supabase)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  submitSolicitud()       │
                    │  actions.ts              │
                    └────────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                     │
   ┌────────▼────────┐  ┌───────▼───────┐  ┌─────────▼─────────┐
   │ 1. Supabase     │  │ 2. Drive      │  │ 3. PDF merge      │
   │    INSERT        │  │    backup     │  │    (pdf-lib)       │
   │    + duplicate   │  │    + folder   │  │    server-side     │
   │    check (RPC)   │  │    routing    │  │                    │
   └────────┬────────┘  └───────┬───────┘  └─────────┬─────────┘
            │                    │                     │
   ┌────────▼────────┐          │            ┌────────▼────────┐
   │ 4. Airtable     │          │            │ 5. Notify       │
   │    backup       │          │            │    (email/       │
   │    (fire&forget)│          │            │     Discord)     │
   └─────────────────┘          │            └─────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │ 6. Sheets backup      │
                    │    (fire & forget)     │
                    └───────────────────────┘
```

**What's already built:** Steps 1, 2, 4, 6  
**What's missing:** Step 3 (PDF merge), Step 5 (notifications), enhanced duplicate check, assignee-based Drive routing

---

## 6. Unanswered Questions

| # | Question | Why It Matters |
|---|----------|----------------|
| 1 | **Where is the Zapier JSON export?** | The task references "attached export/screenshot" but no Zapier export file exists on disk. This analysis is reconstructed from context clues and code — a raw export would confirm exact step sequences. |
| 2 | **What is `merge2024v2.pdf`?** | Is it a fillable PDF template (form fields) or a cover page merged with uploaded docs? Determines PDF generation approach. |
| 3 | **Drive folder routing rules by assignee** | How are agents mapped to supervisor folders? Is it by gerencia, oficina, or a manual mapping table? |
| 4 | **ZAP 1191 notification recipients** | Who exactly gets notified? Agent only? Gerente? Mario? What channel (email, WhatsApp, other)? |
| 5 | **Airtable Contratantes table ID** | Not found in codebase. Is it still actively used or was it retired? |
| 6 | **Prospera/Solicitudes Airtable table** | Referenced in ZAP 1191 context — is this a separate base or a view in the same base? |
| 7 | **Are any of the 12 lineage zaps still receiving traffic?** | If Paperform still triggers old zaps, they may be silently creating records. Need to check Zapier task history. |
| 8 | **PDF.co or native Zapier PDF action?** | Determines if there's a PDF.co API key to retire or just a Zapier built-in. |

---

## 7. Cost Impact

| Item | Current (Zapier) | After Migration |
|------|-------------------|-----------------|
| Zapier plan | ~$20-70/mo (depends on task volume) | $0 |
| PDF.co | ~$5-15/mo (if used) | $0 (pdf-lib is free) |
| Airtable | Still needed short-term for Stacker | Retire when Stacker migrates to Supabase |
| Google Drive | Same | Same |
| Supabase | Already paying | Same |

**Net savings:** $25-85/mo + elimination of Zapier as a fragile dependency in the critical solicitud pipeline.

---

## 8. Recommended Next Steps

1. **Locate or re-export the Zapier JSON** — Confirm exact step sequences for all 3 zaps
2. **Build PDF merge** — Server-side `pdf-lib` function in `solicitud-vidamas` that merges uploaded doc pages into a single solicitud PDF
3. **Add notification step** — Email or Discord alert when solicitud is submitted and ready for emission
4. **Enhance duplicate check** — Supabase RPC that checks for matching contratante + dependencia within recent timeframe
5. **Add assignee-based Drive routing** — Look up agent's gerencia from `agentes` table, create/find the correct parent folder
6. **Turn off ZAP 835 first** (lowest risk — duplicate check is easily replaced)
7. **Turn off ZAP 1111 after** confirming new wizard handles all intake paths
8. **Turn off ZAP 1191 last** — requires notification replacement to be in place
