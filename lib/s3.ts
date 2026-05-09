import 'server-only'

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner'

export const S3_BUCKET =
  process.env.AWS_S3_BUCKET ||
  process.env.S3_BUCKET ||
  `prospera-intake-${process.env.VERCEL_ENV === 'production' ? 'prod' : 'dev'}`

const S3_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'

let cachedClient: S3Client | null = null

export function getS3Client() {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: S3_REGION })
  }
  return cachedClient
}

function safeSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._=-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown'
}

export function buildSolicitudS3Key({
  folio,
  docType,
  originalName,
  timestamp = Date.now(),
}: {
  folio: string
  docType: string
  originalName?: string
  timestamp?: number
}) {
  const ext = originalName?.includes('.') ? originalName.split('.').pop() : 'bin'
  return `solicitudes/${safeSegment(folio)}/${safeSegment(docType)}-${timestamp}.${safeSegment(ext || 'bin')}`
}

export async function uploadSolicitudFileToS3({
  key,
  body,
  contentType,
  metadata = {},
}: {
  key: string
  body: Buffer | Uint8Array
  contentType?: string
  metadata?: Record<string, string>
}) {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      Metadata: metadata,
    })
  )

  return {
    bucket: S3_BUCKET,
    key,
    uri: `s3://${S3_BUCKET}/${key}`,
  }
}

export async function createSolicitudUploadUrl({
  key,
  contentType,
  metadata = {},
  expiresIn = 900,
}: {
  key: string
  contentType?: string
  metadata?: Record<string, string>
  expiresIn?: number
}) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
    Metadata: metadata,
  })

  const uploadUrl = await getS3SignedUrl(getS3Client(), command, { expiresIn })
  return {
    bucket: S3_BUCKET,
    key,
    uri: `s3://${S3_BUCKET}/${key}`,
    uploadUrl,
  }
}

export async function getSolicitudFileFromS3(key: string) {
  return getS3Client().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))
}

export async function getSolicitudFileSignedUrl(key: string, expiresIn = 3600) {
  return getS3SignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn }
  )
}

export async function headSolicitudFile(key: string) {
  return getS3Client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }))
}

export async function listSolicitudFiles(prefix: string) {
  const res = await getS3Client().send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix })
  )
  return res.Contents || []
}
