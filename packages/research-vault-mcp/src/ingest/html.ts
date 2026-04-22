// packages/research-vault-mcp/src/ingest/html.ts

/**
 * Fetch a URL and convert HTML to plain markdown-like text.
 * Strips scripts, styles, nav, footer, header, aside elements.
 * Uses Bun's native fetch — no external dependencies.
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
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