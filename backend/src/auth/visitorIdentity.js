import crypto from 'node:crypto'

import { parseCookies, serializeCookie } from '../lib/cookies.js'

const VISITOR_COOKIE = 'softsky_vid'
const VISITOR_TTL_SECONDS = 60 * 60 * 24 * 180

const createVisitorId = () => crypto.randomBytes(12).toString('base64url')

const isValidVisitorId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,80}$/.test(value)

export const resolveVisitorId = ({ request, response, secure, domain }) => {
  const cookies = parseCookies(request.get('cookie') || '')
  const existing = cookies[VISITOR_COOKIE]
  if (isValidVisitorId(existing)) {
    return existing
  }

  const visitorId = createVisitorId()
  response.append(
    'Set-Cookie',
    serializeCookie(VISITOR_COOKIE, visitorId, {
      path: '/',
      domain: domain || undefined,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      maxAge: VISITOR_TTL_SECONDS
    })
  )
  return visitorId
}
