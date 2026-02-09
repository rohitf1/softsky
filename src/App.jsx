import MeditationStudio from './features/meditation/MeditationStudio'
import LoginPage from './features/auth/LoginPage'
import LogoutPage from './features/auth/LogoutPage'
import AuthCompletePage from './features/auth/AuthCompletePage'

export default function App() {
  const path = window.location.pathname
  if (path === '/login') return <LoginPage />
  if (path === '/logout') return <LogoutPage />
  if (path === '/auth/complete') return <AuthCompletePage />

  const shareMatch = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{8,64})\/?$/)
  const initialShareId = shareMatch ? shareMatch[1] : null

  return <MeditationStudio initialShareId={initialShareId} />
}
