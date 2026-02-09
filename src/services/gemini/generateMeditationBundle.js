import { generateCodeWithGemini } from './geminiClient'
import { buildMusicPrompt, buildScenePrompt } from './promptTemplates'
import { simulateGeminiCode } from './simulator'

const USE_SIMULATION = import.meta.env.VITE_SIMULATE_GEMINI !== 'false'

const cleanGeneratedCode = (value) =>
  value
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
    .trim()

const requestCode = async ({ kind, intention, durationSeconds, prompt, signal, onStatus }) => {
  onStatus?.(kind, 'queued')

  if (USE_SIMULATION) {
    onStatus?.(kind, 'simulating')
    const simulated = await simulateGeminiCode({ kind, intention, durationSeconds })
    onStatus?.(kind, 'completed')
    return cleanGeneratedCode(simulated)
  }

  onStatus?.(kind, 'requesting')
  const response = await generateCodeWithGemini({ prompt, signal })
  onStatus?.(kind, 'completed')
  return cleanGeneratedCode(response)
}

export const generateMeditationBundle = async ({ intention, durationSeconds, signal, onStatus }) => {
  const scenePrompt = buildScenePrompt({ intention, durationSeconds })
  const musicPrompt = buildMusicPrompt({ intention, durationSeconds })

  const [sceneCode, musicCode] = await Promise.all([
    requestCode({ kind: 'scene', intention, durationSeconds, prompt: scenePrompt, signal, onStatus }),
    requestCode({ kind: 'music', intention, durationSeconds, prompt: musicPrompt, signal, onStatus })
  ])

  return {
    sceneCode,
    musicCode,
    prompts: {
      scenePrompt,
      musicPrompt
    },
    simulation: USE_SIMULATION
  }
}
