import { useEffect, useRef, useState } from 'react'
import PixiGeneratedSceneHost from '../../../pixi/PixiGeneratedSceneHost'

const formatRemaining = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  if (mins === 0) return String(secs)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export default function ScenePlaybackPanel({
  sceneModule,
  playbackStatus,
  onPlay,
  onPause,
  onStop,
  onReplay,
  onExtendDuration,
  onReduceDuration,
  isMuted,
  onToggleMute,
  volume,
  onVolumeChange,
  canPlay,
  remainingMs,
  onSceneReady,
  onSceneSnapshot,
  onShare,
  isSharing = false,
  phase = 'ready'
}) {
  const containerRef = useRef(null)
  const snapshotTimeoutRef = useRef(null)
  const snapshotCompleteRef = useRef(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isControlsRevealed, setIsControlsRevealed] = useState(false)
  const isPlaying = playbackStatus === 'playing'
  const isPaused = playbackStatus === 'paused'
  const isCompleted = playbackStatus === 'completed'
  const showStop = isPlaying || isPaused
  const showQuickReplay = isPaused
  const showReduce = Boolean(onReduceDuration)
  const showExtend = Boolean(onExtendDuration)
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const remainingLabel = formatRemaining(remainingSeconds * 1000)
  const iconBase = 'https://api.iconify.design/lucide'
  const iconUrl = (name) => `url('${iconBase}/${name}.svg')`
  const volumePercent = Math.round((volume ?? 0) * 100)
  const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(getFullscreenElement() === containerRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    handleFullscreenChange()
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    snapshotCompleteRef.current = false
    if (snapshotTimeoutRef.current) {
      clearTimeout(snapshotTimeoutRef.current)
      snapshotTimeoutRef.current = null
    }
  }, [sceneModule])

  useEffect(
    () => () => {
      if (snapshotTimeoutRef.current) {
        clearTimeout(snapshotTimeoutRef.current)
        snapshotTimeoutRef.current = null
      }
    },
    []
  )

  useEffect(() => {
    const handleWindowBlur = () => {
      setIsControlsRevealed(false)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        setIsControlsRevealed(false)
      }
    }

    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const handleVolumeInput = (event) => {
    const nextValue = Number(event.target.value)
    if (Number.isNaN(nextValue)) return
    onVolumeChange?.(nextValue / 100)
  }

  const handlePrimaryAction = () => {
    if (isCompleted) {
      onReplay()
      return
    }
    if (isPlaying) {
      onPause()
      return
    }
    onPlay()
  }

  const primaryIcon = isCompleted ? 'rotate-ccw' : isPlaying ? 'pause' : 'play'
  const primaryLabel = isCompleted ? 'Replay' : isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'
  const primaryAriaLabel = isCompleted
    ? 'Replay'
    : isPlaying
      ? 'Pause'
      : isPaused
        ? 'Resume playback'
        : 'Play meditation'
  const primaryDisabled = primaryIcon === 'play' ? !canPlay : false

  const handleFullscreenToggle = async () => {
    const node = containerRef.current
    if (!node) return

    try {
      if (getFullscreenElement()) {
        const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen
        if (exitFullscreen) {
          await exitFullscreen.call(document)
        }
        if (screen.orientation?.unlock) {
          screen.orientation.unlock()
        }
      } else {
        const requestFullscreen = node.requestFullscreen || node.webkitRequestFullscreen
        if (requestFullscreen) {
          await requestFullscreen.call(node)
        }
        if (screen.orientation?.lock) {
          await screen.orientation.lock('landscape')
        }
      }
    } catch {
      // Keep fullscreen resilient.
    }
  }

  const handleFrameDoubleClick = (event) => {
    if (event.target instanceof Element && event.target.closest('button')) return
    event.preventDefault()
    handleFullscreenToggle()
  }

  const handleTimerEnter = () => {
    setIsControlsRevealed(true)
  }

  const handleFooterLeave = () => {
    setIsControlsRevealed(false)
  }

  const handleFooterBlur = (event) => {
    const nextTarget = event.relatedTarget
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsControlsRevealed(false)
    }
  }

  const captureSceneSnapshot = () => {
    if (snapshotCompleteRef.current || typeof onSceneSnapshot !== 'function') return
    const host = containerRef.current
    if (!host) return
    const canvas = host.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return
    if (canvas.width < 2 || canvas.height < 2) return

    const targetWidth = Math.min(340, canvas.width)
    const scale = targetWidth / canvas.width
    const targetHeight = Math.max(1, Math.floor(canvas.height * scale))

    const thumbnailCanvas = document.createElement('canvas')
    thumbnailCanvas.width = targetWidth
    thumbnailCanvas.height = targetHeight
    const context = thumbnailCanvas.getContext('2d')
    if (!context) return

    context.drawImage(canvas, 0, 0, targetWidth, targetHeight)
    const dataUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.72)
    if (!dataUrl.startsWith('data:image/')) return

    snapshotCompleteRef.current = true
    onSceneSnapshot(dataUrl)
  }

  const handleHostReady = () => {
    onSceneReady?.()
    if (snapshotTimeoutRef.current) {
      clearTimeout(snapshotTimeoutRef.current)
    }
    snapshotTimeoutRef.current = setTimeout(() => {
      snapshotTimeoutRef.current = null
      captureSceneSnapshot()
    }, 650)
  }

  return (
    <section
      ref={containerRef}
      className={`experience experience--${phase} ${isFullscreen ? 'experience--fullscreen' : ''} ${
        isControlsRevealed ? 'experience--controls-revealed' : 'experience--controls-collapsed'
      }`.trim()}
    >
      <div className="experience__frame" onDoubleClick={handleFrameDoubleClick}>
        <PixiGeneratedSceneHost setupScene={sceneModule.setupScene} onReady={handleHostReady} />
        {onShare && (
          <button
            className="experience__frame-share"
            onClick={onShare}
            disabled={isSharing}
            type="button"
            aria-label={isSharing ? 'Sharing in progress' : 'Share'}
            title={isSharing ? 'Sharing...' : 'Share'}
          >
            <span
              className={`experience__glyph experience__glyph--small experience__glyph--share ${
                isSharing ? 'experience__glyph--busy' : ''
              }`.trim()}
              style={{ '--icon-url': iconUrl('share-2') }}
              aria-hidden="true"
            />
          </button>
        )}
        <button
          className="experience__frame-fullscreen"
          onClick={handleFullscreenToggle}
          type="button"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          <span
            className="experience__glyph experience__glyph--small"
            style={{ '--icon-url': iconUrl(isFullscreen ? 'minimize' : 'maximize') }}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="experience__footer" onMouseLeave={handleFooterLeave} onBlurCapture={handleFooterBlur}>
        <div
          className="experience__timer"
          aria-live="off"
          onMouseEnter={handleTimerEnter}
          onMouseMove={handleTimerEnter}
          onPointerMove={handleTimerEnter}
          onFocus={handleTimerEnter}
          tabIndex={0}
        >
          <span
            key={remainingSeconds}
            className={`experience__countdown-tick ${!isPlaying ? 'is-paused' : ''}`.trim()}
          >
            {remainingLabel}
          </span>
        </div>

        <div className="experience__controls">
          <button
            className="experience__action"
            onClick={handlePrimaryAction}
            disabled={primaryDisabled}
            aria-label={primaryAriaLabel}
            title={primaryLabel}
            type="button"
          >
            <span
              className={`experience__glyph ${primaryIcon === 'play' ? 'experience__glyph--play' : ''}`.trim()}
              style={{ '--icon-url': iconUrl(primaryIcon) }}
              aria-hidden="true"
            />
          </button>

          {showStop && (
            <button
              className="experience__action experience__action--symbol"
              onClick={onStop}
              type="button"
              aria-label="Stop"
              title="Stop"
            >
              <span
                className="experience__glyph"
                style={{ '--icon-url': iconUrl('square') }}
                aria-hidden="true"
              />
            </button>
          )}

          {showQuickReplay && (
            <button
              className="experience__action experience__action--symbol"
              onClick={onReplay}
              type="button"
              aria-label="Restart"
              title="Restart"
            >
              <span
                className="experience__glyph"
                style={{ '--icon-url': iconUrl('rotate-ccw') }}
                aria-hidden="true"
              />
            </button>
          )}

          {showReduce && (
            <button
              className="experience__action experience__action--symbol"
              onClick={() => onReduceDuration?.()}
              type="button"
              aria-label="Subtract one minute"
              title="Subtract 1 min"
            >
              <span
                className="experience__glyph"
                style={{ '--icon-url': iconUrl('minus') }}
                aria-hidden="true"
              />
            </button>
          )}

          {showExtend && (
            <button
              className="experience__action experience__action--symbol"
              onClick={() => onExtendDuration?.()}
              type="button"
              aria-label="Add one minute"
              title="Add 1 min"
            >
              <span
                className="experience__glyph"
                style={{ '--icon-url': iconUrl('plus') }}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        <div className="experience__audio">
          <button
            className="experience__mute"
            onClick={onToggleMute}
            type="button"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <span
              className="experience__glyph experience__glyph--small"
              style={{ '--icon-url': iconUrl(isMuted ? 'volume-x' : 'volume-2') }}
              aria-hidden="true"
            />
          </button>
          <div className="experience__volume">
            <input
              className="experience__volume-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volumePercent}
              onChange={handleVolumeInput}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
