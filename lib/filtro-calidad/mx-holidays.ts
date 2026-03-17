// ============================================================
// Filtro de Calidad v1 — Mexico Public Holidays
// lib/filtro-calidad/mx-holidays.ts
// Created: 2026-03-17
// ============================================================
//
// Provides a deterministic isHolidayMX(date) function for use in
// expediente-sla.ts business-day calculations.
//
// SOURCE: Ley Federal del Trabajo, Art. 74 (mandatory national holidays)
//   + Decreto de días de descanso obligatorio (official list).
//   Covers: 2025, 2026, 2027 (extendable).
//
// DESIGN:
//   - Hardcoded ISO date strings — zero network dependency, fully deterministic.
//   - Covers mandatory federal holidays only (not regional/state holidays).
//   - Extend by adding year buckets below.
// ============================================================

/** ISO date string set of Mexican federal holidays */
const MX_HOLIDAY_DATES = new Set<string>([
  // ── 2025 ──────────────────────────────────────────────────
  '2025-01-01', // Año Nuevo
  '2025-02-03', // Constitución (1st Monday of February)
  '2025-03-17', // Natalicio de Benito Juárez (3rd Monday of March)
  '2025-05-01', // Día del Trabajo
  '2025-09-16', // Día de la Independencia
  '2025-11-17', // Revolución Mexicana (3rd Monday of November)
  '2025-12-25', // Navidad

  // ── 2026 ──────────────────────────────────────────────────
  '2026-01-01', // Año Nuevo
  '2026-02-02', // Constitución (1st Monday of February)
  '2026-03-16', // Natalicio de Benito Juárez (3rd Monday of March)
  '2026-05-01', // Día del Trabajo
  '2026-09-16', // Día de la Independencia
  '2026-11-16', // Revolución Mexicana (3rd Monday of November)
  '2026-12-25', // Navidad

  // ── 2027 ──────────────────────────────────────────────────
  '2027-01-01', // Año Nuevo
  '2027-02-01', // Constitución (1st Monday of February)
  '2027-03-15', // Natalicio de Benito Juárez (3rd Monday of March)
  '2027-05-01', // Día del Trabajo (Saturday → observed Fri 2027-04-30)
  '2027-04-30', // Día del Trabajo (observed, Sat→Fri)
  '2027-09-16', // Día de la Independencia
  '2027-11-15', // Revolución Mexicana (3rd Monday of November)
  '2027-12-25', // Navidad (Saturday → observed Fri 2027-12-24)
  '2027-12-24', // Navidad (observed)
])

/**
 * Returns true if the given date is a Mexican federal holiday.
 * Uses the date's local calendar day in the YYYY-MM-DD format.
 *
 * Pass this directly to addBusinessDays / countBusinessDays in expediente-sla.ts.
 *
 * @example
 *   addBusinessDays(issueDate, 5, isHolidayMX)
 */
export function isHolidayMX(date: Date): boolean {
  const iso = toISODateLocal(date)
  return MX_HOLIDAY_DATES.has(iso)
}

/**
 * Convert a Date to YYYY-MM-DD using UTC (avoids timezone-shift artifacts).
 * All holiday dates are in YYYY-MM-DD format and represent calendar days in MX.
 */
function toISODateLocal(date: Date): string {
  // Use UTC to avoid local-timezone offset shifting the date
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Get all holiday dates for a given year.
 * Useful for diagnostics / test assertions.
 */
export function getHolidaysForYear(year: number): string[] {
  return [...MX_HOLIDAY_DATES].filter(d => d.startsWith(`${year}-`)).sort()
}
