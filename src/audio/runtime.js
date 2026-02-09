export const randomBetween = (min, max) => min + Math.random() * (max - min)

export const chance = (threshold) => Math.random() < threshold

export const createSession = (Tone, bpm = 42) => {
  Tone.Transport.stop()
  Tone.Transport.cancel(0)
  Tone.Transport.bpm.value = bpm

  const cleanups = []

  const register = (cleanup) => {
    cleanups.push(cleanup)
  }

  const own = (node, { stopBeforeDispose = false } = {}) => {
    register(() => {
      if (stopBeforeDispose && typeof node.stop === 'function') {
        try {
          node.stop()
        } catch {
          // Ignore already-stopped nodes.
        }
      }

      node.dispose?.()
    })

    return node
  }

  const startLoop = (loop, at = 0) => {
    loop.start(at)
    register(() => {
      loop.stop()
      loop.dispose()
    })
    return loop
  }

  const startSource = (source, at = 0) => {
    source.start(at)
    register(() => {
      try {
        source.stop()
      } catch {
        // Ignore already-stopped sources.
      }
      source.dispose?.()
    })

    return source
  }

  const finish = () => {
    Tone.Transport.start('+0.05')

    return () => {
      Tone.Transport.stop()
      Tone.Transport.cancel(0)

      while (cleanups.length > 0) {
        const cleanup = cleanups.pop()
        try {
          cleanup?.()
        } catch {
          // Keep teardown resilient.
        }
      }
    }
  }

  return {
    own,
    register,
    startLoop,
    startSource,
    finish
  }
}
