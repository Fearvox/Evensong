import { describe, test, expect } from 'bun:test'
import { parseArxivId } from '../src/ingest/arxiv.ts'
import { validateUrl } from '../src/ingest/html.ts'

describe('parseArxivId', () => {
  test('parses full URL with abs path', () => {
    expect(parseArxivId('https://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('parses abs/ URL shorthand', () => {
    expect(parseArxivId('abs/2501.00001')).toBe('2501.00001')
  })
  test('parses bare ID', () => {
    expect(parseArxivId('2501.00001')).toBe('2501.00001')
  })
  test('parses arxiv.org/abs/ URL without https', () => {
    expect(parseArxivId('http://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('returns null for non-arxiv URL', () => {
    expect(parseArxivId('https://example.com/paper')).toBeNull()
  })
  test('handles versioned IDs like 2501.00001v2', () => {
    expect(parseArxivId('2501.00001v2')).toBe('2501.00001v2')
  })
})

describe('validateUrl SSRF protection — IPv4 private ranges (regression)', () => {
  test('blocks 10.0.0.0/8 (regression: 4-octet was bypassed)', () => {
    expect(() => validateUrl('http://10.0.0.1/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://10.255.255.254/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://10.10.10.10/foo')).toThrow(/private/i)
  })

  test('blocks 192.168.0.0/16 (regression: 4-octet was bypassed)', () => {
    expect(() => validateUrl('http://192.168.1.1/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://192.168.0.0/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://192.168.255.255/foo')).toThrow(/private/i)
  })

  test('blocks 172.16-31.0.0/12', () => {
    expect(() => validateUrl('http://172.16.0.1/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://172.20.0.0/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://172.31.255.255/foo')).toThrow(/private/i)
  })

  test('allows public 172 ranges (172.0-15 and 172.32+)', () => {
    expect(() => validateUrl('http://172.15.0.1/foo')).not.toThrow()
    expect(() => validateUrl('http://172.32.0.1/foo')).not.toThrow()
  })

  test('blocks all 127.0.0.0/8 loopback (regression: only 127.0.0.1 was blocked)', () => {
    expect(() => validateUrl('http://127.0.0.1/foo')).toThrow(/loopback/i)
    expect(() => validateUrl('http://127.0.0.2/foo')).toThrow(/loopback/i)
    expect(() => validateUrl('http://127.255.255.255/foo')).toThrow(/loopback/i)
  })

  test('blocks 0.0.0.0/8 (regression: not blocked at all)', () => {
    expect(() => validateUrl('http://0.0.0.0/foo')).toThrow(/reserved/i)
    expect(() => validateUrl('http://0.1.2.3/foo')).toThrow(/reserved/i)
  })

  test('blocks 169.254.0.0/16 link-local', () => {
    expect(() => validateUrl('http://169.254.1.1/foo')).toThrow(/link-local|metadata/i)
    expect(() => validateUrl('http://169.254.169.254/foo')).toThrow()
  })

  test('rejects invalid IPv4 addresses (octet out of range)', () => {
    expect(() => validateUrl('http://999.999.999.999/foo')).toThrow(/invalid/i)
  })
})

describe('validateUrl SSRF protection — IPv6 ranges', () => {
  test('blocks ::1 loopback', () => {
    expect(() => validateUrl('http://[::1]/foo')).toThrow(/loopback/i)
  })

  test('blocks fc00::/7 unique-local', () => {
    expect(() => validateUrl('http://[fc00::1]/foo')).toThrow(/unique-local/i)
    expect(() => validateUrl('http://[fd12:3456:789a::1]/foo')).toThrow(/unique-local/i)
  })

  test('blocks fe80::/10 link-local', () => {
    expect(() => validateUrl('http://[fe80::1]/foo')).toThrow(/link-local/i)
    expect(() => validateUrl('http://[febf::1]/foo')).toThrow(/link-local/i)
  })

  test('allows public IPv6', () => {
    expect(() => validateUrl('http://[2001:db8::1]/foo')).not.toThrow()
    expect(() => validateUrl('http://[2606:4700::1111]/foo')).not.toThrow()
  })
})

describe('validateUrl SSRF protection — hostnames and schemes', () => {
  test('blocks localhost hostname', () => {
    expect(() => validateUrl('http://localhost/foo')).toThrow(/not permitted/i)
  })

  test('blocks cloud metadata domain', () => {
    expect(() => validateUrl('http://metadata.google.internal/foo')).toThrow(/not permitted/i)
  })

  test('blocks non-http schemes', () => {
    expect(() => validateUrl('file:///etc/passwd')).toThrow(/scheme/i)
    expect(() => validateUrl('ftp://example.com/foo')).toThrow(/scheme/i)
  })

  test('rejects malformed URLs', () => {
    expect(() => validateUrl('not a url')).toThrow(/invalid/i)
  })

  test('allows public IPs and hostnames', () => {
    expect(() => validateUrl('https://example.com/foo')).not.toThrow()
    expect(() => validateUrl('https://8.8.8.8/foo')).not.toThrow()
    expect(() => validateUrl('https://192.169.1.1/foo')).not.toThrow()
    expect(() => validateUrl('https://1.1.1.1/foo')).not.toThrow()
  })
})
