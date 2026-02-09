import { Firestore } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'

import { createGenerationId, isValidGenerationId } from '../lib/id.js'

const normalizePrefix = (value) => value.replace(/^\/+|\/+$/g, '')

const asIsoTime = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  return null
}

const sortByCreatedAtDesc = (values) =>
  values.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

export const createGcpGenerationStore = ({
  projectId,
  bucketName,
  generationsCollection,
  generationObjectPrefix,
  generationQuotaCollection
}) => {
  if (!bucketName) {
    throw new Error('SHARE_GCS_BUCKET is required when SHARE_STORE_DRIVER=gcp')
  }

  const firestore = new Firestore(projectId ? { projectId } : undefined)
  const storage = new Storage(projectId ? { projectId } : undefined)
  const collection = firestore.collection(generationsCollection)
  const quotaCollection = firestore.collection(generationQuotaCollection || 'generationDailyQuota')
  const bucket = storage.bucket(bucketName)
  const prefix = normalizePrefix(generationObjectPrefix || 'generations')

  const toSummary = (generationId, data) => ({
    generationId,
    createdAt: asIsoTime(data.createdAt),
    ownerType: data.ownerType,
    ownerId: data.ownerId,
    intention: data.intention || '',
    durationSeconds: Number(data.durationSeconds || 60),
    backgroundTheme: data.backgroundTheme || 'spring',
    sceneTime: data.sceneTime || 'morning',
    thumbnailDataUrl: typeof data.thumbnailDataUrl === 'string' ? data.thumbnailDataUrl : '',
    sceneModel: data.sceneModel || '',
    musicModel: data.musicModel || ''
  })

  return {
    kind: 'gcp',
    async createGeneration(input) {
      const generationId = createGenerationId()
      const createdAt = new Date().toISOString()
      const snapshotPath = `${prefix}/${input.ownerType}/${input.ownerId}/${generationId}.json`
      const snapshot = {
        schemaVersion: 1,
        generationId,
        createdAt,
        sceneCode: input.sceneCode,
        musicCode: input.musicCode,
        prompts: input.prompts || null,
        simulation: false
      }

      await bucket.file(snapshotPath).save(JSON.stringify(snapshot), {
        resumable: false,
        contentType: 'application/json; charset=utf-8'
      })

      const metadata = {
        generationId,
        createdAt,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        ownerEmail: input.ownerEmail || '',
        intention: input.intention,
        durationSeconds: input.durationSeconds,
        backgroundTheme: input.backgroundTheme,
        sceneTime: input.sceneTime,
        thumbnailDataUrl: typeof input.thumbnailDataUrl === 'string' ? input.thumbnailDataUrl : '',
        sceneModel: input.sceneModel || '',
        musicModel: input.musicModel || '',
        snapshotPath
      }
      await collection.doc(generationId).set(metadata)

      return {
        ...toSummary(generationId, metadata),
        sceneCode: input.sceneCode,
        musicCode: input.musicCode,
        prompts: input.prompts || null,
        simulation: false
      }
    },
    async countVisitorGenerations(visitorId) {
      const snapshot = await collection
        .where('ownerType', '==', 'visitor')
        .where('ownerId', '==', visitorId)
        .limit(10)
        .get()

      return snapshot.size
    },
    async acquireGlobalDailyGenerationSlot({ dateKey, limit }) {
      if (!dateKey || !Number.isFinite(limit) || limit <= 0) {
        return {
          acquired: true,
          current: 0,
          remaining: 0
        }
      }

      const reference = quotaCollection.doc(dateKey)
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference)
        const current = snapshot.exists ? Number(snapshot.data()?.count || 0) : 0
        if (current >= limit) {
          return {
            acquired: false,
            current,
            remaining: 0
          }
        }

        const next = current + 1
        const timestamp = new Date().toISOString()
        transaction.set(
          reference,
          {
            dateKey,
            count: next,
            limit,
            createdAt: snapshot.exists ? snapshot.data()?.createdAt || timestamp : timestamp,
            updatedAt: timestamp
          },
          { merge: true }
        )

        return {
          acquired: true,
          current: next,
          remaining: Math.max(0, limit - next)
        }
      })

      return result
    },
    async releaseGlobalDailyGenerationSlot({ dateKey }) {
      if (!dateKey) return
      const reference = quotaCollection.doc(dateKey)

      await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (!snapshot.exists) return
        const current = Number(snapshot.data()?.count || 0)
        if (current <= 0) return
        transaction.set(
          reference,
          {
            count: current - 1,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        )
      })
    },
    async listUserGenerations(userId, { limit = 30 } = {}) {
      const snapshot = await collection
        .where('ownerType', '==', 'user')
        .where('ownerId', '==', userId)
        .limit(Math.max(limit * 2, 40))
        .get()

      return sortByCreatedAtDesc(snapshot.docs.map((doc) => toSummary(doc.id, doc.data()))).slice(0, Math.max(1, limit))
    },
    async getGenerationForOwner(generationId, { ownerType, ownerId }) {
      if (!isValidGenerationId(generationId)) return null

      const doc = await collection.doc(generationId).get()
      if (!doc.exists) return null
      const metadata = doc.data()
      if (!metadata || metadata.ownerType !== ownerType || metadata.ownerId !== ownerId || !metadata.snapshotPath) {
        return null
      }

      const file = bucket.file(metadata.snapshotPath)
      const [exists] = await file.exists()
      if (!exists) return null

      const [buffer] = await file.download()
      const payload = JSON.parse(buffer.toString('utf8'))
      return {
        ...toSummary(generationId, metadata),
        sceneCode: payload.sceneCode,
        musicCode: payload.musicCode,
        prompts: payload.prompts || null,
        simulation: false
      }
    },
    async updateGenerationThumbnailForOwner(generationId, { ownerType, ownerId, thumbnailDataUrl }) {
      if (!isValidGenerationId(generationId)) return null
      const reference = collection.doc(generationId)
      const snapshot = await reference.get()
      if (!snapshot.exists) return null

      const metadata = snapshot.data()
      if (!metadata || metadata.ownerType !== ownerType || metadata.ownerId !== ownerId) {
        return null
      }

      await reference.update({
        thumbnailDataUrl
      })

      return toSummary(generationId, {
        ...metadata,
        thumbnailDataUrl
      })
    }
  }
}
