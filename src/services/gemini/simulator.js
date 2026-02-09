import { formatDuration } from '../../constants/durations'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomBetween = (min, max) => min + Math.random() * (max - min)

const keywordMatch = (text, terms) => {
  const value = text.toLowerCase()
  return terms.some((term) => value.includes(term))
}

const detectTheme = (intention) => {
  if (keywordMatch(intention, ['rain', 'storm', 'thunder'])) return 'rain'
  if (keywordMatch(intention, ['fire', 'warm', 'cozy', 'hearth'])) return 'fire'
  if (keywordMatch(intention, ['ocean', 'sea', 'wave', 'shore'])) return 'ocean'
  if (keywordMatch(intention, ['space', 'galaxy', 'cosmic', 'universe', 'star'])) return 'space'
  if (keywordMatch(intention, ['mountain', 'forest', 'nature', 'valley'])) return 'mountain'
  return 'space'
}

const sceneByTheme = ({ theme, intention, duration }) => {
  const notes = `Generated in simulation mode for ${duration}: ${intention}`

  if (theme === 'rain') {
    return `const sceneMeta = {
  id: 'sim-rain-thunder-scene',
  title: 'Simulated Rain Canopy',
  notes: '${notes}',
}

const setupScene = (app) => {
  const bgLayer = createLayer(app)
  const cloudLayer = createLayer(app)
  const rainLayer = createLayer(app)

  const drops = Array.from({ length: 260 }, () => ({
    x: randomRange(0, app.renderer.width),
    y: randomRange(-400, app.renderer.height),
    speed: randomRange(6, 15),
    length: randomRange(10, 26)
  }))

  const clouds = Array.from({ length: 5 }, (_, index) => ({
    x: index * 170,
    y: randomRange(40, 120),
    drift: randomRange(0.18, 0.45),
    size: randomRange(120, 210)
  }))

  const tick = (ticker) => {
    const width = app.renderer.width
    const height = app.renderer.height

    bgLayer.clear()
    bgLayer.rect(0, 0, width, height).fill({ color: 0x0b1322, alpha: 1 })
    bgLayer.rect(0, height * 0.55, width, height * 0.45).fill({ color: 0x111c30, alpha: 1 })

    cloudLayer.clear()
    for (const cloud of clouds) {
      cloud.x += cloud.drift
      if (cloud.x > width + cloud.size) cloud.x = -cloud.size

      cloudLayer.ellipse(cloud.x, cloud.y, cloud.size, cloud.size * 0.34).fill({ color: 0x1a2b4d, alpha: 0.55 })
      cloudLayer.ellipse(cloud.x - cloud.size * 0.25, cloud.y + 8, cloud.size * 0.45, cloud.size * 0.22).fill({ color: 0x132540, alpha: 0.5 })
      cloudLayer.ellipse(cloud.x + cloud.size * 0.24, cloud.y + 10, cloud.size * 0.52, cloud.size * 0.26).fill({ color: 0x203055, alpha: 0.45 })
    }

    rainLayer.clear()
    for (const drop of drops) {
      rainLayer.moveTo(drop.x, drop.y)
      rainLayer.lineTo(drop.x - 2, drop.y + drop.length)
      rainLayer.stroke({ width: 1.1, color: 0x9fbeed, alpha: 0.48 })

      drop.y += drop.speed * ticker.deltaTime
      if (drop.y > height + 20) {
        drop.y = -40
        drop.x = randomRange(0, width)
      }
    }
  }

  app.ticker.add(tick)
  return () => {
    app.ticker.remove(tick)
    bgLayer.destroy()
    cloudLayer.destroy()
    rainLayer.destroy()
  }
}

export default { ...sceneMeta, setupScene }
`
  }

  if (theme === 'fire') {
    return `const sceneMeta = {
  id: 'sim-fire-hearth-scene',
  title: 'Simulated Hearth Glow',
  notes: '${notes}',
}

const setupScene = (app) => {
  const bgLayer = createLayer(app)
  const hearthLayer = createLayer(app)
  const emberLayer = createLayer(app)

  const embers = Array.from({ length: 110 }, () => ({
    x: randomRange(-20, 20),
    y: randomRange(-50, 20),
    size: randomRange(1, 3),
    rise: randomRange(0.4, 1.5),
    sway: randomRange(0.01, 0.05),
    phase: randomRange(0, Math.PI * 2)
  }))

  let time = 0

  const tick = (ticker) => {
    const width = app.renderer.width
    const height = app.renderer.height
    const cx = width * 0.5
    const cy = height * 0.72

    time += ticker.deltaTime * 0.03

    bgLayer.clear()
    bgLayer.rect(0, 0, width, height).fill({ color: 0x1b1010, alpha: 1 })
    bgLayer.rect(0, height * 0.58, width, height * 0.42).fill({ color: 0x2b1812, alpha: 1 })

    hearthLayer.clear()
    hearthLayer.ellipse(cx, cy, width * 0.34, height * 0.1).fill({ color: 0x2f1a12, alpha: 0.95 })
    hearthLayer.circle(cx, cy - height * 0.07, width * 0.065 + Math.sin(time * 2.2) * 4).fill({ color: 0xff8f4d, alpha: 0.45 })
    hearthLayer.circle(cx, cy - height * 0.08, width * 0.045 + Math.sin(time * 2.7 + 1.1) * 2).fill({ color: 0xffda97, alpha: 0.5 })

    emberLayer.clear()
    for (const ember of embers) {
      ember.phase += ember.sway
      const x = cx + ember.x + Math.sin(ember.phase) * 8
      const y = cy - 16 + ember.y

      emberLayer.circle(x, y, ember.size).fill({ color: 0xffc27c, alpha: 0.4 })

      ember.y -= ember.rise * ticker.deltaTime
      if (ember.y < -height * 0.36) {
        ember.y = randomRange(-40, 20)
        ember.x = randomRange(-22, 22)
      }
    }
  }

  app.ticker.add(tick)
  return () => {
    app.ticker.remove(tick)
    bgLayer.destroy()
    hearthLayer.destroy()
    emberLayer.destroy()
  }
}

export default { ...sceneMeta, setupScene }
`
  }

  if (theme === 'space') {
    return `const sceneMeta = {
  id: 'sim-cosmic-drift-scene',
  title: 'Simulated Cosmic Drift',
  notes: '${notes}',
}

const setupScene = (app) => {
  const bgLayer = createLayer(app)
  const starsLayer = createLayer(app)
  const coreLayer = createLayer(app)

  const stars = Array.from({ length: 220 }, () => ({
    x: Math.random(),
    y: Math.random(),
    twinkle: randomRange(0, Math.PI * 2),
    drift: randomRange(0.04, 0.14),
    size: randomRange(0.8, 2.6)
  }))

  let time = 0

  const tick = (ticker) => {
    const width = app.renderer.width
    const height = app.renderer.height
    const cx = width / 2
    const cy = height / 2
    time += ticker.deltaTime * 0.02

    bgLayer.clear()
    bgLayer.rect(0, 0, width, height).fill({ color: 0x09091b, alpha: 1 })

    starsLayer.clear()
    for (const star of stars) {
      star.twinkle += star.drift * ticker.deltaTime
      const alpha = 0.2 + (Math.sin(star.twinkle) + 1) * 0.32
      starsLayer.circle(star.x * width, star.y * height, star.size).fill({ color: 0xd8e4ff, alpha })
    }

    coreLayer.clear()
    coreLayer.ellipse(cx, cy, width * 0.28, height * 0.14).fill({ color: 0x5a56d6, alpha: 0.22 })
    coreLayer.ellipse(cx, cy, width * 0.18, height * 0.09).fill({ color: 0x9ea6ff, alpha: 0.3 })
    coreLayer.circle(cx, cy, width * 0.035 + Math.sin(time * 1.7) * 3).fill({ color: 0xf3f7ff, alpha: 0.72 })
  }

  app.ticker.add(tick)
  return () => {
    app.ticker.remove(tick)
    bgLayer.destroy()
    starsLayer.destroy()
    coreLayer.destroy()
  }
}

export default { ...sceneMeta, setupScene }
`
  }

  return `const sceneMeta = {
  id: 'sim-mountain-mist-scene',
  title: 'Simulated Mountain Mist',
  notes: '${notes}',
}

const setupScene = (app) => {
  const bgLayer = createLayer(app)
  const ridgeLayer = createLayer(app)
  const mistLayer = createLayer(app)

  let time = 0

  const tick = (ticker) => {
    const width = app.renderer.width
    const height = app.renderer.height
    time += ticker.deltaTime * 0.015

    bgLayer.clear()
    bgLayer.rect(0, 0, width, height).fill({ color: 0x1a2439, alpha: 1 })
    bgLayer.rect(0, 0, width, height * 0.48).fill({ color: 0x2d3f5f, alpha: 0.55 })

    ridgeLayer.clear()
    ridgeLayer.poly([
      0, height,
      width * 0.08, height * 0.63,
      width * 0.2, height * 0.72,
      width * 0.34, height * 0.58,
      width * 0.5, height * 0.7,
      width * 0.66, height * 0.55,
      width * 0.81, height * 0.7,
      width, height * 0.6,
      width, height
    ]).fill({ color: 0x1a2335, alpha: 0.95 })

    mistLayer.clear()
    for (let i = 0; i < 3; i += 1) {
      const y = height * (0.58 + i * 0.1)
      const shift = Math.sin(time + i * 1.7) * 36
      mistLayer.ellipse(width * 0.5 + shift, y, width * 0.82, height * 0.16).fill({ color: 0x9cb6d6, alpha: 0.12 })
    }
  }

  app.ticker.add(tick)
  return () => {
    app.ticker.remove(tick)
    bgLayer.destroy()
    ridgeLayer.destroy()
    mistLayer.destroy()
  }
}

export default { ...sceneMeta, setupScene }
`
}

const musicByTheme = ({ theme, intention, duration }) => {
  const notes = `Generated in simulation mode for ${duration}: ${intention}`

  if (theme === 'rain') {
    return `const createPreset = (Tone) => {
  const session = createSession(Tone, 38)

  const bus = session.own(new Tone.Gain(0.18)).toDestination()
  const reverb = session.own(new Tone.Reverb({ decay: 8, preDelay: 0.05, wet: 0.4 })).connect(bus)
  reverb.generate()

  const pad = session.own(new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.1,
    envelope: { attack: 2.5, decay: 1.6, sustain: 0.58, release: 5.2 }
  })).connect(reverb)

  const rainFilter = session.own(new Tone.Filter({ type: 'highpass', frequency: 2400, Q: 0.35 }))
  const rainGain = session.own(new Tone.Gain(0.018)).connect(reverb)
  session.startSource(session.own(new Tone.Noise('pink'))).connect(rainFilter).connect(rainGain)

  const thunderFilter = session.own(new Tone.Filter({ type: 'lowpass', frequency: 220, Q: 0.8 }))
  const thunderGain = session.own(new Tone.Gain(0.00005)).connect(reverb)
  session.startSource(session.own(new Tone.Noise('brown'))).connect(thunderFilter).connect(thunderGain)

  const chords = [
    ['C3', 'G3', 'D4'],
    ['A2', 'E3', 'B3'],
    ['F2', 'C3', 'G3']
  ]
  let index = 0

  session.startLoop(session.own(new Tone.Loop((time) => {
    const chord = chords[index % chords.length]
    pad.triggerAttackRelease(chord, '3m', time, 0.14)
    index += 1
  }, '2m')))

  session.startLoop(session.own(new Tone.Loop((time) => {
    if (chance(0.45)) {
      thunderGain.gain.setValueAtTime(0.00005, time)
      thunderGain.gain.linearRampToValueAtTime(randomBetween(0.008, 0.02), time + randomBetween(0.12, 0.3))
      thunderGain.gain.exponentialRampToValueAtTime(0.00005, time + randomBetween(2.6, 4.2))
    }
  }, '4m')))

  return session.finish()
}

export default {
  id: 'sim-rain-music',
  title: 'Simulated Rain Resonance',
  notes: '${notes}',
  tags: ['rain', 'calm', 'ambient'],
  colors: ['#1e3358', '#6ea0df'],
  create: createPreset
}
`
  }

  if (theme === 'fire') {
    return `const createPreset = (Tone) => {
  const session = createSession(Tone, 44)

  const warmth = session.own(new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 1.8, decay: 1.3, sustain: 0.62, release: 3.8 }
  })).toDestination()

  const ember = session.own(new Tone.Oscillator({ type: 'sine', frequency: 61 }))
  const emberGain = session.own(new Tone.Gain(0.02)).toDestination()
  ember.connect(emberGain)
  session.startSource(ember)

  const sparkle = session.own(new Tone.FMSynth({
    harmonicity: 2.4,
    modulationIndex: 3,
    envelope: { attack: 0.003, decay: 0.1, sustain: 0, release: 0.12 }
  })).toDestination()

  const chords = [
    ['A2', 'E3', 'C4'],
    ['F2', 'C3', 'A3'],
    ['D2', 'A2', 'F3']
  ]
  let index = 0

  session.startLoop(session.own(new Tone.Loop((time) => {
    warmth.triggerAttackRelease(chords[index % chords.length], '2m', time, 0.11)
    index += 1

    if (chance(0.34)) {
      sparkle.triggerAttackRelease(['A4', 'C5', 'E5'][Math.floor(Math.random() * 3)], '64n', time, randomBetween(0.012, 0.03))
    }
  }, '1m')))

  return session.finish()
}

export default {
  id: 'sim-hearth-music',
  title: 'Simulated Hearth Room Quiet',
  notes: '${notes}',
  tags: ['fireplace', 'warmth', 'grounding'],
  colors: ['#321a11', '#d08543'],
  create: createPreset
}
`
  }

  if (theme === 'space') {
    return `const createPreset = (Tone) => {
  const session = createSession(Tone, 32)

  const bus = session.own(new Tone.Gain(0.27)).toDestination()
  const shimmer = session.own(new Tone.PingPongDelay({
    delayTime: '8n',
    feedback: 0.58,
    wet: 0.42
  })).connect(bus)

  const bowls = session.own(new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.25, decay: 1.8, sustain: 0.5, release: 5.5 }
  })).connect(shimmer)

  const chords = [
    ['C4', 'G4', 'D5'],
    ['A3', 'E4', 'B4'],
    ['F3', 'C4', 'G4'],
    ['D4', 'A4', 'E5']
  ]
  let index = 0

  session.startLoop(session.own(new Tone.Loop((time) => {
    bowls.triggerAttackRelease(chords[index % chords.length], '2m', time, 0.26)
    index += 1
  }, '1m')))

  return session.finish()
}

export default {
  id: 'sim-crystal-bowls-music',
  title: 'Crystal Bowls',
  notes: '${notes}',
  tags: ['bowls', 'harmonic', 'rest'],
  colors: ['#1a1533', '#6c6edb'],
  create: createPreset
}
`
  }

  if (theme === 'ocean') {
    return `const createPreset = (Tone) => {
  const session = createSession(Tone, 34)

  const bus = session.own(new Tone.Gain(0.23)).toDestination()
  const waveEnv = session.own(new Tone.AmplitudeEnvelope({ attack: 2.1, decay: 2, sustain: 0.42, release: 3 })).connect(bus)

  const waveFilter = session.own(new Tone.Filter({ type: 'lowpass', frequency: 320, Q: 0.5 })).connect(waveEnv)
  const waveOsc = session.own(new Tone.FatOscillator({ type: 'sine', frequency: 74, count: 3, spread: 18 })).connect(waveFilter)
  session.startSource(waveOsc)

  const foamFilter = session.own(new Tone.Filter({ type: 'bandpass', frequency: 860, Q: 0.8 }))
  const foamGain = session.own(new Tone.Gain(0.06)).connect(waveEnv)
  session.startSource(session.own(new Tone.Noise('pink'))).connect(foamFilter).connect(foamGain)

  session.startLoop(session.own(new Tone.Loop((time) => {
    waveEnv.triggerAttackRelease(randomBetween(3.2, 5), time, randomBetween(0.34, 0.6))
  }, '2m')))

  return session.finish()
}

export default {
  id: 'sim-ocean-wave-music',
  title: 'Simulated Ocean Wave Swell',
  notes: '${notes}',
  tags: ['ocean', 'waves', 'shoreline'],
  colors: ['#183d4a', '#7ec6d7'],
  create: createPreset
}
`
  }

  return `const createPreset = (Tone) => {
  const session = createSession(Tone, 40)

  const bus = session.own(new Tone.Gain(0.24)).toDestination()
  const pad = session.own(new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 3.2, decay: 1.6, sustain: 0.7, release: 5.4 }
  })).connect(bus)

  const bells = session.own(new Tone.FMSynth({
    harmonicity: 2.4,
    modulationIndex: 6,
    envelope: { attack: 0.01, decay: 1.1, sustain: 0, release: 1.8 }
  })).connect(bus)

  const chords = [
    ['G2', 'D3', 'B3'],
    ['C3', 'G3', 'E4'],
    ['E2', 'B2', 'G3']
  ]
  let index = 0

  session.startLoop(session.own(new Tone.Loop((time) => {
    pad.triggerAttackRelease(chords[index % chords.length], '3m', time, 0.2)
    index += 1

    if (chance(0.38)) {
      bells.triggerAttackRelease(['G5', 'A5', 'D6'][Math.floor(Math.random() * 3)], '16n', time, randomBetween(0.04, 0.1))
    }
  }, '2m')))

  return session.finish()
}

export default {
  id: 'sim-mountain-music',
  title: 'Simulated Mountain Dawn Ambience',
  notes: '${notes}',
  tags: ['mountain', 'ambient', 'dawn'],
  colors: ['#89a8d8', '#f0f4ff'],
  create: createPreset
}
`
}

export const simulateGeminiCode = async ({ kind, intention, durationSeconds }) => {
  const theme = detectTheme(intention)
  const duration = formatDuration(durationSeconds)

  await sleep(randomBetween(1800, 4300))

  if (kind === 'scene') {
    return sceneByTheme({ theme, intention, duration })
  }

  return musicByTheme({ theme, intention, duration })
}
