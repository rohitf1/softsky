const hasBackticks = (value) => /```/.test(value)
const MAX_GENERATED_CODE_LENGTH = 120_000

const DANGEROUS_PATTERNS = [
  /\b(?:eval|Function)\s*\(/,
  /constructor\s*\.\s*constructor/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\b/,
  /\bglobalThis\b/,
  /\b(?:window|document|localStorage|sessionStorage|indexedDB|navigator|history)\b/,
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/,
  /\b(?:Worker|SharedWorker|ServiceWorker)\b/
]

const validateCommonGeneratedCode = (value, kind) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Generated ${kind} code is empty`)
  }
  if (value.length > MAX_GENERATED_CODE_LENGTH) {
    throw new Error(`Generated ${kind} code is too large`)
  }
  if (hasBackticks(value)) {
    throw new Error(`Generated ${kind} code contains markdown fences`)
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`Generated ${kind} code uses blocked token pattern: ${pattern}`)
    }
  }
}

export const validateGeneratedSceneCode = (value) => {
  validateCommonGeneratedCode(value, 'scene')
  if (!/setupScene\s*=\s*\(app\)|function\s+setupScene\s*\(/.test(value)) {
    throw new Error('Generated scene code is missing setupScene(app)')
  }
  if (!/export\s+default/.test(value)) {
    throw new Error('Generated scene code is missing default export')
  }
}

export const validateGeneratedMusicCode = (value) => {
  validateCommonGeneratedCode(value, 'music')
  if (!/createSession\s*\(\s*Tone\s*,/.test(value)) {
    throw new Error('Generated music code must use createSession(Tone, bpm)')
  }
  if (!/return\s+session\.finish\s*\(\s*\)/.test(value)) {
    throw new Error('Generated music code must return session.finish()')
  }
  if (!/export\s+default/.test(value)) {
    throw new Error('Generated music code is missing default export')
  }
}
