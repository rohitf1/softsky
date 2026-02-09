import { useEffect, useMemo, useState } from 'react'

import { completeGoogleLogin } from '../../services/auth/authApi'

const normalizeReturnTo = (value) => {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

export default function AuthCompletePage() {
  const [error, setError] = useState('')

  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const token = params.get('token') || ''
  const fallbackReturnTo = normalizeReturnTo(params.get('returnTo') || '/')

  useEffect(() => {
    let active = true

    const finalize = async () => {
      if (!token) {
        if (active) setError('Missing login completion token.')
        return
      }

      try {
        const result = await completeGoogleLogin(token)
        if (!active) return

        const nextPath = normalizeReturnTo(result?.returnTo || fallbackReturnTo)
        window.location.replace(nextPath)
      } catch (caughtError) {
        if (!active) return
        setError(caughtError instanceof Error ? caughtError.message : 'Sign-in could not be completed.')
      }
    }

    finalize()
    return () => {
      active = false
    }
  }, [token, fallbackReturnTo])

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>softsky</h1>
        <p>{error ? `Sign-in failed: ${error}` : 'Completing sign-in...'}</p>
      </section>
    </main>
  )
}
