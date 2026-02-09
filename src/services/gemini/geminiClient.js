import { GoogleGenAI } from '@google/genai'

const DEFAULT_MODEL = 'gemini-2.5-flash'

let cachedClient = null
let cachedKey = null

const getClient = (apiKey) => {
  if (!apiKey) {
    throw new Error('Missing API key. Set VITE_GEMINI_API_KEY to use live generation.')
  }

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey })
    cachedKey = apiKey
  }

  return cachedClient
}

const extractText = (response) => {
  if (typeof response?.text === 'string' && response.text.trim().length > 0) {
    return response.text.trim()
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((part) => part?.text ?? '')
    .join('')
    .trim()

  if (text.length > 0) return text

  throw new Error('Gemini returned an empty response')
}

export const generateCodeWithGemini = async ({ prompt, signal }) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  const model = import.meta.env.VITE_GEMINI_MODEL || DEFAULT_MODEL

  const ai = getClient(apiKey)
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 8192
    },
    signal
  })

  return extractText(response)
}
