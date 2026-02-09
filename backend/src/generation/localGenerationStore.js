import fs from 'node:fs/promises'
import path from 'node:path'

import { createGenerationId, isValidGenerationId } from '../lib/id.js'

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

const readAllJson = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name)
  const values = await Promise.all(files.map((file) => readJsonFile(path.join(directoryPath, file))))
  return values.filter(Boolean)
}

export const createLocalGenerationStore = ({ dataDir }) => {
  const generationsDir = path.join(dataDir, 'generations')
  let initialized = false

  const init = async () => {
    if (initialized) return
    await ensureDirectory(generationsDir)
    initialized = true
  }

  const buildGenerationPath = (generationId) => path.join(generationsDir, `${generationId}.json`)

  const toSummary = (record) => ({
    generationId: record.generationId,
    createdAt: record.createdAt,
    ownerType: record.ownerType,
    ownerId: record.ownerId,
    intention: record.intention,
    durationSeconds: record.durationSeconds,
    backgroundTheme: record.backgroundTheme,
    sceneTime: record.sceneTime,
    thumbnailDataUrl: typeof record.thumbnailDataUrl === 'string' ? record.thumbnailDataUrl : '',
    sceneModel: record.sceneModel || '',
    musicModel: record.musicModel || ''
  })

  const canRead = ({ record, ownerType, ownerId }) => record.ownerType === ownerType && record.ownerId === ownerId

  return {
    kind: 'local',
    async createGeneration(input) {
      await init()
      const generationId = createGenerationId()
      const createdAt = new Date().toISOString()
      const record = {
        schemaVersion: 1,
        generationId,
        createdAt,
        ...input
      }

      await fs.writeFile(buildGenerationPath(generationId), JSON.stringify(record, null, 2), 'utf8')
      return {
        ...toSummary(record),
        sceneCode: input.sceneCode,
        musicCode: input.musicCode,
        prompts: input.prompts || null,
        simulation: false
      }
    },
    async countVisitorGenerations(visitorId) {
      await init()
      const all = await readAllJson(generationsDir)
      return all.filter((record) => record.ownerType === 'visitor' && record.ownerId === visitorId).length
    },
    async listUserGenerations(userId, { limit = 30 } = {}) {
      await init()
      const all = await readAllJson(generationsDir)
      return all
        .filter((record) => record.ownerType === 'user' && record.ownerId === userId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, Math.max(1, limit))
        .map(toSummary)
    },
    async getGenerationForOwner(generationId, { ownerType, ownerId }) {
      await init()
      if (!isValidGenerationId(generationId)) return null
      const record = await readJsonFile(buildGenerationPath(generationId))
      if (!record) return null
      if (!canRead({ record, ownerType, ownerId })) return null

      return {
        ...toSummary(record),
        sceneCode: record.sceneCode,
        musicCode: record.musicCode,
        prompts: record.prompts || null,
        simulation: false
      }
    },
    async updateGenerationThumbnailForOwner(generationId, { ownerType, ownerId, thumbnailDataUrl }) {
      await init()
      if (!isValidGenerationId(generationId)) return null
      const record = await readJsonFile(buildGenerationPath(generationId))
      if (!record) return null
      if (!canRead({ record, ownerType, ownerId })) return null

      const nextRecord = {
        ...record,
        thumbnailDataUrl
      }
      await fs.writeFile(buildGenerationPath(generationId), JSON.stringify(nextRecord, null, 2), 'utf8')
      return toSummary(nextRecord)
    }
  }
}
