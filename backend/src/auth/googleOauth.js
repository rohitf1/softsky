import { OAuth2Client } from 'google-auth-library'

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'

const ensureReady = (config) => {
  if (!config.auth.googleClientId || !config.auth.googleClientSecret || !config.auth.googleRedirectUri) {
    throw new Error(
      'Google OAuth is not fully configured. Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REDIRECT_URI.'
    )
  }
}

export const createGoogleOauthClient = (config) => {
  ensureReady(config)
  const client = new OAuth2Client({
    clientId: config.auth.googleClientId,
    clientSecret: config.auth.googleClientSecret,
    redirectUri: config.auth.googleRedirectUri
  })

  return {
    buildAuthUrl(state) {
      const params = new URLSearchParams({
        client_id: config.auth.googleClientId,
        redirect_uri: config.auth.googleRedirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        include_granted_scopes: 'true',
        prompt: 'select_account',
        state
      })

      return `${GOOGLE_AUTH_BASE}?${params.toString()}`
    },
    async exchangeCodeForUser(code) {
      const { tokens } = await client.getToken(code)
      if (!tokens?.id_token) {
        throw new Error('Google OAuth did not return an id_token')
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.auth.googleClientId
      })

      const payload = ticket.getPayload()
      if (!payload?.sub || !payload?.email) {
        throw new Error('Google account payload missing required fields')
      }

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name || payload.email,
        picture: payload.picture || ''
      }
    }
  }
}

