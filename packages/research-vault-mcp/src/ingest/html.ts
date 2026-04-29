// packages/research-vault-mcp/src/ingest/html.ts

/**
 * Validate URL to prevent SSRF attacks.
 * Blocks: private IPv4/IPv6 ranges, loopback, link-local, cloud metadata
 * endpoints, invalid schemes.
 *
 * KNOWN LIMITATION: Does not perform DNS resolution — a hostname that
 * resolves to a private IP will pass this check. DNS rebinding mitigation
 * is a follow-up.
 */
export function validateUrl(url: string): void {
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

  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase()

  if (hostname === 'localhost' || hostname === 'metadata.google.internal') {
    throw new Error(`Hostname not permitted: ${hostname}`)
  }

  if (hostname.includes(':')) {
    if (hostname === '::1' || hostname === '::') {
      throw new Error(`IPv6 loopback blocked: ${hostname}`)
    }
    if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(hostname)) {
      throw new Error(`IPv6 unique-local blocked: ${hostname}`)
    }
    if (/^fe[89ab][0-9a-f]?:/i.test(hostname)) {
      throw new Error(`IPv6 link-local blocked: ${hostname}`)
    }
    const mappedV4 = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    if (mappedV4) {
      validateIpv4(mappedV4[1], hostname)
    }
    return
  }

  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipMatch) {
    validateIpv4(hostname, hostname)
    return
  }
}

function validateIpv4(ip: string, originalHostname: string): void {
  const parts = ip.split('.').map(p => parseInt(p, 10))
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${originalHostname}`)
  }
  const [a, b] = parts

  if (a === 0) throw new Error(`Reserved IP blocked: ${originalHostname}`)
  if (a === 10) throw new Error(`Private IP blocked: ${originalHostname}`)
  if (a === 127) throw new Error(`Loopback IP blocked: ${originalHostname}`)
  if (a === 169 && b === 254 && parts[2] === 169 && parts[3] === 254) {
    throw new Error(`Cloud metadata endpoint blocked: ${originalHostname}`)
  }
  if (a === 169 && b === 254) throw new Error(`Link-local IP blocked: ${originalHostname}`)
  if (a === 172 && b >= 16 && b <= 31) throw new Error(`Private IP blocked: ${originalHostname}`)
  if (a === 192 && b === 168) throw new Error(`Private IP blocked: ${originalHostname}`)
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
