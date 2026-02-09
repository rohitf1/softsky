import cors from 'cors'
import express from 'express'
import { OAuth2Client } from 'google-auth-library'

import { createGoogleOauthClient } from './auth/googleOauth.js'
import { createAuthSession } from './auth/session.js'
import { resolveVisitorId } from './auth/visitorIdentity.js'
import { readConfig } from './config.js'
import { createBundleGenerator } from './generation/generateBundle.js'
import { createGeminiGenerator } from './generation/geminiClient.js'
import { createGenerationStore } from './generation/createGenerationStore.js'
import { createTaskQueueClient } from './jobs/taskQueue.js'
import { isValidGenerationId, isValidJobId, isValidShareId } from './lib/id.js'
import { createInMemoryRateLimiter } from './lib/rateLimit.js'
import { requestContextMiddleware } from './lib/requestContext.js'
import { validateGenerationInput } from './lib/validateGenerationInput.js'
import { validateSharePayload } from './lib/validateSharePayload.js'
import { createStore } from './store/createStore.js'

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_-]{8,200}$/
const MAX_THUMBNAIL_DATA_URL_LENGTH = 300_000

class HttpError extends Error {
  constructor(message, status = 500, code = '') {
    super(message)
    this.status = status
    this.code = code
  }
}

const config = readConfig()
const store = createStore(config)
const generationStore = createGenerationStore(config)
const taskQueue = createTaskQueueClient(config)
const workerOidcClient = new OAuth2Client()

const geminiGenerator = createGeminiGenerator(config)
const bundleGenerator = createBundleGenerator({
  geminiGenerator
})

const authReady =
  config.auth.enabled &&
  Boolean(
    config.auth.googleClientId &&
      config.auth.googleClientSecret &&
      config.auth.googleRedirectUri &&
      config.auth.sessionSecret
  )

const authSession = authReady ? createAuthSession(config) : null
const googleOauthClient = authReady ? createGoogleOauthClient(config) : null

const app = express()

const normalizeOrigin = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
}

const configuredOrigins = new Set(
  String(config.allowedOrigins || '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean)
)

if (configuredOrigins.size === 0) {
  const publicOrigin = normalizeOrigin(config.publicBaseUrl)
  if (publicOrigin) {
    configuredOrigins.add(publicOrigin)
  }
}

if (configuredOrigins.size === 0 && process.env.NODE_ENV !== 'production') {
  configuredOrigins.add('http://localhost:5173')
  configuredOrigins.add('http://127.0.0.1:5173')
}

const allowedOrigins = configuredOrigins.size > 0 ? configuredOrigins : null
const workerOidcServiceAccount = String(config.jobs.queue.serviceAccountEmail || '').trim().toLowerCase()
const workerOidcAudiences = Array.from(
  new Set(
    [config.jobs.queue.audience, config.jobs.queue.workerUrl]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
)

const mutationLimiter = createInMemoryRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxMutations
})

app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(requestContextMiddleware())
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }
      if (!allowedOrigins) {
        callback(null, false)
        return
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin not allowed by CORS policy'))
    }
  })
)
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  next()
})
app.use(
  express.json({
    limit: `${config.maxPayloadMb}mb`
  })
)
app.use((request, _response, next) => {
  request.user = authSession?.readSession(request) || null
  next()
})

const buildShareUrl = (request, shareId) => {
  const baseUrl = config.publicBaseUrl || `${request.protocol}://${request.get('host')}`
  return `${baseUrl.replace(/\/+$/g, '')}/s/${shareId}`
}

const normalizeReturnTo = (value) => {
  const raw = String(value || '').trim()
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//')) return '/'
  return raw
}

const buildAuthCompleteUrl = (request, { token, returnTo = '/' }) => {
  const baseUrl = config.publicBaseUrl || `${request.protocol}://${request.get('host')}`
  const url = new URL('/auth/complete', `${baseUrl.replace(/\/+$/g, '')}/`)
  url.searchParams.set('token', token)
  url.searchParams.set('returnTo', normalizeReturnTo(returnTo))
  return url.toString()
}

const readIdempotencyKey = (request) => {
  const headerValue = request.get('x-idempotency-key') || request.get('Idempotency-Key') || ''
  const key = String(headerValue).trim()
  if (!key) return ''
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    throw new HttpError('x-idempotency-key is invalid', 400, 'INVALID_IDEMPOTENCY_KEY')
  }
  return key
}

const messageFromError = (error) => (error instanceof Error ? error.message : 'Internal server error')
const dailyQuotaDateKey = () => new Date().toISOString().slice(0, 10)

const requireAuthUser = (request) => {
  if (!request.user) {
    throw new HttpError('Please sign in first.', 401, 'AUTH_REQUIRED')
  }
  return request.user
}

const isAllowedOidcIssuer = (value) => value === 'accounts.google.com' || value === 'https://accounts.google.com'

const hasValidWorkerOidcToken = async (request) => {
  if (!workerOidcServiceAccount || workerOidcAudiences.length === 0) {
    return false
  }

  const header = String(request.get('authorization') || '').trim()
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) {
    return false
  }

  try {
    const ticket = await workerOidcClient.verifyIdToken({
      idToken: match[1].trim(),
      audience: workerOidcAudiences
    })
    const payload = ticket.getPayload()
    const email = String(payload?.email || '').trim().toLowerCase()
    const emailVerified = payload?.email_verified === true || payload?.email_verified === 'true'
    const issuer = String(payload?.iss || '').trim()
    return Boolean(emailVerified && email && email === workerOidcServiceAccount && isAllowedOidcIssuer(issuer))
  } catch {
    return false
  }
}

const requireWorkerRequest = async (request) => {
  if (config.jobs.workerToken) {
    const token = request.get('x-worker-token') || ''
    if (token !== config.jobs.workerToken) {
      throw new HttpError('Unauthorized worker token', 401, 'WORKER_TOKEN_INVALID')
    }
    return
  }

  if (workerOidcServiceAccount && workerOidcAudiences.length > 0) {
    if (await hasValidWorkerOidcToken(request)) {
      return
    }
    throw new HttpError('Unauthorized worker identity', 401, 'WORKER_OIDC_INVALID')
  }

  throw new HttpError(
    'Internal worker auth is not configured correctly.',
    503,
    'WORKER_AUTH_NOT_CONFIGURED'
  )
}

const parseThumbnailDataUrl = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    throw new HttpError('thumbnailDataUrl is required', 400, 'THUMBNAIL_INVALID')
  }
  if (!normalized.startsWith('data:image/')) {
    throw new HttpError('thumbnailDataUrl must be an image data URL', 400, 'THUMBNAIL_INVALID')
  }
  if (normalized.length > MAX_THUMBNAIL_DATA_URL_LENGTH) {
    throw new HttpError('thumbnailDataUrl is too large', 400, 'THUMBNAIL_TOO_LARGE')
  }
  return normalized
}

const processShareJob = async ({ jobId, snapshot, idempotencyKey, owner }) => {
  const job = await store.markShareJobProcessing(jobId)
  if (!job) {
    throw new HttpError(`Unknown share job: ${jobId}`, 404, 'JOB_NOT_FOUND')
  }

  if (job.status === 'completed' && job.result?.shareId) {
    return job
  }

  try {
    const share = await store.createShare(snapshot, {
      idempotencyKey: idempotencyKey || `job:${jobId}`,
      ownerType: owner?.ownerType || null,
      ownerId: owner?.ownerId || null,
      ownerEmail: owner?.ownerEmail || null
    })

    const completed = await store.completeShareJob(jobId, {
      shareId: share.shareId,
      createdAt: share.createdAt
    })

    return (
      completed || {
        ...job,
        status: 'completed',
        result: {
          shareId: share.shareId,
          createdAt: share.createdAt
        }
      }
    )
  } catch (error) {
    await store.failShareJob(jobId, messageFromError(error))
    throw error
  }
}

app.get('/api/v1/healthz', (_request, response) => {
  response.json({
    ok: true,
    service: 'softsky-share-api',
    store: store.kind,
    auth: {
      enabled: config.auth.enabled,
      ready: authReady
    },
    jobs: {
      enabled: config.jobs.enabled,
      queue: Boolean(taskQueue),
      inlineFallback: config.jobs.inlineFallback
    }
  })
})

app.get('/api/v1/auth/config', (_request, response) => {
  response.json({
    enabled: config.auth.enabled,
    ready: authReady
  })
})

app.get('/api/v1/auth/session', (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json({
    authenticated: Boolean(request.user),
    user: request.user || null
  })
})

app.get('/api/v1/auth/google/start', (request, response, next) => {
  try {
    if (!authReady || !authSession || !googleOauthClient) {
      throw new HttpError('Google sign-in is not configured.', 503, 'AUTH_NOT_READY')
    }

    const returnTo = normalizeReturnTo(request.query.returnTo || '/')
    const stateToken = authSession.createOAuthStateToken(returnTo)
    response.redirect(302, googleOauthClient.buildAuthUrl(stateToken))
  } catch (error) {
    next(error)
  }
})

app.get('/api/v1/auth/google/callback', async (request, response, next) => {
  try {
    if (!authReady || !authSession || !googleOauthClient) {
      throw new HttpError('Google sign-in is not configured.', 503, 'AUTH_NOT_READY')
    }

    const code = String(request.query.code || '').trim()
    const state = String(request.query.state || '').trim()
    if (!code || !state) {
      throw new HttpError('Missing OAuth callback parameters.', 400, 'AUTH_CALLBACK_INVALID')
    }

    const statePayload = authSession.readOAuthStateToken(state)

    if (!statePayload) {
      throw new HttpError('OAuth state verification failed.', 400, 'AUTH_STATE_INVALID')
    }

    const user = await googleOauthClient.exchangeCodeForUser(code)
    const handoffToken = authSession.createLoginHandoffToken({
      user,
      returnTo: statePayload.returnTo
    })
    response.redirect(
      302,
      buildAuthCompleteUrl(request, {
        token: handoffToken,
        returnTo: statePayload.returnTo
      })
    )
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/auth/complete', (request, response, next) => {
  try {
    if (!authReady || !authSession) {
      throw new HttpError('Google sign-in is not configured.', 503, 'AUTH_NOT_READY')
    }

    const token = String(request.body?.token || '').trim()
    const payload = authSession.readLoginHandoffToken(token)
    if (!payload) {
      throw new HttpError('OAuth completion token is invalid or expired.', 400, 'AUTH_HANDOFF_INVALID')
    }

    authSession.setSession(response, payload.user)
    response.json({
      ok: true,
      returnTo: payload.returnTo
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/auth/logout', (request, response, next) => {
  try {
    if (authSession) {
      authSession.clearSession(response)
      authSession.clearOAuthState(response)
    }
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/generations', mutationLimiter, async (request, response, next) => {
  let quotaReserved = false
  let generationPersisted = false
  let quotaDateKey = ''
  try {
    const input = validateGenerationInput(request.body)
    let ownerType = 'visitor'
    let ownerId = resolveVisitorId({
      request,
      response,
      secure: config.security.secureCookies,
      domain: config.auth.cookieDomain
    })
    let ownerEmail = ''
    let remainingFreeGenerations = null

    if (request.user) {
      ownerType = 'user'
      ownerId = request.user.sub
      ownerEmail = request.user.email || ''
    } else {
      const currentCount = await generationStore.countVisitorGenerations(ownerId)
      if (currentCount >= config.generation.anonymousLimit) {
        throw new HttpError(
          `You reached the free generation limit (${config.generation.anonymousLimit}). Please sign in to continue.`,
          403,
          'AUTH_REQUIRED_FOR_MORE_GENERATIONS'
        )
      }
      remainingFreeGenerations = Math.max(0, config.generation.anonymousLimit - (currentCount + 1))
    }

    const globalDailyLimit = Number(config.generation.globalDailyLimit || 0)
    let remainingDailyGenerationsOverall = null
    if (globalDailyLimit > 0) {
      quotaDateKey = dailyQuotaDateKey()
      const quotaResult = await generationStore.acquireGlobalDailyGenerationSlot({
        dateKey: quotaDateKey,
        limit: globalDailyLimit
      })
      if (!quotaResult?.acquired) {
        throw new HttpError(
          `Daily generation limit reached (${globalDailyLimit}). Please try again tomorrow.`,
          429,
          'GLOBAL_DAILY_LIMIT_REACHED'
        )
      }
      quotaReserved = true
      remainingDailyGenerationsOverall = Number.isFinite(quotaResult?.remaining) ? quotaResult.remaining : null
    }

    const generated = await bundleGenerator.generate({
      intention: input.intention,
      durationSeconds: input.durationSeconds
    })

    const record = await generationStore.createGeneration({
      ownerType,
      ownerId,
      ownerEmail,
      intention: input.intention,
      durationSeconds: input.durationSeconds,
      backgroundTheme: input.backgroundTheme,
      sceneTime: input.sceneTime,
      sceneCode: generated.sceneCode,
      musicCode: generated.musicCode,
      prompts: generated.prompts,
      sceneModel: generated.sceneModel,
      musicModel: generated.musicModel
    })
    generationPersisted = true

    response.status(201).json({
      generationId: record.generationId,
      createdAt: record.createdAt,
      intention: record.intention,
      durationSeconds: record.durationSeconds,
      backgroundTheme: record.backgroundTheme,
      sceneTime: record.sceneTime,
      thumbnailDataUrl: record.thumbnailDataUrl || '',
      sceneCode: record.sceneCode,
      musicCode: record.musicCode,
      prompts: record.prompts,
      simulation: false,
      sceneModel: record.sceneModel,
      musicModel: record.musicModel,
      remainingFreeGenerations,
      remainingDailyGenerationsOverall
    })
  } catch (error) {
    if (quotaReserved && !generationPersisted && quotaDateKey) {
      try {
        await generationStore.releaseGlobalDailyGenerationSlot({ dateKey: quotaDateKey })
      } catch (releaseError) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'generation.quota-release.failed',
            requestId: request.requestId,
            dateKey: quotaDateKey,
            error: messageFromError(releaseError)
          })
        )
      }
    }
    next(error)
  }
})

app.get('/api/v1/generations', async (request, response, next) => {
  try {
    const user = requireAuthUser(request)
    const limit = Math.min(1000, Math.max(1, Number.parseInt(String(request.query.limit || '30'), 10) || 30))
    const items = await generationStore.listUserGenerations(user.sub, { limit })

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      items
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/v1/generations/:generationId', async (request, response, next) => {
  try {
    const user = requireAuthUser(request)
    const generationId = String(request.params.generationId || '').trim()
    if (!isValidGenerationId(generationId)) {
      throw new HttpError('Invalid generationId format', 400, 'INVALID_GENERATION_ID')
    }

    const item = await generationStore.getGenerationForOwner(generationId, {
      ownerType: 'user',
      ownerId: user.sub
    })

    if (!item) {
      throw new HttpError('Generation not found', 404, 'GENERATION_NOT_FOUND')
    }

    response.setHeader('Cache-Control', 'no-store')
    response.json(item)
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/generations/:generationId/thumbnail', mutationLimiter, async (request, response, next) => {
  try {
    const user = requireAuthUser(request)
    const generationId = String(request.params.generationId || '').trim()
    if (!isValidGenerationId(generationId)) {
      throw new HttpError('Invalid generationId format', 400, 'INVALID_GENERATION_ID')
    }

    const thumbnailDataUrl = parseThumbnailDataUrl(request.body?.thumbnailDataUrl)
    const item = await generationStore.updateGenerationThumbnailForOwner(generationId, {
      ownerType: 'user',
      ownerId: user.sub,
      thumbnailDataUrl
    })

    if (!item) {
      throw new HttpError('Generation not found', 404, 'GENERATION_NOT_FOUND')
    }

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      generationId: item.generationId,
      thumbnailDataUrl: item.thumbnailDataUrl || ''
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/shares', mutationLimiter, async (request, response, next) => {
  try {
    const user = requireAuthUser(request)
    const snapshot = validateSharePayload(request.body)
    const idempotencyKey = readIdempotencyKey(request)
    const record = await store.createShare(snapshot, {
      idempotencyKey,
      ownerType: 'user',
      ownerId: user.sub,
      ownerEmail: user.email || ''
    })

    response.status(record.reused ? 200 : 201).json({
      shareId: record.shareId,
      createdAt: record.createdAt,
      shareUrl: buildShareUrl(request, record.shareId),
      snapshotHash: record.snapshotHash,
      reused: Boolean(record.reused)
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/v1/shares/:shareId/stats', async (request, response, next) => {
  try {
    const { shareId } = request.params
    if (!isValidShareId(shareId)) {
      throw new HttpError('Invalid shareId format', 400, 'INVALID_SHARE_ID')
    }

    const stats = await store.getShareStats(shareId)
    if (!stats) {
      throw new HttpError('Share not found', 404, 'SHARE_NOT_FOUND')
    }

    response.setHeader('Cache-Control', 'public, max-age=20')
    response.json({
      shareId,
      createdAt: stats.createdAt,
      snapshotHash: stats.snapshotHash,
      viewCount: stats.viewCount,
      lastViewedAt: stats.lastViewedAt
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/v1/shares/:shareId', async (request, response, next) => {
  try {
    const { shareId } = request.params
    if (!isValidShareId(shareId)) {
      throw new HttpError('Invalid shareId format', 400, 'INVALID_SHARE_ID')
    }

    const record = await store.getShare(shareId, { incrementView: true })
    if (!record) {
      throw new HttpError('Share not found', 404, 'SHARE_NOT_FOUND')
    }

    response.setHeader('Cache-Control', 'public, max-age=30')
    response.json({
      shareId: record.shareId,
      createdAt: record.createdAt,
      snapshotHash: record.snapshotHash,
      viewCount: record.viewCount,
      lastViewedAt: record.lastViewedAt,
      snapshot: record.snapshot
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/jobs', mutationLimiter, async (request, response, next) => {
  try {
    const user = requireAuthUser(request)
    if (!config.jobs.enabled) {
      throw new HttpError('Share jobs are disabled', 503, 'JOBS_DISABLED')
    }

    const snapshot = validateSharePayload(request.body)
    const idempotencyKey = readIdempotencyKey(request)
    const job = await store.createShareJob()
    const owner = {
      ownerType: 'user',
      ownerId: user.sub,
      ownerEmail: user.email || ''
    }

    if (taskQueue) {
      await taskQueue.enqueueShareJob({
        jobId: job.jobId,
        snapshot,
        idempotencyKey,
        owner,
        requestId: request.requestId
      })
    } else if (config.jobs.inlineFallback) {
      setImmediate(() => {
        processShareJob({ jobId: job.jobId, snapshot, idempotencyKey, owner }).catch((error) => {
          console.error(
            JSON.stringify({
              level: 'error',
              event: 'jobs.inline-fallback.failed',
              jobId: job.jobId,
              error: messageFromError(error)
            })
          )
        })
      })
    }

    response.status(202).json({
      jobId: job.jobId,
      status: 'queued',
      queued: Boolean(taskQueue || config.jobs.inlineFallback),
      pollUrl: `/api/v1/jobs/${job.jobId}`
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/v1/jobs/:jobId', async (request, response, next) => {
  try {
    requireAuthUser(request)
    const { jobId } = request.params
    if (!isValidJobId(jobId)) {
      throw new HttpError('Invalid jobId format', 400, 'INVALID_JOB_ID')
    }

    const job = await store.getShareJob(jobId)
    if (!job) {
      throw new HttpError('Job not found', 404, 'JOB_NOT_FOUND')
    }

    const result =
      job.result?.shareId && isValidShareId(job.result.shareId)
        ? {
            ...job.result,
            shareUrl: buildShareUrl(request, job.result.shareId)
          }
        : job.result

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      attemptCount: job.attemptCount,
      lastAttemptAt: job.lastAttemptAt,
      error: job.error,
      result
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/v1/internal/jobs/process', mutationLimiter, async (request, response, next) => {
  try {
    await requireWorkerRequest(request)

    const jobId = String(request.body?.jobId || '').trim()
    if (!isValidJobId(jobId)) {
      throw new HttpError('Invalid jobId format', 400, 'INVALID_JOB_ID')
    }

    const snapshot = validateSharePayload(request.body?.snapshot)
    const idempotencyKey = typeof request.body?.idempotencyKey === 'string' ? request.body.idempotencyKey : ''
    const owner = request.body?.owner || null
    const job = await processShareJob({ jobId, snapshot, idempotencyKey, owner })

    response.json({
      ok: true,
      jobId,
      status: job.status,
      result: job.result
    })
  } catch (error) {
    next(error)
  }
})

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' })
})

app.use((error, request, response, _next) => {
  const message = messageFromError(error)
  const statusCode =
    Number.isFinite(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : /required|must be|invalid|too large|Request body must|origin not allowed/i.test(message)
        ? 400
        : 500

  if (statusCode >= 500) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'request.failed',
        requestId: request.requestId,
        path: request.originalUrl,
        method: request.method,
        error: message
      })
    )
  }

  response.status(statusCode).json({
    error: message,
    code: typeof error?.code === 'string' ? error.code : '',
    requestId: request.requestId
  })
})

app.listen(config.port, () => {
  console.log(
    `[softsky-api] listening on :${config.port} (store=${store.kind}, auth=${authReady ? 'ready' : 'off'}, queue=${taskQueue ? 'on' : 'off'})`
  )
})
