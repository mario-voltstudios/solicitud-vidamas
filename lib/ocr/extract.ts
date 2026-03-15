import { getOCRProvider } from './provider'
import type { OCRDocumentType } from './types'

export async function extractDocument(storagePath: string, type: OCRDocumentType) {
  const provider = getOCRProvider()
  return provider.extract({ storagePath, type })
}
