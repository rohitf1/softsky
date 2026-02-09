const hasBackticks = (value) => /```/.test(value)

export const validateGeneratedSceneCode = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Generated scene code is empty')
  }
  if (hasBackticks(value)) {
    throw new Error('Generated scene code contains markdown fences')
  }
  if (!/setupScene\s*=\s*\(app\)|function\s+setupScene\s*\(/.test(value)) {
    throw new Error('Generated scene code is missing setupScene(app)')
  }
  if (!/export\s+default/.test(value)) {
    throw new Error('Generated scene code is missing default export')
  }
}

export const validateGeneratedMusicCode = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Generated music code is empty')
  }
  if (hasBackticks(value)) {
    throw new Error('Generated music code contains markdown fences')
  }
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

