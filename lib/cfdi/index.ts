// ============================================================
// CFDI Validation Module — Entry Point
// lib/cfdi/index.ts
// Created: 2026-03-19
//
// Usage:
//   import { validateCFDI, cfdiValidationToFinding } from '@/lib/cfdi'
//   import { parseSATQRUrl, extractQRFromText } from '@/lib/cfdi'
//
// See validate-cfdi.ts for the main pipeline.
// See sat-validator.ts for SAT_VALIDATOR_PROVIDER env var config.
// See qr-extractor.ts for URL / text parsing utilities.
// ============================================================

export * from './types'
export * from './qr-extractor'
export * from './sat-validator'
export * from './native-qr-decoder'
export * from './validate-cfdi'
export * from './cfdi-to-finding'
