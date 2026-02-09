import { formatDuration } from '../../constants/durations'

const outputRules = [
  'Output only JavaScript code.',
  'No markdown.',
  'No backticks.',
  'No explanations.'
].join(' ')

export const buildScenePrompt = ({ intention, durationSeconds }) => {
  const duration = formatDuration(durationSeconds)

  return `You are generating one PixiJS scene module for runtime eval in a meditation app. ${outputRules}

Context:
- The scene runs fullscreen inside a card with responsive width/height.
- Available helpers in scope: createLayer(app), randomRange(min,max).
- Do not import anything.
- Use this shape:
  const sceneMeta = { id, title, notes }
  const setupScene = (app) => { ...; return cleanup }
  export default { ...sceneMeta, setupScene }

Technical rules:
- Use Pixi v8-safe drawing APIs on Graphics:
  clear(), rect().fill(), circle().fill(), ellipse().fill(), moveTo/lineTo + stroke().
- Render a visible background each frame.
- Add ticker callback and remove it in cleanup.
- Destroy every created layer in cleanup.
- No app lifecycle creation/destruction.

Design target:
- Meditation scene for: "${intention}".
- Intended meditation duration: ${duration}.
- Calm motion, no strobe, no harsh flashes.
- Theme/time-of-day/palette should follow the user's request in the intention.
- Do not hardcode light/dark or day/night defaults unless requested.
- Include a focal element and a subtle ambient layer.
`
}

export const buildMusicPrompt = ({ intention, durationSeconds }) => {
  const duration = formatDuration(durationSeconds)

  return `You are generating one Tone.js music preset module for runtime eval in a meditation app. ${outputRules}

Context:
- Available helpers in scope: createSession(Tone,bpm), chance(p), randomBetween(min,max).
- Do not import anything.
- Use this shape:
  const createPreset = (Tone) => { ...; return session.finish() }
  export default { id, title, notes, tags, colors, create: createPreset }

Technical rules:
- Start with const session = createSession(Tone, BPM).
- Register every node using session.own(...).
- Register loops with session.startLoop(...).
- Register sources with session.startSource(...).
- Return session.finish().
- Keep levels soft and balanced.

Design target:
- Meditation intention: "${intention}".
- Must feel coherent for a ${duration} session.
- Build one base bed, one ambient motion layer, and one subtle accent layer.
- Include at least one soft piano or piano-like melodic layer.
- No noise textures: do not use Tone.Noise or Tone.NoiseSynth.
- Add clear fade-in and fade-out using gain automation (audible ramps, no abrupt start/stop).
- Default mood should be calm, warm, bright, cheerful, and uplifting unless the user explicitly asks for darker energy.
- Avoid dark/ominous/aggressive or band-like heavy outcomes unless explicitly requested.
- No abrupt jumps.
`
}
