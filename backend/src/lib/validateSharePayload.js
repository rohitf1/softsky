const MAX_INTENTION_LENGTH = 1200
const MAX_PROMPT_LENGTH = 20000
const MAX_CODE_LENGTH = 300000
const MIN_DURATION_SECONDS = 10
const MAX_DURATION_SECONDS = 7200

const ALLOWED_THEMES = new Set(['spring', 'summer', 'autumn', 'winter'])
const ALLOWED_TIMES = new Set(['morning', 'night'])

const asTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '')

const ensureStringLength = (value, max, fieldName) => {
  const normalized = asTrimmedString(value)
  if (!normalized) throw new Error(`${fieldName} is required`)
  if (normalized.length > max) throw new Error(`${fieldName} must be <= ${max} characters`)
  return normalized
}

const ensureCode = (value, fieldName) => {
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  if (normalized.length > MAX_CODE_LENGTH) throw new Error(`${fieldName} is too large`)
  return normalized
}

export const validateSharePayload = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Request body must be an object')
  }

  const intention = ensureStringLength(input.intention, MAX_INTENTION_LENGTH, 'intention')
  const sceneCode = ensureCode(input.sceneCode, 'sceneCode')
  const musicCode = ensureCode(input.musicCode, 'musicCode')

  const durationRaw = Number(input.durationSeconds)
  if (!Number.isFinite(durationRaw)) throw new Error('durationSeconds must be a number')
  const durationSeconds = Math.floor(durationRaw)
  if (durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`durationSeconds must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS}`)
  }

  const backgroundTheme = ALLOWED_THEMES.has(input.backgroundTheme) ? input.backgroundTheme : 'spring'
  const sceneTime = ALLOWED_TIMES.has(input.sceneTime) ? input.sceneTime : 'morning'

  let prompts = null
  if (input.prompts && typeof input.prompts === 'object' && !Array.isArray(input.prompts)) {
    const scenePrompt = asTrimmedString(input.prompts.scenePrompt)
    const musicPrompt = asTrimmedString(input.prompts.musicPrompt)
    if (scenePrompt.length > MAX_PROMPT_LENGTH || musicPrompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`prompts must be <= ${MAX_PROMPT_LENGTH} characters`)
    }
    prompts = { scenePrompt, musicPrompt }
  }

  const generatedAt = Number.isFinite(Number(input.generatedAt)) ? Number(input.generatedAt) : Date.now()

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    intention,
    durationSeconds,
    backgroundTheme,
    sceneTime,
    sceneCode,
    musicCode,
    prompts,
    simulation: Boolean(input.simulation),
    generatedAt
  }
}

