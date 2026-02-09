export const DURATION_OPTIONS = [
  { id: '30s', label: '30 sec', seconds: 30 },
  { id: '1m', label: '1 min', seconds: 60 },
  { id: '2m', label: '2 min', seconds: 120 },
  { id: '3m', label: '3 min', seconds: 180 },
  { id: '5m', label: '5 min', seconds: 300 }
]

export const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds} seconds`
  if (seconds % 60 === 0) {
    const mins = seconds / 60
    return `${mins} minute${mins > 1 ? 's' : ''}`
  }

  const mins = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${mins}m ${rest}s`
}
