# VidaMás Digital Solicitud — Archaeology Report

> **Date:** 2026-03-15 | **Author:** Jarvis (sub-agent)

---

## TL;DR

There are **three generations** of the digital solicitud, plus the Zapier glue layer that held everything together in between. The newest code (`prospera-new`) is Rafa's redesign with AI-powered OCR and a .NET backend — it's the most ambitious but incomplete. The `solicitud-vidamas` repo is Jarvis's recent MVP wizard that's functional but simpler. The original system was Paperform → Zapier → Google Sheets/Drive/PDF filler → Airtable.

---

## 1. Historical Lineage

### Generation 0: Paper Solicitud (ongoing)
- GNP's official 6-page PDF form, still in use
- Field mapping documented in `emisiones-ref/solicitud-pdf-mapping.md`
- Agents print, fill by hand, photograph/scan pages, upload

### Generation 1: Paperform (2023–present, still live)
- **URL:** `vidamas.paperform.co` (form ID `xqui5ohw`)
- **5,038+ submissions** as of Feb 2026 — this is the workhorse
- 14 sections, ~80+ fields covering agent info → contratante → cobro → asegurado → plan → beneficiarios (5 slots) → document uploads → signature pages
- Complete field mapping in `emisiones-ref/paperform-field-mapping.md`
- **Key limitation:** Fixed 5 beneficiary slots, no OCR, no real-time validation, no offline support, clunky conditional logic

### Generation 1.5: Zapier Glue Layer (2023–present)
- **~12+ Zaps** forming the pipeline from Paperform to everywhere:
  - **ZAP 1111** (2023-07-10): "Nueva Solicitud Digital Vida Mas 2023" — main intake webhook
  - **ZAP 835**: "Valida Existe Solicitud digital" — dedup check
  - **ZAP 1191** (2024): "BUENA Solicitud Digital Vida Mas 2023 - Envío" — the blessed/working submission handler
  - Earlier lineage (ZAPs 523→593→713→724→750→774→865→969→991→1051→1219) shows heavy iteration — many attempts at getting the pipeline right
- Pipeline: Paperform submission → validate → write to Google Sheet → upload docs to Drive → fill PDF template → write summary to Airtable → notify agent
- **Status:** Still running. ZAP 1191 appears to be the current "good" one.

### Generation 2: `solicitud-vidamas` (Jarvis, March 2026)
- **Repo:** GitHub `solicitud-vidamas`
- **Stack:** Next.js 15, React, Supabase, shadcn/ui
- **8-step wizard:** Agent → Contratante → Cobro → Asegurado → Plan → Beneficiarios → Documentos → Review/Firma
- **Features built:**
  - ✅ Full typed domain model (`lib/types.ts`) with entity extractors and validators
  - ✅ Agent clave validation against Supabase `agentes` table
  - ✅ Auto folio generation (`{clave}-{year}-S{week}-{seq}`)
  - ✅ INE OCR via Claude 3.5 Sonnet (server action)
  - ✅ localStorage offline persistence
  - ✅ Fire-and-forget backups to Google Sheets, Airtable, Google Drive
  - ✅ Supabase submission with beneficiarios
  - ✅ Comprehensive SQL schema (3 migrations: solicitudes_normalized, poliza_reconciliation, recibos_lifecycle)
  - ✅ Gap analysis (`GAP_ANALYSIS.md`) documenting all Airtable↔Supabase gaps
- **What's missing:** No `.NET` backend, no paycheck OCR, no session management, no multi-file AI extraction pipeline, no e-signature capture widget (firma_base64 field exists but no canvas)

### Generation 3: `prospera-new` (Rafa, Dec 2025–Jan 2026)
- **Repo:** Bitbucket `voltstudiosdev/prospera-new`
- **Stack:** Next.js 16, React 19, Supabase, .NET backend (ProsperaServices), AI processing (C#), Zod v4
- **Architecture — much more ambitious:**
  - **Step 1: Document Upload + AI Extraction** — upload INE (front+back), paycheck, carta de instrucción → C# backend with AI prompt templates extracts all data automatically
  - **Step 2: Review Extracted Info** — pre-filled form from OCR, user corrects
  - **Step 3: Signature/Firma** — contract signing step
  - **Step 4: Agent Info** — agent details
  - **Step 5: Submit**
- **AI Processing (.NET):**
  - `ExtractIdInformationPrompt.yml` — INE front: nombre, domicilio, CURP, fecha_nac, sexo
  - `ExtractIdInformationBackPrompt.yml` — INE back: ID number
  - `ExtractInformationPaycheck.yml` — Paycheck: RFC, dependencia, sub-dependencia, matrícula
  - `ExtractInformationFromCartaPrompt.yml` — Carta de instrucción
  - `ExtractPolicyInformationPrompt.yml` — Policy data
  - `FixJsonTemplate.yml` — JSON repair prompt
  - Session management with encryption (AES-256)
  - `ShortIdGenerator` for session IDs
- **Frontend has:**
  - Form context with multi-step state management
  - File upload hooks with progress tracking
  - Extracted info panel for review
  - Zod validation schemas for each step
  - Delegation types, gender mapping, hiring types
- **Supabase migrations:** 8 migrations (schema for agentes, policies, commissions, receipts, XML processing)
- **Edge functions:** `process-xml-data` (receipt XML processing), `air-table-fetch` (Airtable sync)
- **What's incomplete:** No beneficiarios step, no plan selection step, limited cobro details, no Paperform bridge, no Google Sheets/Drive backup, frontend has ~4 steps vs the 8 needed

---

## 2. Comparison Matrix

| Feature | Paperform+Zapier | solicitud-vidamas | prospera-new |
|---------|-----------------|-------------------|--------------|
| Agent validation | ❌ Manual | ✅ Supabase lookup | ✅ API call |
| INE OCR | ❌ None | ✅ Claude (basic) | ✅ .NET AI (structured) |
| Paycheck OCR | ❌ None | ❌ None | ✅ .NET AI |
| Carta OCR | ❌ None | ❌ None | ✅ .NET AI |
| INE back OCR | ❌ None | ❌ None | ✅ .NET AI |
| Pre-fill from OCR | ❌ | Partial (INE only) | ✅ Full pipeline |
| Contratante fields | ✅ Complete | ✅ Complete | ✅ Complete |
| Asegurado fields | ✅ Complete | ✅ Basic (no CURP/addr) | ❌ Not built yet |
| Cobro/Nómina | ✅ Complete | ✅ Complete | ❌ Partial |
| Plan selection | ✅ Complete | ✅ Complete | ❌ Not built |
| Beneficiarios | ✅ 5 fixed slots | ✅ Dynamic (1+) | ❌ Not built |
| Document upload | ✅ Paperform files | ✅ Basic | ✅ With AI processing |
| Firma/signature | ✅ Photo upload | 🔸 Field exists, no widget | ✅ Step exists |
| Offline support | ❌ | ✅ localStorage | ❌ |
| Supabase write | ❌ (via Zapier) | ✅ Direct | ✅ Via API |
| Airtable backup | ✅ (via Zapier) | ✅ Fire-and-forget | ✅ Edge function |
| Google Sheets backup | ✅ (via Zapier) | ✅ Fire-and-forget | ❌ |
| Google Drive backup | ✅ (via Zapier) | ✅ Fire-and-forget | ❌ |
| PDF filling | ✅ (via Zapier) | ❌ | ❌ |
| Session/encryption | ❌ | ❌ | ✅ AES-256 |
| Tech currency | Paperform (hosted) | Next.js 15 / React 18 | Next.js 16 / React 19 |
| Status | **Production** | **MVP, built not deployed** | **Incomplete prototype** |

---

## 3. What Should Be Reused

### From `prospera-new` (Rafa) ✅ CARRY FORWARD
1. **AI OCR prompt templates** — the 6 YAML prompt templates are well-structured and tested for INE front/back, paycheck, carta, policy extraction. These are gold.
2. **File upload UX** — `file-upload.tsx` + `use-file-upload.ts` hook with progress tracking is more polished than solicitud-vidamas's basic approach
3. **Extracted info panel** — `extracted-info-panel.tsx` for reviewing/correcting OCR results
4. **Session management with encryption** — AES-256 encryption service, session caching, short ID generator
5. **Zod validation schemas** — step2/3/4 schemas are well-defined
6. **Type definitions** — `delegations.ts`, `gender.ts`, `hiringType.ts`, `paycheck-result.ts`, `id-result.ts`
7. **Supabase Edge Functions** — `process-xml-data` and `air-table-fetch` are useful infrastructure

### From `solicitud-vidamas` (Jarvis) ✅ CARRY FORWARD
1. **Complete domain model** — `lib/types.ts` is the most complete typed model of the solicitud, with entity extractors and validators
2. **Full wizard flow (8 steps)** — covers ALL sections of the paper solicitud
3. **Beneficiarios with dynamic slots** — better than Paperform's fixed 5
4. **Folio generation logic** — `{clave}-{year}-S{week}-{seq}` in `actions.ts`
5. **SQL schema** — 3 migrations covering solicitudes, póliza reconciliation, recibos lifecycle
6. **Gap analysis** — `GAP_ANALYSIS.md` is a comprehensive audit of what's missing
7. **Backup integrations** — Google Sheets, Airtable, Drive backup functions
8. **Offline localStorage persistence** — important for agents in the field

### From Paperform+Zapier ✅ KEEP AS REFERENCE
1. **Field mapping** — `paperform-field-mapping.md` is the canonical field list (80+ fields with keys)
2. **PDF mapping** — `solicitud-pdf-mapping.md` maps form fields to exact PDF template fields
3. **Business rules** — documented in paperform-field-mapping (signature pages, RFC ejecutivo, folio format, etc.)
4. **5,038 submission history** — valuable for testing/validation of the new system

---

## 4. What Should Be Retired

| Item | Action | Reason |
|------|--------|--------|
| Paperform form | **Phase out after new system is stable** | Still collecting production data; can't kill until replacement is proven |
| Zapier pipeline (12+ zaps) | **Retire after Supabase pipeline is live** | Fragile, hard to debug, many dead iterations |
| Airtable as primary store | **Demote to backup only** | Already happening — Supabase is canonical |
| `solicitudes_paperform` table | **ETL into `solicitudes` then archive** | Dual source of truth is the #1 architectural risk |
| .NET backend (ProsperaServices) | **Evaluate: port AI prompts to TypeScript/Python or keep** | Extra infrastructure; prompts could run via Vercel AI SDK |

---

## 5. Recommended Path Forward

**Merge the best of both repos into a single `solicitud-vidamas` (or new repo):**

1. **Use `solicitud-vidamas` as the base** — it has the complete wizard flow, domain model, and SQL schema
2. **Port Rafa's AI extraction pipeline** — bring the YAML prompt templates + file upload UX + extracted info panel into Step 1 (before the manual form)
3. **Add session management** from prospera-new (encryption, caching)
4. **Upgrade to Next.js 16 / React 19** to match prospera-new's tech stack
5. **Unify Paperform → Supabase** — ETL historical data, then point Paperform webhook directly to Supabase (or replace entirely)
6. **Build the PDF filler** — currently only Zapier does this; needs a server-side solution
7. **Deploy to Vercel** under existing team

### Priority Order:
1. AI document extraction (port from prospera-new) — biggest UX win
2. E-signature capture widget — needed for compliance
3. PDF auto-fill — replaces Zapier dependency
4. Paperform ETL — unifies data
5. Deploy + sunset Paperform

---

## 6. Evidence Index

| Artifact | Location | What it tells us |
|----------|----------|-----------------|
| Paperform field map | `emisiones-ref/paperform-field-mapping.md` | Complete field inventory + business rules |
| PDF field map | `emisiones-ref/solicitud-pdf-mapping.md` | How form data maps to GNP's PDF template |
| GNP solicitud template | `emisiones-ref/gnp-solicitud-vida-template.pdf` | The official PDF we must fill |
| GNP guía de llenado | `emisiones-ref/gnp-guia-llenado-solicitud.pdf` | GNP's instructions for filling the form |
| solicitud-vidamas types | `solicitud-vidamas/lib/types.ts` | Best domain model (276 lines, full validators) |
| solicitud-vidamas actions | `solicitud-vidamas/app/solicitud/actions.ts` | Server actions: INE OCR, agent validation, submit |
| solicitud-vidamas SQL | `solicitud-vidamas/sql/*.sql` | 3 normalized schema migrations |
| solicitud-vidamas gap analysis | `solicitud-vidamas/GAP_ANALYSIS.md` | Comprehensive Airtable↔Supabase gap audit |
| prospera-new AI prompts | `prospera-new/services/ProsperaServices/AIProcess/PromptTemplates/*.yml` | 6 AI extraction prompts |
| prospera-new frontend | `prospera-new/services/frontend/` | 4-step wizard with file upload + OCR |
| prospera-new .NET services | `prospera-new/services/ProsperaServices/` | Backend: AI processing, encryption, payment |
| prospera-new Supabase | `prospera-new/supabase/migrations/` | 8 migrations, edge functions |
| Zapier export | (attached to workspace) | 12+ zap lineage showing pipeline evolution |
