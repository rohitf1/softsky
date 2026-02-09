import { Application } from 'pixi.js'
import { useEffect, useRef, useState } from 'react'

const DEFAULT_CLASS = 'generated-scene__canvas'

export default function PixiGeneratedSceneHost({ setupScene, className = DEFAULT_CLASS, onReady }) {
  const hostRef = useRef(null)
  const appRef = useRef(null)
  const resizeObserverRef = useRef(null)
  const sceneTeardownRef = useRef(null)
  const readyRafRef = useRef(null)
  const onReadyRef = useRef(onReady)
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current

    const init = async () => {
      if (!host) return

      const app = new Application()

      const width = Math.max(1, Math.floor(host.clientWidth || 1))
      const height = Math.max(1, Math.floor(host.clientHeight || 1))

      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        width,
        height
      })

      if (cancelled) {
        // Avoid the unstable destroy path in strict-mode re-mounts.
        app.ticker.stop()
        return
      }

      appRef.current = app
      host.replaceChildren(app.canvas)

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry || !appRef.current) return

        const nextWidth = Math.max(1, Math.floor(entry.contentRect.width || 1))
        const nextHeight = Math.max(1, Math.floor(entry.contentRect.height || 1))
        appRef.current.renderer.resize(nextWidth, nextHeight)
      })
      resizeObserver.observe(host)
      resizeObserverRef.current = resizeObserver

      setAppReady(true)
    }

    init().catch(() => {
      setAppReady(false)
    })

    return () => {
      cancelled = true

      if (typeof sceneTeardownRef.current === 'function') {
        sceneTeardownRef.current()
      }
      sceneTeardownRef.current = null

      if (readyRafRef.current) {
        cancelAnimationFrame(readyRafRef.current)
      }
      readyRafRef.current = null

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      resizeObserverRef.current = null

      const app = appRef.current
      if (app) {
        app.ticker.stop()

        try {
          const children = app.stage.removeChildren()
          children.forEach((child) => child?.destroy?.())
        } catch {
          // Best-effort cleanup.
        }
      }

      appRef.current = null
      host?.replaceChildren()
      setAppReady(false)
    }
  }, [])

  useEffect(() => {
    const app = appRef.current
    if (!appReady || !app || typeof setupScene !== 'function') return

    if (typeof sceneTeardownRef.current === 'function') {
      sceneTeardownRef.current()
      sceneTeardownRef.current = null
    }

    let disposed = false
    const teardown = setupScene(app)

    const safeTeardown = () => {
      if (disposed) return
      disposed = true
      if (typeof teardown === 'function') {
        teardown()
      }
    }

    sceneTeardownRef.current = safeTeardown
    if (readyRafRef.current) {
      cancelAnimationFrame(readyRafRef.current)
    }
    readyRafRef.current = requestAnimationFrame(() => {
      readyRafRef.current = null
      if (!disposed && typeof onReadyRef.current === 'function') {
        onReadyRef.current()
      }
    })

    return () => {
      safeTeardown()
      if (readyRafRef.current) {
        cancelAnimationFrame(readyRafRef.current)
      }
      readyRafRef.current = null
      if (sceneTeardownRef.current === safeTeardown) {
        sceneTeardownRef.current = null
      }
    }
  }, [setupScene, appReady])

  return <div ref={hostRef} className={className} />
}
