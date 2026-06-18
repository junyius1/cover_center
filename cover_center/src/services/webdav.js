import axios from 'axios'

const PROXY_PREFIX = '/webdav'
const WEBDAV_USER = '18529238162'
const WEBDAV_PASS = 'Poad2368'
const WEBDAV_AUTH_URL = `http://${WEBDAV_USER}:${WEBDAV_PASS}@192.168.0.122:5005`

const ROOT_PATH_ENCODED = '%E5%85%B1%E4%BA%AB%E6%96%87%E4%BB%B6/%E7%99%BE%E5%BA%A6%E4%BA%91/songs/'

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8" ?>
    <D:propfind xmlns:D="DAV:">
      <D:prop>
        <D:displayname/>
        <D:resourcetype/>
      </D:prop>
    </D:propfind>`

async function propfind(path = '', depth = 0) {
  const response = await axios.post(`${PROXY_PREFIX}/${path}`, PROPFIND_BODY, {
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', Depth: String(depth) },
    responseType: 'text'
  })
  return response.data
}

async function listDirectory(path = '') {
  const response = await axios.post(`${PROXY_PREFIX}/${path}`, PROPFIND_BODY, {
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', Depth: '1' },
    responseType: 'text'
  })
  return parsePropfindXML(response.data, path)
}

/**
 * Parse WebDAV PROPFIND XML response using regex.
 * Handles the DAV namespace prefix (D:) and multi-propstat responses.
 */
function parsePropfindXML(xml, basePath = '') {
  const items = []

  // Split by </D:response> or </response> (the server uses D: prefix)
  const rawBlocks = xml.split(/<\/D:response>/i)
  console.log(`[Parser] Found ${rawBlocks.length} raw blocks`)

  for (const raw of rawBlocks) {
    // Only process blocks that contain a response element
    if (!/<D:response/i.test(raw) && !/<response/i.test(raw)) {
      continue
    }

    // Extract href - the href is the FULL path from WebDAV root (e.g. /共享文件/...)
    const hrefMatch = raw.match(/<[^>]*href[^>]*>([^<]+)<\//i)
    if (!hrefMatch) continue
    // Remove leading slash but keep the full path
    let href = hrefMatch[1].trim().replace(/^\//, '').replace(/\/+$/, '')
    if (href === '') continue

    // Collect ALL displayname values from all propstat blocks
    let name = ''
    const nameMatches = raw.match(/<[^>]*displayname[^>]*>([^<]*)<\//gi)
    if (nameMatches) {
      for (const m of nameMatches) {
        const content = m.replace(/<[^>]*displayname[^>]*>/i, '').replace(/<\/[^>]*$/i, '')
        if (content.trim()) {
          name = content.trim()
          break
        }
      }
    }
    if (!name) name = decodeURIComponent(href.split('/').filter(Boolean).pop() || 'Unknown')

    // Collect ALL collection indicators from all propstat blocks
    const isDirectory = /<[^>]*collection[^>]*>/i.test(raw)

    console.log(`[Parser] name="${name}" dir=${isDirectory} href="${href}"`)

    // href is the FULL path from WebDAV root (e.g. 共享文件/百度云/ubuntu/songs)
    // This is what we need for proxy navigation
    const fullPath = href

    // Build audio URL from full path
    const fullAudioUrl = `${WEBDAV_AUTH_URL}/${fullPath}`

    // Include directories and audio files (mp3, flac, wav, aac, ogg, wma, m4a, etc.)
    if (isDirectory || /\.(mp3|flac|wav|aac|ogg|wma|m4a|alac|ape|opus)$/i.test(href)) {
      items.push({
        name,
        isDirectory,
        href: fullAudioUrl,
        webdavPath: fullPath,
      })
    }
  }

  console.log(`[Parser] Final items: ${items.length}`)

  // Sort: directories first, then by name
  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return items
}

function buildFileUrl(path) {
  return `${WEBDAV_AUTH_URL}/${path}`
}

function getRootPath() {
  return ROOT_PATH_ENCODED
}

export { listDirectory, parsePropfindXML, buildFileUrl, getRootPath }
