import { GoogleGenAI } from '@google/genai'

const cleanCode = (value) =>
  String(value || '')
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
    .trim()

const extractText = (response) => {
  if (typeof response?.text === 'string' && response.text.trim().length > 0) {
    return response.text.trim()
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((part) => part?.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  return text
}

export const createGeminiGenerator = (config) => {
  if (!config.gemini.apiKey) {
    throw new Error('Gemini API key is missing. Set GEMINI_API_KEY in backend environment.')
  }

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })

  const generateWithModel = async ({ model, prompt }) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: config.gemini.maxOutputTokens
      }
    })

    return {
      model,
      code: cleanCode(extractText(response))
    }
  }

  return {
    async generateScene(prompt) {
      const scene = await generateWithModel({
        model: config.gemini.model,
        prompt
      })
      return {
        sceneCode: scene.code,
        sceneModel: scene.model
      }
    },
    async generateMusic(prompt, { preferredModel = '' } = {}) {
      const music = await generateWithModel({
        model: preferredModel || config.gemini.model,
        prompt
      })
      return {
        musicCode: music.code,
        musicModel: music.model
      }
    },
    async generateSceneAndMusic({ scenePrompt, musicPrompt }) {
      const scene = await generateWithModel({
        model: config.gemini.model,
        prompt: scenePrompt
      })
      const music = await generateWithModel({
        model: scene.model,
        prompt: musicPrompt,
      })

      return {
        sceneCode: scene.code,
        musicCode: music.code,
        sceneModel: scene.model,
        musicModel: music.model
      }
    }
  }
}
