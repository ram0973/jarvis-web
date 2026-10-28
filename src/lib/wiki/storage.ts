import { serverEnv } from '@/lib/env/server'
import { AppError } from '@/lib/error'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join, resolve, sep } from 'node:path'
import '@point0/core/server-only'

// Server-only storage for uploads: `<root>/<app>/<YYYY>/<MM>/<uuid>.<ext>`. Marked `server-only`, and imported
// dynamically from the upload point's loader — nothing here may ever reach the browser bundle.
const MAX_BYTES = 10 * 1024 * 1024

const imageExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

const contentTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

/** Absolute path of the uploads root. Relative `UPLOADS_DIR` resolves against the process cwd. */
export const uploadsRoot = () => resolve(serverEnv.UPLOADS_DIR ?? './uploads')

/**
 * Store an uploaded image and return its public URL. Raster formats only: SVG is same-origin active content and would
 * be an XSS vector, so it is rejected on purpose.
 */
export const saveUpload = async (app: string, file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new AppError('Only images can be uploaded', { code: 'BAD_REQUEST' })
  }
  const extension = imageExtensions[file.type]
  if (!extension) {
    throw new AppError(`Unsupported image format: ${file.type}`, { code: 'BAD_REQUEST' })
  }
  if (file.size > MAX_BYTES) {
    throw new AppError('Image is larger than 10 MB', { code: 'BAD_REQUEST' })
  }

  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const name = `${randomUUID()}.${extension}`
  const directory = join(uploadsRoot(), app, year, month)

  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, name), Buffer.from(await file.arrayBuffer()))

  return { url: `/uploads/${app}/${year}/${month}/${name}`, name, size: file.size }
}

/**
 * Read one uploaded file for the `/uploads/*` route. The resolved path must stay inside the uploads root — that check
 * is what makes path traversal (`../`) a 404 instead of a file leak.
 */
export const serveUpload = async (relative: string) => {
  const root = uploadsRoot()
  const target = resolve(root, relative.replace(/^\/+/, ''))

  if (target !== root && !target.startsWith(root + sep)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const file = await readFile(target)
    const extension = extname(target).slice(1).toLowerCase()
    return new Response(file, {
      headers: {
        'content-type': contentTypes[extension] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
