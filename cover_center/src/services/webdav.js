import axios from 'axios'

const WEBDAV_BASE = 'http://192.168.0.122:5005'
const WEBDAV_USER = '18529238162'
const WEBDAV_PASS = 'Poad2368'

// URL-encode credentials to handle special characters
const encodedUser = encodeURIComponent(WEBDAV_USER)
const encodedPass = encodeURIComponent(WEBDAV_PASS)
const WEBDAV_AUTH_URL = `http://${encodedUser}:${encodedPass}@192.168.0.122:5005`

const ROOT_PATH_ENCODED = '%E5%85%B1%E4%BA%AB%E6%96%87%E4%BB%B6/%E7%99%BE%E5%BA%A6%E4%BA%91/ubuntu/%E7%B2%BE%E9%80%89%E6%B5%B7%E9%87%8F%E8%BD%A6%E8%BD%BD%E9%9F%B3%E4%B9%90%E3%80%90%E6%8C%81%E7%BB%B4%E6%9B%B4%E6%96%B0%E3%80%91/'

/**
 * Send a PROPFIND request to the WebDAV server.
 * Returns the raw XML response string.
 */
async function propfind(path = '', depth = 0) {
  const url = `${WEBDAV_AUTH_URL}/${path}`
  const body = `<?xml version="1.0" encoding="utf-8" ?>
    <D:propfind xmlns:D="DAV:">
      <D:prop>
        <D:displayname/>
        <D:resourcetype/>
      </D:prop>
    </D:propfind>`

  const headers = {
    'Content-Type': 'text/xml; charset="utf-8"',
    Depth: String(depth),
  }

  const response = await axios.post(url, body, { headers, responseType: 'text' })
  return response.data
}

/**
 * Send a PROPFIND request for directory listing (depth 1).
 * Returns an array of { name, isDirectory, href } objects.
 */
async function listDirectory(path = '') {
  const url = `${WEBDAV_AUTH_URL}/${path}`
  const body = `<?xml version="1.0" encoding="utf-8" ?>
    <D:propfind xmlns:D="DAV:">
      <D:prop>
        <D:displayname/>
        <D:resourcetype/>
      </D:prop>
    </D:propfind>`

  const headers = {
    'Content-Type': 'text/xml; charset="utf-8"',
    Depth: '1',
  }

  const response = await axios.post(url, body, { headers, responseType: 'text' })
  return parsePropfindXML(response.data)
}

/**
 * Parse WebDAV PROPFIND XML response into file/folder objects.
 * Handles multiple namespace prefixes (d:, a:, or no prefix) commonly used by WebDAV servers.
 */
function parsePropfindXML(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  // Check for parsing errors
  const parseError = doc.getElementsByTagName('parsererror')
  if (parseError.length > 0) {
    console.error('XML parse error:', parseError[0].textContent)
    return []
  }

  // Try multiple namespace prefixes for response elements
  const responseTags = ['d\\:response', 'a\\:response', 'response', 'd:response', 'a:response']
  let responses = []
  for (const tag of responseTags) {
    responses = doc.getElementsByTagName(tag)
    if (responses.length > 0) break
  }

  const items = []
  const helperTags = {
    href: ['d\\:href', 'a\\:href', 'href', 'd:href', 'a:href'],
    prop: ['d\\:prop', 'a\\:prop', 'prop', 'd:prop', 'a:prop'],
    displayname: ['d\\:displayname', 'a\\:displayname', 'displayname', 'd:displayname', 'a:displayname'],
    resourcetype: ['d\\:resourcetype', 'a\\:resourcetype', 'resourcetype', 'd:resourcetype', 'a:resourcetype'],
    collection: ['d\\:collection', 'a\\:collection', 'collection', 'd:collection', 'a:collection'],
  }

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i]

    // Extract href
    let hrefEl = null
    for (const tag of helperTags.href) {
      hrefEl = response.getElementsByTagName(tag)[0]
      if (hrefEl) break
    }
    if (!hrefEl) continue

    const href = hrefEl.textContent

    // Extract display name
    let propEl = null
    for (const tag of helperTags.prop) {
      propEl = response.getElementsByTagName(tag)[0]
      if (propEl) break
    }

    let name = ''
    for (const tag of helperTags.displayname) {
      const el = propEl?.getElementsByTagName(tag)[0]
      if (el) { name = el.textContent.trim(); break }
    }
    if (!name) name = decodeURIComponent(href.split('/').filter(Boolean).pop() || 'Unknown')

    // Check if directory (collection)
    let isDirectory = false
    for (const tag of helperTags.resourcetype) {
      const resTypeEl = propEl?.getElementsByTagName(tag)[0]
      if (resTypeEl) {
        for (const ct of helperTags.collection) {
          if (resTypeEl.getElementsByTagName(ct).length > 0) {
            isDirectory = true
            break
          }
        }
        if (isDirectory) break
      }
    }

    // Include directories and MP3 files
    if (isDirectory || /\.mp3$/i.test(href)) {
      // Build full URL with embedded credentials for audio streaming
      let fullPath = href
      if (!fullPath.startsWith('http')) {
        // Remove leading slash if present, then prepend auth URL
        fullPath = fullPath.replace(/^\//, '')
      }
      const fullUrl = `${WEBDAV_AUTH_URL}/${fullPath}`
      items.push({ name, isDirectory, href: fullUrl })
    }
  }

  // Sort: directories first, then by name
  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return items
}

/**
 * Build the full URL for a file path on the WebDAV server.
 */
function buildFileUrl(path) {
  return `${WEBDAV_BASE}/${path}`
}

/**
 * Get the root path constant.
 */
function getRootPath() {
  return ROOT_PATH_ENCODED
}

export { listDirectory, parsePropfindXML, buildFileUrl, getRootPath }
