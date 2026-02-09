import { FieldValue, Firestore } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'

import { sha256Hex } from '../lib/hash.js'
import { createJobId, createShareId } from '../lib/id.js'

const normalizePrefix = (value) => value.replace(/^\/+|\/+$/g, '')

const asIsoTime = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  return null
}

const isAlreadyExistsError = (error) =>
  error?.code === 6 ||
  error?.code === '6' ||
  error?.code === 'already-exists' ||
  /already exists/i.test(String(error?.message || ''))

const normalizeJobRecord = (jobId, data) => ({
  jobId,
  status: data?.status || 'queued',
  createdAt: asIsoTime(data?.createdAt),
  updatedAt: asIsoTime(data?.updatedAt) || asIsoTime(data?.createdAt),
  attemptCount: Number(data?.attemptCount || 0),
  lastAttemptAt: asIsoTime(data?.lastAttemptAt),
  error: data?.error || null,
  result: data?.result || null
})

export const createGcpStore = ({
  projectId,
  bucketName,
  firestoreCollection,
  objectPrefix,
  idempotencyCollection,
  jobsCollection
}) => {
  if (!bucketName) {
    throw new Error('SHARE_GCS_BUCKET is required when SHARE_STORE_DRIVER=gcp')
  }

  const firestore = new Firestore(projectId ? { projectId } : undefined)
  const storage = new Storage(projectId ? { projectId } : undefined)
  const sharesCollection = firestore.collection(firestoreCollection)
  const idempotency = firestore.collection(idempotencyCollection)
  const jobs = firestore.collection(jobsCollection)
  const bucket = storage.bucket(bucketName)
  const prefix = normalizePrefix(objectPrefix || 'shares')

  const loadShareRecord = async (shareId, options = {}) => {
    const incrementView = Boolean(options.incrementView)
    const docRef = sharesCollection.doc(shareId)
    const doc = await docRef.get()
    if (!doc.exists) return null

    const metadata = doc.data()
    if (!metadata?.snapshotPath || metadata.status !== 'ready') return null

    if (incrementView) {
      await docRef.update({
        viewCount: FieldValue.increment(1),
        lastViewedAt: FieldValue.serverTimestamp()
      })
      metadata.viewCount = Number(metadata.viewCount || 0) + 1
      metadata.lastViewedAt = new Date().toISOString()
    }

    const file = bucket.file(metadata.snapshotPath)
    const [exists] = await file.exists()
    if (!exists) return null

    const [buffer] = await file.download()
    const payload = JSON.parse(buffer.toString('utf8'))
    if (!payload?.snapshot) return null

    return {
      shareId,
      createdAt: asIsoTime(metadata.createdAt) || asIsoTime(payload.createdAt),
      snapshotHash: metadata.snapshotHash || sha256Hex(JSON.stringify(payload.snapshot)),
      snapshotPath: `gs://${bucketName}/${metadata.snapshotPath}`,
      viewCount: Number(metadata.viewCount || 0),
      lastViewedAt: asIsoTime(metadata.lastViewedAt),
      snapshot: payload.snapshot
    }
  }

  const cleanupShareArtifacts = async ({ shareId, snapshotPath }) => {
    await Promise.allSettled([
      bucket.file(snapshotPath).delete({ ignoreNotFound: true }),
      sharesCollection.doc(shareId).delete()
    ])
  }

  return {
    kind: 'gcp',
    async createShare(snapshot, options = {}) {
      const idempotencyKey = typeof options.idempotencyKey === 'string' ? options.idempotencyKey.trim() : ''
      const idempotencyHash = idempotencyKey ? sha256Hex(`share:${idempotencyKey}`) : ''

      if (idempotencyHash) {
        const existingMap = await idempotency.doc(idempotencyHash).get()
        if (existingMap.exists) {
          const existingShareId = existingMap.data()?.shareId
          if (existingShareId) {
            const existing = await loadShareRecord(existingShareId, { incrementView: false })
            if (existing) return { ...existing, reused: true }
          }
        }
      }

      const shareId = createShareId()
      const createdAt = new Date().toISOString()
      const snapshotEnvelope = {
        schemaVersion: 1,
        shareId,
        createdAt,
        snapshot
      }
      const snapshotRaw = JSON.stringify(snapshotEnvelope)
      const snapshotHash = sha256Hex(snapshotRaw)
      const snapshotPath = `${prefix}/${shareId}.json`

      await bucket.file(snapshotPath).save(snapshotRaw, {
        resumable: false,
        contentType: 'application/json; charset=utf-8',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable'
        }
      })

      await sharesCollection.doc(shareId).set({
        shareId,
        createdAt,
        snapshotHash,
        snapshotPath,
        status: 'ready',
        durationSeconds: snapshot.durationSeconds,
        backgroundTheme: snapshot.backgroundTheme,
        sceneTime: snapshot.sceneTime,
        viewCount: 0,
        lastViewedAt: null,
        idempotencyHash: idempotencyHash || null,
        ownerType: options.ownerType || null,
        ownerId: options.ownerId || null,
        ownerEmail: options.ownerEmail || null
      })

      if (idempotencyHash) {
        try {
          await idempotency.doc(idempotencyHash).create({
            idempotencyHash,
            shareId,
            snapshotHash,
            createdAt
          })
        } catch (error) {
          if (!isAlreadyExistsError(error)) throw error

          const existingMap = await idempotency.doc(idempotencyHash).get()
          const existingShareId = existingMap.data()?.shareId
          if (existingShareId) {
            const existing = await loadShareRecord(existingShareId, { incrementView: false })
            if (existing) {
              await cleanupShareArtifacts({ shareId, snapshotPath })
              return { ...existing, reused: true }
            }
          }
        }
      }

      return {
        shareId,
        createdAt,
        snapshotHash,
        snapshotPath: `gs://${bucketName}/${snapshotPath}`,
        viewCount: 0,
        lastViewedAt: null,
        snapshot,
        reused: false
      }
    },
    async getShare(shareId, options = {}) {
      return loadShareRecord(shareId, options)
    },
    async getShareStats(shareId) {
      const doc = await sharesCollection.doc(shareId).get()
      if (!doc.exists) return null
      const data = doc.data()
      if (!data) return null

      return {
        shareId,
        createdAt: asIsoTime(data.createdAt),
        snapshotHash: data.snapshotHash || '',
        viewCount: Number(data.viewCount || 0),
        lastViewedAt: asIsoTime(data.lastViewedAt)
      }
    },
    async createShareJob() {
      const jobId = createJobId()
      const createdAt = new Date().toISOString()
      const data = {
        jobId,
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        attemptCount: 0,
        lastAttemptAt: null,
        error: null,
        result: null
      }

      await jobs.doc(jobId).set(data)
      return normalizeJobRecord(jobId, data)
    },
    async getShareJob(jobId) {
      const doc = await jobs.doc(jobId).get()
      if (!doc.exists) return null
      return normalizeJobRecord(jobId, doc.data())
    },
    async markShareJobProcessing(jobId) {
      const docRef = jobs.doc(jobId)
      const record = await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(docRef)
        if (!snap.exists) return null

        const current = snap.data()
        if (current.status === 'completed') {
          return normalizeJobRecord(jobId, current)
        }

        const now = new Date().toISOString()
        const next = {
          status: 'processing',
          updatedAt: now,
          lastAttemptAt: now,
          attemptCount: Number(current.attemptCount || 0) + 1,
          error: null
        }

        tx.update(docRef, next)
        return normalizeJobRecord(jobId, { ...current, ...next })
      })

      return record
    },
    async completeShareJob(jobId, result) {
      const now = new Date().toISOString()
      const payload = {
        status: 'completed',
        updatedAt: now,
        error: null,
        result: {
          shareId: result?.shareId || null,
          createdAt: result?.createdAt || now
        }
      }

      const docRef = jobs.doc(jobId)
      const snapshot = await docRef.get()
      if (!snapshot.exists) return null
      await docRef.update(payload)
      return normalizeJobRecord(jobId, { ...snapshot.data(), ...payload })
    },
    async failShareJob(jobId, message) {
      const payload = {
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: typeof message === 'string' && message.trim() ? message.trim() : 'Share job failed'
      }

      const docRef = jobs.doc(jobId)
      const snapshot = await docRef.get()
      if (!snapshot.exists) return null
      await docRef.update(payload)
      return normalizeJobRecord(jobId, { ...snapshot.data(), ...payload })
    }
  }
}
