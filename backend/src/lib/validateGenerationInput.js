const MAX_INTENTION_LENGTH = 1200
const MIN_DURATION_SECONDS = 10
const MAX_DURATION_SECONDS = 7200

const ALLOWED_THEMES = new Set(['spring', 'summer', 'autumn', 'winter'])
const ALLOWED_TIMES = new Set(['morning', 'night'])

const asTrimmed = (value) => (typeof value === 'string' ? value.trim() : '')

export const validateGenerationInput = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Request body must be an object')
  }

  const intention = asTrimmed(input.intention)
  if (!intention) throw new Error('intention is required')
  if (intention.length > MAX_INTENTION_LENGTH) {
    throw new Error(`intention must be <= ${MAX_INTENTION_LENGTH} characters`)
  }

  const durationRaw = Number(input.durationSeconds)
  if (!Number.isFinite(durationRaw)) throw new Error('durationSeconds must be a number')
  const durationSeconds = Math.floor(durationRaw)
  if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`durationSeconds must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`)
  }

  const backgroundTheme = ALLOWED_THEMES.has(input.backgroundTheme) ? input.backgroundTheme : 'spring'
  const sceneTime = ALLOWED_TIMES.has(input.sceneTime) ? input.sceneTime : 'morning'

  return {
    intention,
    durationSeconds,
    backgroundTheme,
    sceneTime
  }
}

