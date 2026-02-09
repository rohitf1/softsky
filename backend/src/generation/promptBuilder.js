import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const scenePromptPath = path.resolve(backendRoot, 'prompts/scene_master_prompt.txt')
const musicPromptPath = path.resolve(backendRoot, 'prompts/music_master_prompt.txt')

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const oneLine = (value) => String(value || '').replace(/\s+/g, ' ').trim()

let masterPromptCache = null

const loadMasterPrompts = async () => {
  if (masterPromptCache) return masterPromptCache

  const [sceneMasterPrompt, musicMasterPrompt] = await Promise.all([
    fs.readFile(scenePromptPath, 'utf8'),
    fs.readFile(musicPromptPath, 'utf8')
  ])

  masterPromptCache = {
    sceneMasterPrompt,
    musicMasterPrompt
  }

  return masterPromptCache
}

const buildScenePromptOverride = ({ sceneId, title, notes, order, intention, durationSeconds }) => `
REQUEST OVERRIDE FOR THIS RUN
- Ignore any fixed example concept/id/order earlier in the template.
- Use these exact values:
  - id: '${sceneId}'
  - title: '${title}'
  - notes: '${notes}'
  - order: ${order}
  - concept: '${oneLine(intention)}'
  - target duration seconds: ${durationSeconds}
- Return ONLY raw JavaScript code.
`

const buildMusicPromptOverride = ({ musicId, title, notes, order, intention, durationSeconds }) => `
REQUEST OVERRIDE FOR THIS RUN
- Ignore any fixed example concept/id/order earlier in the template.
- Use these exact values:
  - id: '${musicId}'
  - title: '${title}'
  - notes: '${notes}'
  - tags: ['ai', 'meditation', 'ambient']
  - colors: ['#1f4e79', '#8ec5fc']
  - order: ${order}
  - concept: '${oneLine(intention)}'
  - target duration seconds: ${durationSeconds}
- Return ONLY raw JavaScript code.
`

export const buildGenerationPrompts = async ({ intention, durationSeconds }) => {
  const { sceneMasterPrompt, musicMasterPrompt } = await loadMasterPrompts()
  const baseSlug = slugify(intention).slice(0, 24) || 'meditation'
  const suffix = Date.now().toString(36).slice(-5)
  const sceneId = `ai-scene-${baseSlug}-${suffix}`
  const musicId = `ai-music-${baseSlug}-${suffix}`
  const order = Date.now()

  const sceneTitle = `Generated ${baseSlug.replace(/-/g, ' ')}`
  const musicTitle = `Generated ${baseSlug.replace(/-/g, ' ')}`
  const sceneNotes = `AI generated scene for ${durationSeconds}s`
  const musicNotes = `AI generated soundscape for ${durationSeconds}s`

  return {
    scenePrompt: `${sceneMasterPrompt}\n${buildScenePromptOverride({
      sceneId,
      title: sceneTitle,
      notes: sceneNotes,
      order,
      intention,
      durationSeconds
    })}`,
    musicPrompt: `${musicMasterPrompt}\n${buildMusicPromptOverride({
      musicId,
      title: musicTitle,
      notes: musicNotes,
      order,
      intention,
      durationSeconds
    })}`
  }
}

