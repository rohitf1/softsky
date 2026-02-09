import { useMemo, useState } from 'react'

import { startGoogleLogin } from '../../services/auth/authApi'

const normalizeReturnTo = (value) => {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

export default function LoginPage() {
  const [isBusy, setIsBusy] = useState(false)
  const returnTo = useMemo(() => {
    const query = new URLSearchParams(window.location.search)
    return normalizeReturnTo(query.get('returnTo') || '/')
  }, [])

  const handleLogin = () => {
    setIsBusy(true)
    startGoogleLogin({ returnTo })
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>softsky</h1>
        <p>Sign in with Google to unlock sharing and unlimited generations.</p>
        <button className="auth-card__button" type="button" onClick={handleLogin} disabled={isBusy}>
          {isBusy ? 'Redirecting...' : 'Continue with Google'}
        </button>
      </section>
    </main>
  )
}

