# WORKLOG — INTAKE-V2-T08: Tarifario Validation + Quote Confirmation

## Status: ✅ COMPLETE

## What was built

### 1. `app/api/quote/route.ts` (NEW)
- POST endpoint that calls `get_vida_mas_quote()` RPC on Supabase
- Input validation: plan, prima > 0, edad 15-65, genero M/F
- Returns `{ success, quote: { suma_asegurada, edad_calculo, descuentos_aplicados, prima_quincenal, plan, risk_type, data_quality } }`

### 2. `lib/tarifarios.ts` (NEW)
- `calcularEdad(fechaNac)` — age from DOB
- `fetchQuote(formData)` — client-side fetcher that maps form fields to API params
- `validateQuoteForDependencia(quote, formData)` — validates quote against form data (prima match, data quality, valid GNP plans)
- `normalizePlanName(plan)` — case normalization

### 3. `components/wizard/StepTarifario.tsx` (NEW)
- Auto-fetches quote on step entry
- Shows parameters used (plan, prima, edad, genero)
- Displays quote card: plan name, prima quincenal/mensual, suma asegurada, descuentos, cobertura details
- Validates against dependencia rules, shows warnings
- User MUST confirm quote before proceeding
- "Recotizar" option to go back and change parameters
- Stores `QuoteConfirmation` in FormData

### 4. `lib/types.ts` (MODIFIED)
- Added `QuoteConfirmation` interface
- Added `quote_confirmation?: QuoteConfirmation` to `FormData`

### 5. Wizard flow updated
- `app/solicitud/page.tsx` — Step 6 = Tarifario (new), Steps 7-9 shifted
- `components/WizardProgress.tsx` — 9 steps, "Cotización" label for step 6

### 6. `qa/tests/tarifario-validation.test.ts` (NEW)
- 30 tests covering: calcularEdad, normalizePlanName, validateQuoteForDependencia, quote parameter validation, edge cases

## Verification results
- ✅ `npx jest qa/tests/ocr.test.ts --runInBand` — 51/51 pass (regression)
- ✅ `npx jest qa/tests/tarifario-validation.test.ts --runInBand` — 30/30 pass
- ✅ `npx jest --runInBand` — 260/260 pass (all 9 suites)
- ✅ `npx tsc --noEmit` — passes cleanly
- ✅ `npm run build` — compiles and generates all pages

## Architecture notes
- The quoting engine (`get_vida_mas_quote` RPC) already existed — this task wires it into the UI
- Step appears between Plan (step 5) and Beneficiarios (now step 7)
- Quote confirmation is stored in `formData.quote_confirmation` and persisted via localStorage
- The StepReview component can be enhanced later to display the confirmed quote details
