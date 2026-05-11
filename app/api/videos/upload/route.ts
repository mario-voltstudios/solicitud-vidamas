import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import { buildSolicitudS3Key, uploadSolicitudFileToS3, getSolicitudFileSignedUrl } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 120 // videos can take longer

const MAX_FILE_BYTES = 500 * 1024 * 1024 // 500MB
const execFileAsync = promisify(execFile)

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    let folio = ''
    let fileName = ''
    let fileContentType = 'video/mp4'
    let fileBuffer: Buffer | null = null

    if (contentType.includes('multipart/form-data')) {
      // Multipart upload (from form)
      const formData = await request.formData()
      folio = String(formData.get('folio') || '').trim()
      const file = formData.get('video') as File | null

      if (!file) {
        return NextResponse.json({ success: false, error: 'No se recibió archivo de video' }, { status: 400 })
      }

      fileName = file.name
      fileContentType = file.type || 'video/mp4'
      fileBuffer = Buffer.from(await file.arrayBuffer())
    } else {
      // JSON body for presigned URL flow
      const body = await request.json().catch(() => null)
      folio = String(body?.folio || '').trim()
      fileName = String(body?.fileName || 'video.mp4')
      fileContentType = String(body?.contentType || 'video/mp4')

      if (!body?.fileData) {
        return NextResponse.json({ success: false, error: 'No se recibieron datos de video' }, { status: 400 })
      }
      fileBuffer = Buffer.from(body.fileData, 'base64')
    }

    // Validation
    if (!folio) {
      return NextResponse.json({ success: false, error: 'Folio requerido' }, { status: 400 })
    }
    if (!fileBuffer) {
      return NextResponse.json({ success: false, error: 'Archivo de video requerido' }, { status: 400 })
    }
    if (fileBuffer.length > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: `Video demasiado grande. Máximo ${MAX_FILE_BYTES / 1024 / 1024}MB.` },
        { status: 413 }
      )
    }

    const isVideo = fileContentType.startsWith('video/')
    if (!isVideo) {
      return NextResponse.json({ success: false, error: 'Solo se aceptan archivos de video (mp4, mov)' }, { status: 400 })
    }

    // ── Compression via FFmpeg ──────────────────────────────
    if (!ffmpegPath) {
      return NextResponse.json({ success: false, error: 'FFmpeg no disponible en el servidor' }, { status: 500 })
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-upload-'))
    const inputPath = path.join(tmpDir, 'input.mp4')
    const outputPath = path.join(tmpDir, 'compressed.mp4')

    fs.writeFileSync(inputPath, fileBuffer)

    // Compress: H.264, CRF 28 (good quality/size tradeoff), max 720p, AAC audio
    await execFileAsync(ffmpegPath, [
      '-i', inputPath,
      '-vf', 'scale=min(1280\\,iw):-2', // max 720p width, preserve aspect
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ], { timeout: 180_000 }) // 3 min timeout for large videos

    const compressedBuffer = fs.readFileSync(outputPath)
    const compressionRatio = ((1 - compressedBuffer.length / fileBuffer.length) * 100).toFixed(1)

    // ── Upload compressed video to S3 ───────────────────────
    const key = buildSolicitudS3Key({
      folio,
      docType: 'video-selfie',
      originalName: fileName,
    })

    const uploaded = await uploadSolicitudFileToS3({
      key,
      body: compressedBuffer,
      contentType: 'video/mp4',
      metadata: {
        folio,
        doc_type: 'video-selfie',
        original_name: fileName,
        original_size_bytes: String(fileBuffer.length),
        compressed_size_bytes: String(compressedBuffer.length),
        compression_ratio: `${compressionRatio}%`,
      },
    })

    const signedUrl = await getSolicitudFileSignedUrl(key)

    // Cleanup
    try {
      fs.unlinkSync(inputPath)
      fs.unlinkSync(outputPath)
      fs.rmdirSync(tmpDir)
    } catch {}

    return NextResponse.json({
      success: true,
      storageProvider: 's3',
      bucket: uploaded.bucket,
      key: uploaded.key,
      uri: uploaded.uri,
      signedUrl,
      originalSizeBytes: fileBuffer.length,
      compressedSizeBytes: compressedBuffer.length,
      compressionRatio: `${compressionRatio}%`,
      mimeType: 'video/mp4',
      originalName: fileName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al subir video'
    console.error('[Video Upload] Failed:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
