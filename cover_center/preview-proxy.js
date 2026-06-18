import sirv from 'sirv'
import { createServer } from 'http'
import { readFileSync } from 'fs'
import { extname } from 'path'

const PORT = process.env.PORT || 4173
const DIST = 'dist'

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
}

const server = createServer(async (req, res) => {
  // Proxy WebDAV requests
  if (req.url && req.url.startsWith('/webdav')) {
    const http = await import('http')
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname.replace(/^\/webdav/, '')
    const targetUrl = `http://192.168.0.122:5005${path}`

    const options = {
      hostname: '192.168.0.122',
      port: 5005,
      path: path,
      method: req.method,
      headers: {
        ...req.headers,
        host: '192.168.0.122:5005',
      },
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message)
      res.writeHead(502)
      res.end('Bad Gateway')
    })

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => { proxyReq.write(body) })
    }

    proxyReq.end()
    return
  }

  // Serve static files
  const ext = extname(req.url.split('?')[0])
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  try {
    let filePath = DIST + (req.url === '/' ? '/index.html' : req.url)
    const content = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  } catch (err) {
    // SPA fallback: serve index.html for non-file routes
    try {
      const content = readFileSync(DIST + '/index.html')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not Found')
    }
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Preview server running at http://localhost:${PORT}/\n`)
})
