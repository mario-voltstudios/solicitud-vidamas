'use server'

import { google } from 'googleapis'
import { createServerClient } from '@/lib/supabase'

const DRIVE_ROOT_FOLDER_ID = '1vb0c_2rwdNum24KWmexqhdiDuiBwVRQe'
const BUCKET = 'solicitud-docs'

function getDriveClient() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')

  const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson

  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  // Use domain-wide delegation to impersonate mario@veseguro.com
  const authClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: 'mario@veseguro.com',
  })

  return google.drive({ version: 'v3', auth: authClient })
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  // Search for existing folder
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  const res = await drive.files.list({ q: query, fields: 'files(id,name)', spaces: 'drive' })
  const files = res.data.files || []
  if (files.length > 0 && files[0].id) return files[0].id

  // Create new folder
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return folder.data.id!
}

function docKeyToFilename(docKey: string, filePath: string): string {
  // Extract extension from the stored path
  const ext = filePath.split('.').pop() || 'jpg'
  // Map docKey to friendly filename
  const nameMap: Record<string, string> = {
    ine_frente: 'INE_frente',
    ine_reverso: 'INE_reverso',
    talon: 'talon',
    solicitud_p1: 'solicitud_p1',
    solicitud_p2: 'solicitud_p2',
    solicitud_p3: 'solicitud_p3',
    solicitud_p4: 'solicitud_p4',
    solicitud_p5: 'solicitud_p5',
    solicitud_p6: 'solicitud_p6',
    video: 'video',
  }
  const baseName = nameMap[docKey] || docKey
  return `${baseName}.${ext}`
}

export async function backupFilesToDrive(
  folio: string,
  docs: Record<string, string> // docKey -> supabase storage path
): Promise<void> {
  if (!docs || Object.keys(docs).length === 0) {
    console.log('[Drive] No files to backup')
    return
  }

  const drive = getDriveClient()
  const supabase = createServerClient()

  // Create subfolder for this folio
  const folioFolderId = await findOrCreateFolder(drive, folio, DRIVE_ROOT_FOLDER_ID)
  console.log(`[Drive] Folio folder created/found: ${folioFolderId}`)

  // Upload each file
  for (const [docKey, storagePath] of Object.entries(docs)) {
    if (!storagePath) continue

    try {
      // Download from Supabase Storage
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(storagePath)
      if (error || !blob) {
        console.error(`[Drive] Failed to download ${storagePath}:`, error)
        continue
      }

      // Convert Blob to Buffer
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const filename = docKeyToFilename(docKey, storagePath)
      const mimeType = blob.type || (storagePath.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')

      // Upload to Drive
      const { Readable } = await import('stream')
      const stream = Readable.from(buffer)

      await drive.files.create({
        requestBody: {
          name: filename,
          parents: [folioFolderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id,name',
      })

      console.log(`[Drive] Uploaded ${filename} to folio folder`)
    } catch (err) {
      console.error(`[Drive] Error uploading ${docKey}:`, err)
    }
  }

  console.log(`[Drive] Backup complete for folio ${folio}`)
}
