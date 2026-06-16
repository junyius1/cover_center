import axios from 'axios'

const WEBDAV_BASE = 'http://192.168.0.122:5005'
const ROOT_PATH = '%E5%85%B1%E4%BA%AB%E6%96%87%E4%BB%B6/%E7%99%BE%E5%BA%A6%E4%BA%91/ubuntu/%E7%B2%BE%E9%80%89%E6%B5%B7%E9%87%8F%E8%BD%A6%E8%BD%BD%E9%9F%B3%E4%B9%90%E3%80%90%E6%8C%81%E7%BB%B4%E6%9B%B4%E6%96%B0%E3%80%91/'

/**
 * Send a PROPFIND request to the WebDAV server and return the raw XML.
 */
async function propfind(path = '', depth = 0) {
  const url = `${WEBDAV_BASE}/${path}`
  const headers = {
    Depth: String(depth),
  }
  const response = await axios.get(url, {
    headers,
    params: { _p: 'propfind' },
    responseType: 'text',
  })
  return response.data
}

/**
 * Send a PROPFIND request for directory listing (depth 1).
 * Returns an array of { name, isDirectory, href, displayName }.
 */
async function listDirectory(path = '') {
  const url = `${WEBDAV_BASE}/${path}`
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

  const response = await axios.post(url, body, { headers })
  return parsePropfindXML(response.data)
}

/**
 * Parse WebDAV PROPFIND XML response into an array of file/folder objects.
 */
function parsePropfindXML(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const responses = doc.getElementsByTagName('d\:response')
  const items = []

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i]

    // Extract href
    const hrefEl = response.getElementsByTagName('d\:href')[0]
    if (!hrefEl) continue
    const href = hrefEl.textContent

    // Extract display name
    const propEl = response.getElementsByTagName('d\:prop')[0]
    const displayNameEl = propEl?.getElementsByTagName('d\:displayname')[0]
    const name = displayNameEl?.textContent?.trim() || href.split('/').filter(Boolean).pop() || ''

    // Check if directory
    const resTypeEl = propEl?.getElementsByTagName('d\:resourcetype')[0]
    const collectionEl = resTypeEl?.getElementsByTagName('d\:collection')[0]
    const isDirectory = !!collectionEl

    if (isDirectory || /\.mp3$/i.test(href)) {
      items.push({ name, isDirectory, href })
    }
  }

  // Sort: directories first, then by name
  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return items
}

/**
 * Build the full URL for a file path on the WebDAV server.
 */
function buildFileUrl(path) {
  return `${WEBDAV_BASE}/${path}`
}

export { listDirectory, parsePropfindXML, buildFileUrl }
