// packages/research-vault-mcp/src/ingest/html.ts

/**
 * Validate URL to prevent SSRF attacks.
 * Blocks: private IP ranges, localhost, cloud metadata endpoints, invalid schemes.
 */
function validateUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }

  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new Error(`URL scheme not allowed: ${scheme}. Only http/https permitted.`)
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    throw new Error(`Cloud metadata endpoint blocked: ${hostname}`)
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    throw new Error(`Localhost not permitted: ${hostname}`)
  }

  // Block private IP ranges
  const ip = hostname
  if (/^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(ip)) {
    throw new Error(`Private IP not permitted: ${ip}`)
  }

  // Block link-local
  if (hostname.startsWith('169.254.')) {
    throw new Error(`Link-local IP blocked: ${hostname}`)
  }
}

const MAX_REDIRECTS = 5

/**
 * fetch wrapper that follows redirects manually, re-validating each hop
 * with validateUrl(). Closes the SSRF redirect-bypass: even if the original
 * URL is public, a 30x to a private IP must not be followed.
 */
async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let currentUrl = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    validateUrl(currentUrl)
    const res = await fetch(currentUrl, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) {
      return res
    }
    const location = res.headers.get('location')
    if (!location) {
      return res
    }
    currentUrl = new URL(location, currentUrl).toString()
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`)
}

/**
 * Fetch a URL and convert HTML to plain markdown-like text.
 * Strips scripts, styles, nav, footer, header, aside elements.
 * Uses Bun's native fetch — no external dependencies.
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await safeFetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 research-vault-mcp/1.1.0',
      'Accept': 'text/html'
    }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const html = await res.text()

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Block elements → newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n')

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return text
}
