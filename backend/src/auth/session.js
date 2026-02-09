import crypto from 'node:crypto'

import { parseCookies, serializeCookie } from '../lib/cookies.js'
import { createSignedToken, readSignedToken } from '../lib/signedToken.js'

const buildSessionPayload = ({ user, ttlSeconds }) => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return {
    sub: user.sub,
    email: user.email || '',
    name: user.name || '',
    picture: user.picture || '',
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds
  }
}

const isUserPayload = (payload) =>
  payload &&
  typeof payload === 'object' &&
  typeof payload.sub === 'string' &&
  payload.sub.trim().length > 0 &&
  typeof payload.exp === 'number'

const isExpired = (expSeconds) => Math.floor(Date.now() / 1000) >= expSeconds

const normalizeReturnPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

export const createAuthSession = (config) => {
  const cookieName = config.auth.sessionCookieName
  const stateCookieName = config.auth.stateCookieName
  const domain = config.auth.cookieDomain || undefined
  const secure = config.security.secureCookies
  const sessionMaxAge = Math.max(300, config.auth.sessionTtlSeconds)
  const stateMaxAge = 10 * 60
  const handoffMaxAge = 5 * 60

  const createState = ({ returnTo }) => {
    const rawState = crypto.randomBytes(18).toString('base64url')
    const payload = {
      state: rawState,
      returnTo: normalizeReturnPath(returnTo),
      exp: Math.floor(Date.now() / 1000) + stateMaxAge
    }
    const token = createSignedToken({
      payload,
      secret: config.auth.sessionSecret
    })

    return {
      state: rawState,
      cookieValue: token
    }
  }

  const createStateToken = ({ returnTo }) => {
    const payload = {
      nonce: crypto.randomBytes(18).toString('base64url'),
      returnTo: normalizeReturnPath(returnTo),
      exp: Math.floor(Date.now() / 1000) + stateMaxAge
    }

    return createSignedToken({
      payload,
      secret: config.auth.sessionSecret
    })
  }

  const createLoginHandoffToken = ({ user, returnTo }) => {
    const payload = {
      sub: user.sub,
      email: user.email || '',
      name: user.name || '',
      picture: user.picture || '',
      returnTo: normalizeReturnPath(returnTo),
      exp: Math.floor(Date.now() / 1000) + handoffMaxAge
    }

    return createSignedToken({
      payload,
      secret: config.auth.sessionSecret
    })
  }

  return {
    readSession(request) {
      const cookies = parseCookies(request.get('cookie') || '')
      const token = cookies[cookieName]
      if (!token) return null

      const payload = readSignedToken({
        token,
        secret: config.auth.sessionSecret
      })

      if (!isUserPayload(payload) || isExpired(payload.exp)) return null

      return {
        sub: payload.sub,
        email: payload.email || '',
        name: payload.name || '',
        picture: payload.picture || ''
      }
    },
    setSession(response, user) {
      const payload = buildSessionPayload({
        user,
        ttlSeconds: sessionMaxAge
      })

      const token = createSignedToken({
        payload,
        secret: config.auth.sessionSecret
      })

      response.append(
        'Set-Cookie',
        serializeCookie(cookieName, token, {
          path: '/',
          domain,
          httpOnly: true,
          secure,
          sameSite: 'Lax',
          maxAge: sessionMaxAge
        })
      )
    },
    clearSession(response) {
      response.append(
        'Set-Cookie',
        serializeCookie(cookieName, '', {
          path: '/',
          domain,
          httpOnly: true,
          secure,
          sameSite: 'Lax',
          maxAge: 0
        })
      )
    },
    createOAuthStateCookie(returnTo) {
      return createState({ returnTo })
    },
    createOAuthStateToken(returnTo) {
      return createStateToken({ returnTo })
    },
    setOAuthState(response, value) {
      response.append(
        'Set-Cookie',
        serializeCookie(stateCookieName, value, {
          path: '/',
          domain,
          httpOnly: true,
          secure,
          sameSite: 'Lax',
          maxAge: stateMaxAge
        })
      )
    },
    readOAuthState(request) {
      const cookies = parseCookies(request.get('cookie') || '')
      const token = cookies[stateCookieName]
      if (!token) return null

      const payload = readSignedToken({
        token,
        secret: config.auth.sessionSecret
      })

      if (!payload || typeof payload.state !== 'string' || typeof payload.exp !== 'number' || isExpired(payload.exp)) {
        return null
      }

      return {
        state: payload.state,
        returnTo: normalizeReturnPath(payload.returnTo || '/')
      }
    },
    readOAuthStateToken(token) {
      if (!token || typeof token !== 'string') return null

      const payload = readSignedToken({
        token,
        secret: config.auth.sessionSecret
      })

      if (
        !payload ||
        typeof payload.nonce !== 'string' ||
        typeof payload.exp !== 'number' ||
        isExpired(payload.exp)
      ) {
        return null
      }

      return {
        state: payload.nonce,
        returnTo: normalizeReturnPath(payload.returnTo || '/')
      }
    },
    createLoginHandoffToken({ user, returnTo }) {
      return createLoginHandoffToken({ user, returnTo })
    },
    readLoginHandoffToken(token) {
      if (!token || typeof token !== 'string') return null

      const payload = readSignedToken({
        token,
        secret: config.auth.sessionSecret
      })

      if (!isUserPayload(payload) || isExpired(payload.exp)) return null

      return {
        user: {
          sub: payload.sub,
          email: payload.email || '',
          name: payload.name || '',
          picture: payload.picture || ''
        },
        returnTo: normalizeReturnPath(payload.returnTo || '/')
      }
    },
    clearOAuthState(response) {
      response.append(
        'Set-Cookie',
        serializeCookie(stateCookieName, '', {
          path: '/',
          domain,
          httpOnly: true,
          secure,
          sameSite: 'Lax',
          maxAge: 0
        })
      )
    }
  }
}
