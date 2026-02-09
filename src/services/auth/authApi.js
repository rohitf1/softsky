import { apiRequest } from '../api/httpClient'

export const fetchAuthConfig = async () => apiRequest('/auth/config')

export const fetchAuthSession = async () => apiRequest('/auth/session')

export const logoutSession = async () =>
  apiRequest('/auth/logout', {
    method: 'POST'
  })

export const completeGoogleLogin = async (token) =>
  apiRequest('/auth/complete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ token })
  })

export const startGoogleLogin = ({ returnTo = '/' } = {}) => {
  const normalized = typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/'
  window.location.assign(`/api/v1/auth/google/start?returnTo=${encodeURIComponent(normalized)}`)
}
