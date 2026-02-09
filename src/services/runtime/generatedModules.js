const stripMarkdownFence = (value) =>
  value
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
    .trim()

const sanitizeModuleCode = (rawCode) =>
  stripMarkdownFence(rawCode)
    .replace(/^\s*import\s.+$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^\s*export\s+const\s+/gm, 'const ')
    .replace(/^\s*export\s+function\s+/gm, 'function ')
    .replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, '')

const UNSAFE_MODULE_PATTERNS = [
  /\b(?:eval|Function)\s*\(/,
  /constructor\s*\.\s*constructor/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\b(?:window|document|localStorage|sessionStorage|indexedDB|navigator|history|globalThis)\b/,
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/,
  /\b(?:Worker|SharedWorker|ServiceWorker)\b/
]

const assertSafeGeneratedModule = (code, label) => {
  for (const pattern of UNSAFE_MODULE_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`Generated ${label} module contains blocked pattern: ${pattern}`)
    }
  }
}

export const compileSceneModule = ({ code, runtime }) => {
  const sanitizedCode = sanitizeModuleCode(code)
  assertSafeGeneratedModule(sanitizedCode, 'scene')

  const factory = new Function(
    'deps',
    `
'use strict'
const { createLayer, randomRange } = deps
const window = undefined
const document = undefined
const fetch = undefined
const XMLHttpRequest = undefined
const WebSocket = undefined
const EventSource = undefined
${sanitizedCode}

const candidate =
  (typeof __default__ !== 'undefined' && __default__) ||
  (typeof sceneMeta !== 'undefined' && typeof setupScene === 'function' && { ...sceneMeta, setupScene }) ||
  (typeof setupScene === 'function' && { setupScene })

if (!candidate || typeof candidate.setupScene !== 'function') {
  throw new Error('Generated scene module is missing setupScene(app)')
}

return {
  id: candidate.id || 'generated-scene',
  title: candidate.title || 'Generated Scene',
  notes: candidate.notes || 'Generated scene module',
  setupScene: candidate.setupScene
}
`
  )

  return factory(runtime)
}

export const compileMusicModule = ({ code, runtime }) => {
  const sanitizedCode = sanitizeModuleCode(code)
  assertSafeGeneratedModule(sanitizedCode, 'music')

  const factory = new Function(
    'deps',
    `
'use strict'
const { createSession, chance, randomBetween } = deps
const window = undefined
const document = undefined
const fetch = undefined
const XMLHttpRequest = undefined
const WebSocket = undefined
const EventSource = undefined
${sanitizedCode}

const candidate =
  (typeof __default__ !== 'undefined' && __default__) ||
  (typeof presetMeta !== 'undefined' && typeof create === 'function' && { ...presetMeta, create }) ||
  (typeof createMusic === 'function' && { create: createMusic })

if (!candidate || typeof candidate.create !== 'function') {
  throw new Error('Generated music module is missing create(Tone)')
}

return {
  id: candidate.id || 'generated-music',
  title: candidate.title || 'Generated Music',
  notes: candidate.notes || 'Generated music module',
  tags: Array.isArray(candidate.tags) ? candidate.tags : ['ambient'],
  colors: Array.isArray(candidate.colors) && candidate.colors.length >= 2
    ? candidate.colors.slice(0, 2)
    : ['#23324f', '#425f86'],
  create: (Tone) => {
    const teardown = candidate.create(Tone)
    return () => {
      if (typeof teardown === 'function') teardown()
    }
  }
}
`
  )

  return factory(runtime)
}
