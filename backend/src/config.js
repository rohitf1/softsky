import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asBool = (value, fallback) => {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export const readConfig = () => {
  const driver = (process.env.SHARE_STORE_DRIVER || 'local').trim().toLowerCase()
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || ''

  return {
    port: asInt(process.env.PORT, 8080),
    driver,
    publicBaseUrl: (process.env.SHARE_PUBLIC_BASE_URL || '').trim(),
    maxPayloadMb: asInt(process.env.SHARE_MAX_PAYLOAD_MB, 3),
    rateLimit: {
      windowMs: asInt(process.env.SHARE_RATE_LIMIT_WINDOW_MS, 60 * 1000),
      maxMutations: asInt(process.env.SHARE_RATE_LIMIT_MAX_MUTATIONS, 90)
    },
    allowedOrigins: (process.env.SHARE_ALLOWED_ORIGINS || '').trim(),
    security: {
      secureCookies: asBool(process.env.SECURE_COOKIES, true)
    },
    auth: {
      enabled: asBool(process.env.AUTH_ENABLED, true),
      googleClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
      googleClientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
      googleRedirectUri: (process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim(),
      cookieDomain: (process.env.AUTH_COOKIE_DOMAIN || '').trim(),
      sessionCookieName: (process.env.AUTH_SESSION_COOKIE_NAME || 'softsky_session').trim(),
      stateCookieName: (process.env.AUTH_OAUTH_STATE_COOKIE_NAME || 'softsky_oauth_state').trim(),
      sessionSecret: (process.env.AUTH_SESSION_SECRET || '').trim(),
      sessionTtlSeconds: asInt(process.env.AUTH_SESSION_TTL_SECONDS, 60 * 60 * 24 * 14)
    },
    generation: {
      anonymousLimit: asInt(process.env.GENERATION_ANON_LIMIT, 3)
    },
    gemini: {
      apiKey: (process.env.GEMINI_API_KEY || '').trim(),
      model: (process.env.GEMINI_MODEL || 'gemini-3-flash-preview').trim(),
      fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      maxOutputTokens: asInt(process.env.GEMINI_MAX_OUTPUT_TOKENS, 8192)
    },
    jobs: {
      enabled: asBool(process.env.SHARE_JOBS_ENABLED, true),
      inlineFallback: asBool(process.env.SHARE_JOBS_INLINE_FALLBACK, true),
      workerToken: (process.env.SHARE_WORKER_TOKEN || '').trim(),
      queue: {
        projectId: (process.env.SHARE_TASKS_PROJECT_ID || projectId).trim(),
        location: (process.env.SHARE_TASKS_LOCATION || process.env.REGION || 'us-central1').trim(),
        queueName: (process.env.SHARE_TASKS_QUEUE || 'softsky-generation').trim(),
        workerUrl: (process.env.SHARE_TASKS_WORKER_URL || '').trim(),
        serviceAccountEmail: (process.env.SHARE_TASKS_SERVICE_ACCOUNT || '').trim(),
        audience: (process.env.SHARE_TASKS_AUDIENCE || '').trim()
      }
    },
    localDataDir: path.resolve(backendRoot, process.env.SHARE_LOCAL_DATA_DIR || '.data'),
    gcp: {
      projectId,
      bucketName: (process.env.SHARE_GCS_BUCKET || '').trim(),
      firestoreCollection: (process.env.SHARE_FIRESTORE_COLLECTION || 'shares').trim(),
      objectPrefix: (process.env.SHARE_GCS_PREFIX || 'shares').trim(),
      idempotencyCollection: (process.env.SHARE_IDEMPOTENCY_COLLECTION || 'shareIdempotency').trim(),
      jobsCollection: (process.env.SHARE_JOBS_COLLECTION || 'shareJobs').trim(),
      generationsCollection: (process.env.GENERATION_FIRESTORE_COLLECTION || 'generations').trim(),
      generationObjectPrefix: (process.env.GENERATION_GCS_PREFIX || 'generations').trim()
    }
  }
}
