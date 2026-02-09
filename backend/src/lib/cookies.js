const encode = encodeURIComponent

export const parseCookies = (headerValue) => {
  const result = {}
  if (!headerValue || typeof headerValue !== 'string') return result

  const parts = headerValue.split(';')
  for (const part of parts) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const key = part.slice(0, index).trim()
    const raw = part.slice(index + 1).trim()
    if (!key) continue
    result[key] = decodeURIComponent(raw)
  }

  return result
}

export const serializeCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encode(value)}`]

  if (options.maxAge != null) segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  if (options.expires instanceof Date) segments.push(`Expires=${options.expires.toUTCString()}`)
  segments.push(`Path=${options.path || '/'}`)
  if (options.domain) segments.push(`Domain=${options.domain}`)
  if (options.httpOnly) segments.push('HttpOnly')
  if (options.secure) segments.push('Secure')
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`)

  return segments.join('; ')
}

