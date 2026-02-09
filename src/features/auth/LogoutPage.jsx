import { useEffect } from 'react'

import { logoutSession } from '../../services/auth/authApi'

export default function LogoutPage() {
  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        await logoutSession()
      } catch {
        // Ignore and continue redirect.
      } finally {
        if (active) {
          window.location.replace('/')
        }
      }
    }

    run()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>softsky</h1>
        <p>Signing out...</p>
      </section>
    </main>
  )
}

