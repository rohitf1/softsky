import fs from 'node:fs/promises'
import path from 'node:path'

import { sha256Hex } from '../lib/hash.js'
import { createJobId, createShareId } from '../lib/id.js'

const ensureDirectory = async (directoryPath) => {
  await fs.mkdir(directoryPath, { recursive: true })
}

const readJsonFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const writeJsonFile = (filePath, value) => fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')

const writeJsonExclusive = async (filePath, value) => {
  const handle = await fs.open(filePath, 'wx')
  try {
    await handle.writeFile(JSON.stringify(value, null, 2), 'utf8')
  } finally {
    await handle.close()
  }
}

const normalizeShareRecord = ({ envelope, shareId }) => ({
  shareId: envelope.shareId || shareId,
  createdAt: envelope.createdAt || null,
  snapshotHash: envelope.snapshotHash || sha256Hex(JSON.stringify(envelope.snapshot || {})),
  snapshotPath: `local://shares/${shareId}.json`,
  viewCount: Number(envelope.viewCount || 0),
  lastViewedAt: envelope.lastViewedAt || null,
  snapshot: envelope.snapshot || null
})

const normalizeJobRecord = ({ envelope, jobId }) => ({
  jobId: envelope.jobId || jobId,
  status: envelope.status || 'queued',
  createdAt: envelope.createdAt || null,
  updatedAt: envelope.updatedAt || envelope.createdAt || null,
  attemptCount: Number(envelope.attemptCount || 0),
  lastAttemptAt: envelope.lastAttemptAt || null,
  error: envelope.error || null,
  result: envelope.result || null
})

export const createLocalStore = ({ dataDir }) => {
  const sharesDir = path.join(dataDir, 'shares')
  const idempotencyDir = path.join(dataDir, 'idempotency')
  const jobsDir = path.join(dataDir, 'jobs')
  let initialized = false

  const init = async () => {
    if (initialized) return
    await Promise.all([ensureDirectory(sharesDir), ensureDirectory(idempotencyDir), ensureDirectory(jobsDir)])
    initialized = true
  }

  const buildSharePath = (shareId) => path.join(sharesDir, `${shareId}.json`)
  const buildIdempotencyPath = (idempotencyHash) => path.join(idempotencyDir, `${idempotencyHash}.json`)
  const buildJobPath = (jobId) => path.join(jobsDir, `${jobId}.json`)

  const readShareEnvelope = async (shareId) => {
    const envelope = await readJsonFile(buildSharePath(shareId))
    if (!envelope?.snapshot) return null
    return envelope
  }

  const readJobEnvelope = (jobId) => readJsonFile(buildJobPath(jobId))

  return {
    kind: 'local',
    async createShare(snapshot, options = {}) {
      await init()

      const idempotencyKey = typeof options.idempotencyKey === 'string' ? options.idempotencyKey.trim() : ''
      const idempotencyHash = idempotencyKey ? sha256Hex(`share:${idempotencyKey}`) : ''
      if (idempotencyHash) {
        const mapping = await readJsonFile(buildIdempotencyPath(idempotencyHash))
        if (mapping?.shareId) {
          const existingEnvelope = await readShareEnvelope(mapping.shareId)
          if (existingEnvelope) {
            return {
              ...normalizeShareRecord({ envelope: existingEnvelope, shareId: mapping.shareId }),
              reused: true
            }
          }
        }
      }

      const shareId = createShareId()
      const createdAt = new Date().toISOString()
      const baseEnvelope = {
        schemaVersion: 1,
        shareId,
        createdAt,
        snapshot
      }
      const snapshotHash = sha256Hex(JSON.stringify(baseEnvelope))
      const envelope = {
        ...baseEnvelope,
        snapshotHash,
        viewCount: 0,
        lastViewedAt: null,
        idempotencyHash: idempotencyHash || null,
        ownerType: options.ownerType || null,
        ownerId: options.ownerId || null,
        ownerEmail: options.ownerEmail || null
      }

      const sharePath = buildSharePath(shareId)
      await writeJsonFile(sharePath, envelope)

      if (idempotencyHash) {
        const mappingPath = buildIdempotencyPath(idempotencyHash)
        try {
          await writeJsonExclusive(mappingPath, {
            idempotencyHash,
            shareId,
            createdAt,
            snapshotHash
          })
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error

          const mapping = await readJsonFile(mappingPath)
          if (mapping?.shareId) {
            const existingEnvelope = await readShareEnvelope(mapping.shareId)
            if (existingEnvelope) {
              await fs.rm(sharePath, { force: true })
              return {
                ...normalizeShareRecord({ envelope: existingEnvelope, shareId: mapping.shareId }),
                reused: true
              }
            }
          }
        }
      }

      return {
        ...normalizeShareRecord({ envelope, shareId }),
        reused: false
      }
    },
    async getShare(shareId, options = {}) {
      await init()
      const incrementView = Boolean(options.incrementView)
      const sharePath = buildSharePath(shareId)
      const envelope = await readShareEnvelope(shareId)
      if (!envelope) return null

      if (incrementView) {
        envelope.viewCount = Number(envelope.viewCount || 0) + 1
        envelope.lastViewedAt = new Date().toISOString()
        await writeJsonFile(sharePath, envelope)
      }

      return normalizeShareRecord({ envelope, shareId })
    },
    async getShareStats(shareId) {
      await init()
      const envelope = await readShareEnvelope(shareId)
      if (!envelope) return null

      return {
        shareId: envelope.shareId || shareId,
        createdAt: envelope.createdAt || null,
        snapshotHash: envelope.snapshotHash || sha256Hex(JSON.stringify(envelope.snapshot || {})),
        viewCount: Number(envelope.viewCount || 0),
        lastViewedAt: envelope.lastViewedAt || null
      }
    },
    async createShareJob() {
      await init()
      const jobId = createJobId()
      const createdAt = new Date().toISOString()
      const envelope = {
        schemaVersion: 1,
        jobId,
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        attemptCount: 0,
        lastAttemptAt: null,
        error: null,
        result: null
      }

      await writeJsonFile(buildJobPath(jobId), envelope)
      return normalizeJobRecord({ envelope, jobId })
    },
    async getShareJob(jobId) {
      await init()
      const envelope = await readJobEnvelope(jobId)
      if (!envelope) return null
      return normalizeJobRecord({ envelope, jobId })
    },
    async markShareJobProcessing(jobId) {
      await init()
      const jobPath = buildJobPath(jobId)
      const envelope = await readJobEnvelope(jobId)
      if (!envelope) return null

      if (envelope.status !== 'completed') {
        const now = new Date().toISOString()
        envelope.status = 'processing'
        envelope.updatedAt = now
        envelope.lastAttemptAt = now
        envelope.attemptCount = Number(envelope.attemptCount || 0) + 1
        envelope.error = null
        await writeJsonFile(jobPath, envelope)
      }

      return normalizeJobRecord({ envelope, jobId })
    },
    async completeShareJob(jobId, result) {
      await init()
      const jobPath = buildJobPath(jobId)
      const envelope = await readJobEnvelope(jobId)
      if (!envelope) return null

      const now = new Date().toISOString()
      envelope.status = 'completed'
      envelope.updatedAt = now
      envelope.error = null
      envelope.result = {
        shareId: result?.shareId || null,
        createdAt: result?.createdAt || now
      }

      await writeJsonFile(jobPath, envelope)
      return normalizeJobRecord({ envelope, jobId })
    },
    async failShareJob(jobId, message) {
      await init()
      const jobPath = buildJobPath(jobId)
      const envelope = await readJobEnvelope(jobId)
      if (!envelope) return null

      envelope.status = 'failed'
      envelope.updatedAt = new Date().toISOString()
      envelope.error = typeof message === 'string' && message.trim() ? message.trim() : 'Share job failed'

      await writeJsonFile(jobPath, envelope)
      return normalizeJobRecord({ envelope, jobId })
    }
  }
}
