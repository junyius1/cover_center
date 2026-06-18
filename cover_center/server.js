import { createServer } from 'http'
import { readFileSync } from 'fs'
import { extname } from 'path'

const PORT = process.env.PORT || 4173
const DIST = 'dist'
const WEBDAV_HOST = '192.168.0.122'
const WEBDAV_PORT = 5005
const WEBDAV_USER = '18529238162'
const WEBDAV_PASS = 'Poad2368'

const AUTH_BUFFER = Buffer.from(`${WEBDAV_USER}:${WEBDAV_PASS}`)
const AUTH_HEADER = 'Basic ' + AUTH_BUFFER.toString('base64')

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'text/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const http = await import('http')

function encodePath(path) {
  return path.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

let proxyReqCount = 0

const server = createServer((req, res) => {
  const fullUrl = req.url

  if (fullUrl.startsWith('/webdav')) {
    let rawPath = fullUrl.substring(7)
    if (rawPath === '') rawPath = '/'

    let targetPath
    try {
      targetPath = decodeURIComponent(rawPath)
    } catch {
      targetPath = rawPath
    }

    const safePath = encodePath(targetPath)
    proxyReqCount++

    // Collect all request body
    const bodyChunks = []
    req.on('data', chunk => bodyChunks.push(chunk))

    req.on('end', () => {
      const body = Buffer.concat(bodyChunks)
      const bodyLen = body.length

      // Build minimal, safe headers for the WebDAV server
      const proxyHeaders = {
        'host': `${WEBDAV_HOST}:${WEBDAV_PORT}`,
        'authorization': AUTH_HEADER,
        'content-type': 'text/xml; charset="utf-8"',
        'depth': '1',
        'content-length': String(bodyLen),
      }

      console.log(`[P${proxyReqCount}] PROPFIND "${targetPath}" body=${bodyLen}b`)
      console.log(`[P${proxyReqCount}] body bytes: ${bodyLen} (hex: ${body.toString('hex').substring(0, 60)}...)`)

      const proxyReq = http.request({
        hostname: WEBDAV_HOST,
        port: WEBDAV_PORT,
        path: safePath,
        method: 'PROPFIND',
        headers: proxyHeaders,
      }, proxyRes => {
        console.log(`[P${proxyReqCount}] <- ${proxyRes.statusCode}`)
        let rbody = ''
        proxyRes.on('data', c => rbody += c)
        proxyRes.on('end', () => {
          console.log(`[P${proxyReqCount}] resp: ${rbody.substring(0, 120)}...`)
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          res.end(rbody)
        })
      })

      proxyReq.on('error', err => {
        console.error(`[P${proxyReqCount}] err:`, err.message)
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end('Bad Gateway')
        }
      })

      // Write body then end
      if (bodyLen > 0) {
        proxyReq.write(body)
      }
      proxyReq.end()
    })
    return
  }

  // Serve static files
  const pathname = fullUrl.split('?')[0]
  let filePath = pathname
  if (pathname === '/' || pathname.endsWith('/')) {
    filePath = pathname === '/' ? '/index.html' : pathname + 'index.html'
  }
  if (!extname(filePath) && filePath !== '/index.html' && !filePath.endsWith('/')) {
    filePath = pathname + '/index.html'
  }

  const actualFilePath = DIST + filePath
  const ext = extname(filePath)
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  try {
    const content = readFileSync(actualFilePath)
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
    res.end(content)
  } catch {
    try {
      const content = readFileSync(DIST + '/index.html')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(content)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    }
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Car Audio Player running at http://localhost:${PORT}/\n`)
  console.log(`  WebDAV proxy: http://localhost:${PORT}/webdav/ -> http://${WEBDAV_HOST}:${WEBDAV_PORT}\n`)
})
