#!/usr/bin/env bash
# ============================================================
# Solicitud VidaMás — Automated QA Runner
# Usage:  ./qa/run-qa.sh [--ci]
#
# Outputs:
#   qa/reports/report-YYYY-MM-DD.md   — human-readable pass/fail
#   qa/reports/junit.xml               — CI-compatible JUnit XML
#   qa/artifacts/                      — evidence artifacts
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_DIR="$REPO_DIR/qa"
REPORTS_DIR="$QA_DIR/reports"
ARTIFACTS_DIR="$QA_DIR/artifacts"
DATE="$(date +%Y-%m-%d)"
TIMESTAMP="$(date +%Y-%m-%dT%H:%M:%SZ)"
REPORT="$REPORTS_DIR/report-$DATE.md"

mkdir -p "$REPORTS_DIR" "$ARTIFACTS_DIR"

echo "🔍 VidaMás Intake QA — $TIMESTAMP"
echo "   Repo:    $REPO_DIR"
echo "   Report:  $REPORT"
echo ""

# ── Install deps if needed ────────────────────────────────────────────────────
if ! "$REPO_DIR/node_modules/.bin/jest" --version &>/dev/null 2>&1; then
  echo "📦 Installing QA dependencies..."
  cd "$REPO_DIR"
  npm install --save-dev jest @types/jest ts-jest jest-junit 2>&1 | tail -3
fi

# ── Run Jest with JSON reporter ───────────────────────────────────────────────
cd "$QA_DIR"
JEST_OUT="$ARTIFACTS_DIR/jest-results-$DATE.json"

set +e
"$REPO_DIR/node_modules/.bin/jest" \
  --config "$QA_DIR/jest.config.js" \
  --json --outputFile="$JEST_OUT" \
  --forceExit \
  2>"$ARTIFACTS_DIR/jest-stderr-$DATE.txt"
JEST_EXIT=$?
set -e

# ── Parse results with Node ───────────────────────────────────────────────────
node - "$JEST_OUT" "$REPORT" "$TIMESTAMP" "$DATE" <<'EOF'
const fs = require('fs')
const [,, jsonFile, reportFile, timestamp, date] = process.argv

let results
try {
  results = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
} catch (e) {
  console.error('Could not parse Jest JSON output:', e.message)
  process.exit(1)
}

const { numTotalTests, numPassedTests, numFailedTests, numPendingTests, testResults } = results
const passRate = numTotalTests > 0 ? ((numPassedTests / numTotalTests) * 100).toFixed(1) : '0.0'
const status = numFailedTests === 0 ? '✅ PASSED' : '❌ FAILED'

const lines = []
lines.push(`# VidaMás Intake QA Report`)
lines.push(``)
lines.push(`**Date:** ${date}  `)
lines.push(`**Run at:** ${timestamp}  `)
lines.push(`**Status:** ${status}  `)
lines.push(`**Pass rate:** ${passRate}% (${numPassedTests}/${numTotalTests} tests)  `)
lines.push(``)
lines.push(`---`)
lines.push(``)
lines.push(`## Summary`)
lines.push(``)
lines.push(`| Metric | Count |`)
lines.push(`|--------|-------|`)
lines.push(`| ✅ Passed | ${numPassedTests} |`)
lines.push(`| ❌ Failed | ${numFailedTests} |`)
lines.push(`| ⏭️ Skipped | ${numPendingTests} |`)
lines.push(`| Total | ${numTotalTests} |`)
lines.push(``)

if (numFailedTests > 0) {
  lines.push(`## ❌ Failures`)
  lines.push(``)
  for (const suite of testResults) {
    const failed = suite.testResults.filter(t => t.status === 'failed')
    if (failed.length === 0) continue
    const suiteName = suite.testFilePath.split('/qa/tests/')[1] || suite.testFilePath
    lines.push(`### ${suiteName}`)
    lines.push(``)
    for (const t of failed) {
      lines.push(`- **${t.ancestorTitles.join(' > ')} > ${t.title}**`)
      if (t.failureMessages && t.failureMessages.length > 0) {
        const msg = t.failureMessages[0].split('\n').slice(0,5).join('\n    ')
        lines.push(`  \`\`\``)
        lines.push(`  ${msg}`)
        lines.push(`  \`\`\``)
      }
    }
    lines.push(``)
  }
}

lines.push(`## Test Suites`)
lines.push(``)
for (const suite of testResults) {
  const suiteName = suite.testFilePath.split('/qa/tests/')[1] || suite.testFilePath
  const passed = suite.testResults.filter(t => t.status === 'passed').length
  const failed = suite.testResults.filter(t => t.status === 'failed').length
  const icon = failed === 0 ? '✅' : '❌'
  lines.push(`### ${icon} ${suiteName}`)
  lines.push(``)
  lines.push(`| Test | Status |`)
  lines.push(`|------|--------|`)
  for (const t of suite.testResults) {
    const tIcon = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⏭️'
    const name = [...t.ancestorTitles, t.title].join(' › ')
    lines.push(`| ${name} | ${tIcon} |`)
  }
  lines.push(``)
}

lines.push(`---`)
lines.push(``)
lines.push(`## Automated vs Manual Coverage`)
lines.push(``)
lines.push(`### ✅ Automated (covered by this suite)`)
lines.push(``)
lines.push(`| Area | Tests |`)
lines.push(`|------|-------|`)
lines.push(`| Dependencia normalization (9 variants) | dependencia-rules.test.ts |`)
lines.push(`| Document requirements per dependencia (IMSS, IMSS Jub, ISSSTE, SEP, CDMX, CLABE) | dependencia-rules.test.ts |`)
lines.push(`| Missing doc detection (required vs optional) | dependencia-rules.test.ts |`)
lines.push(`| Beneficiario validation (sum=100%, empty, missing fields) | types-validation.test.ts |`)
lines.push(`| Contratante validation (required fields) | types-validation.test.ts |`)
lines.push(`| Asegurado validation + misma_persona mirror | types-validation.test.ts |`)
lines.push(`| extractAsegurado mirror logic | types-validation.test.ts |`)
lines.push(`| extractCobroInfo (nómina + CLABE) | types-validation.test.ts |`)
lines.push(`| validateSolicitudEntities end-to-end | types-validation.test.ts |`)
lines.push(`| Dropdown constants (PARENTESCOS, ESTADOS_MX, DEPENDENCIAS) | types-validation.test.ts |`)
lines.push(`| Intake status derivation (pending_docs/pending_verification/ready) | intake-status.test.ts |`)
lines.push(`| Folio suggestion by dependencia | release-folder-rules.test.ts |`)
lines.push(`| Tipo contratacion mapping | release-folder-rules.test.ts |`)
lines.push(`| FOLIO_RULES integrity (format, uniqueness) | release-folder-rules.test.ts |`)
lines.push(``)
lines.push(`### 🔲 Remaining Manual Checks`)
lines.push(``)
lines.push(`| Check | Why Manual | Priority |`)
lines.push(`|-------|-----------|----------|`)
lines.push(`| Wizard step navigation (next/back buttons) | Requires browser + React state | P1 |`)
lines.push(`| File upload → Supabase Storage path saved | Requires live Supabase connection | P1 |`)
lines.push(`| INE OCR extraction (Anthropic Vision API) | Requires real API keys + image | P1 |`)
lines.push(`| Form submission → Supabase row insert | Requires live Supabase DB | P1 |`)
lines.push(`| Airtable write (6 fields summary) | Requires live Airtable API | P2 |`)
lines.push(`| Google Sheets backup row | Requires live Google API | P2 |`)
lines.push(`| Google Drive file backup | Requires live Google API | P2 |`)
lines.push(`| Folio generation (week/year/increment) | Requires live Supabase sequence | P2 |`)
lines.push(`| Agent clave lookup validation | Requires live agentes table | P2 |`)
lines.push(`| CLABE 18-digit validation in UI | UI-level, tested via form validation code | P3 |`)
lines.push(`| Firma (signature canvas) capture + base64 | Requires browser canvas | P3 |`)
lines.push(`| Beneficiario 100% sum enforcement in UI | UI-level component behavior | P3 |`)
lines.push(``)
lines.push(`---`)
lines.push(`*Generated by qa/run-qa.sh — solicitud-vidamas QA suite*`)

fs.writeFileSync(reportFile, lines.join('\n'))
console.log(lines.join('\n'))
EOF

# ── Print summary ─────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Report saved: $REPORT"
echo "  Artifacts:    $ARTIFACTS_DIR/jest-results-$DATE.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $JEST_EXIT
