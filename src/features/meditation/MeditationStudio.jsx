import { useEffect, useMemo, useRef, useState } from 'react'

import { chance, createSession, randomBetween } from '../../audio/runtime'
import { DURATION_OPTIONS } from '../../constants/durations'
import { createLayer } from '../../pixi/core/layers'
import { randomRange } from '../../pixi/core/random'
import { fetchAuthSession } from '../../services/auth/authApi'
import { ApiError } from '../../services/api/httpClient'
import { createGeneration, fetchGenerationById, listGenerations, updateGenerationThumbnail } from '../../services/generation/generationApi'
import { compileMusicModule, compileSceneModule } from '../../services/runtime/generatedModules'
import { createShare, createShareJob, fetchShareById, fetchShareJob } from '../../services/share/shareApi'
import GenerationLoader from './components/GenerationLoader'
import GenerationHistoryPanel from './components/GenerationHistoryPanel'
import MeditationComposer from './components/MeditationComposer'
import ScenePlaybackPanel from './components/ScenePlaybackPanel'
import ShareDialog from './components/ShareDialog'

const RENDER_DEPS = {
  createLayer,
  randomRange
}

const AUDIO_DEPS = {
  createSession,
  chance,
  randomBetween
}

const MIN_MASTER_VOLUME_DB = -60
const MAX_MASTER_VOLUME_DB = -12
const DEFAULT_MASTER_VOLUME_DB = -24
const DEFAULT_MASTER_VOLUME = (DEFAULT_MASTER_VOLUME_DB - MIN_MASTER_VOLUME_DB) / (MAX_MASTER_VOLUME_DB - MIN_MASTER_VOLUME_DB)
const SCENE_TRANSITION_MS = 980
const EXTEND_SESSION_STEP_MS = 60 * 1000
const MIN_SESSION_DURATION_MS = Math.min(...DURATION_OPTIONS.map((option) => option.seconds * 1000))
const SHARE_JOB_TIMEOUT_MS = 18_000
const SHARE_JOB_POLL_INTERVAL_MS = 700
const LOGIN_REQUIRED_CODES = new Set(['AUTH_REQUIRED', 'AUTH_REQUIRED_TO_SHARE', 'AUTH_REQUIRED_FOR_MORE_GENERATIONS'])
const HISTORY_PAGE_SIZE = 40
const HISTORY_MAX_LIMIT = 1000

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const volumeToDb = (value) => MIN_MASTER_VOLUME_DB + (MAX_MASTER_VOLUME_DB - MIN_MASTER_VOLUME_DB) * clamp(value, 0, 1)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const BACKGROUND_OPTIONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' }
]

const SCENE_TIME_OPTIONS = [
  { id: 'morning', label: 'Day' },
  { id: 'night', label: 'Night' }
]

const navigateToLogin = () => {
  const returnTo = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`)
}

const formatApiError = (caughtError, fallback) => (caughtError instanceof Error ? caughtError.message : fallback)

export default function MeditationStudio({ initialShareId = null }) {
  const [intention, setIntention] = useState('Cosmic drift with slow starlight breathing and deep calm focus')
  const [selectedDurationId, setSelectedDurationId] = useState('1m')
  const [backgroundTheme, setBackgroundTheme] = useState('autumn')
  const [sceneTime, setSceneTime] = useState('morning')
  const [isGenerating, setIsGenerating] = useState(false)
  const [experience, setExperience] = useState(null)
  const [error, setError] = useState('')
  const [playbackStatus, setPlaybackStatus] = useState('idle')
  const [remainingMs, setRemainingMs] = useState(0)
  const [isSceneTransitioning, setIsSceneTransitioning] = useState(false)
  const [isSceneRenderReady, setIsSceneRenderReady] = useState(false)
  const [isComposerOpen, setIsComposerOpen] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [masterVolume, setMasterVolume] = useState(DEFAULT_MASTER_VOLUME)
  const [sessionDurationMs, setSessionDurationMs] = useState(0)
  const [isSharing, setIsSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareError, setShareError] = useState('')
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [shareCopyStatus, setShareCopyStatus] = useState('idle')
  const [authUser, setAuthUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authRequiredMessage, setAuthRequiredMessage] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [isThemeControlsOpen, setIsThemeControlsOpen] = useState(false)

  const playbackTimerRef = useRef(null)
  const playbackEndRef = useRef(null)
  const playbackCleanupRef = useRef(null)
  const sceneTransitionTimerRef = useRef(null)
  const sceneReadyTokenRef = useRef(null)
  const thumbnailUploadedGenerationIdsRef = useRef(new Set())
  const toneRef = useRef(null)
  const initialShareLoadRef = useRef(false)

  const selectedDuration = useMemo(
    () => DURATION_OPTIONS.find((option) => option.id === selectedDurationId) ?? DURATION_OPTIONS[1],
    [selectedDurationId]
  )

  const isInitialState = !isGenerating && !experience
  const showExperience = !isGenerating && Boolean(experience)
  const showLoader = isGenerating || (showExperience && (!isSceneRenderReady || isSceneTransitioning))
  const showComposer = !isGenerating
  const composerVisible = !isGenerating && (!experience || isComposerOpen)
  const canUseNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const isAuthenticated = Boolean(authUser)
  const hasMoreHistory = (count, limit) => count >= limit && limit < HISTORY_MAX_LIMIT

  const applyExperience = ({ snapshot, generationId = '', shareId = '' }) => {
    const sceneModule = compileSceneModule({ code: snapshot.sceneCode, runtime: RENDER_DEPS })
    const musicModule = compileMusicModule({ code: snapshot.musicCode, runtime: AUDIO_DEPS })

    const durationSeconds = Math.max(10, Math.floor(Number(snapshot.durationSeconds) || selectedDuration.seconds))
    const mappedDuration = DURATION_OPTIONS.find((option) => option.seconds === durationSeconds)
    const durationMs = durationSeconds * 1000

    if (mappedDuration) {
      setSelectedDurationId(mappedDuration.id)
    }

    if (typeof snapshot.intention === 'string' && snapshot.intention.trim()) {
      setIntention(snapshot.intention)
    }

    if (BACKGROUND_OPTIONS.some((option) => option.id === snapshot.backgroundTheme)) {
      setBackgroundTheme(snapshot.backgroundTheme)
    }

    if (SCENE_TIME_OPTIONS.some((option) => option.id === snapshot.sceneTime)) {
      setSceneTime(snapshot.sceneTime)
    }

    setSessionDurationMs(durationMs)
    setRemainingMs(durationMs)
    setPlaybackStatus('idle')
    setIsComposerOpen(false)
    setExperience({
      intention: snapshot.intention || intention,
      durationSeconds,
      sceneCode: snapshot.sceneCode,
      musicCode: snapshot.musicCode,
      prompts: snapshot.prompts ?? null,
      simulation: Boolean(snapshot.simulation),
      generatedAt: Number.isFinite(Number(snapshot.generatedAt)) ? Number(snapshot.generatedAt) : Date.now(),
      sceneModule,
      musicModule,
      generationId,
      shareId,
      thumbnailDataUrl: typeof snapshot.thumbnailDataUrl === 'string' ? snapshot.thumbnailDataUrl : '',
      sceneModel: snapshot.sceneModel || '',
      musicModel: snapshot.musicModel || ''
    })
  }

  const buildSharePayload = () => {
    if (!experience) return null

    return {
      intention: experience.intention || intention,
      durationSeconds: experience.durationSeconds || selectedDuration.seconds,
      backgroundTheme,
      sceneTime,
      sceneCode: experience.sceneCode,
      musicCode: experience.musicCode,
      prompts: experience.prompts ?? null,
      simulation: Boolean(experience.simulation),
      generatedAt: experience.generatedAt || Date.now()
    }
  }

  const clearPlaybackTimer = () => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
  }

  const getSessionDuration = () => {
    if (sessionDurationMs > 0) return sessionDurationMs
    if (experience) return experience.durationSeconds * 1000
    return 0
  }

  const stopPlayback = ({ resetCountdown = true, markCompleted = false } = {}) => {
    clearPlaybackTimer()

    if (typeof playbackCleanupRef.current === 'function') {
      playbackCleanupRef.current()
      playbackCleanupRef.current = null
    }

    playbackEndRef.current = null
    setPlaybackStatus(markCompleted ? 'completed' : 'idle')

    if (markCompleted) {
      setRemainingMs(0)
    } else if (resetCountdown) {
      const duration = getSessionDuration()
      if (duration > 0) {
        setRemainingMs(duration)
      }
    }
  }

  const getTone = async () => {
    if (!toneRef.current) {
      const toneModule = await import('tone')
      toneRef.current = toneModule
    }
    return toneRef.current
  }

  const startPlaybackTimer = (durationMs) => {
    const clamped = Math.max(0, durationMs)
    if (clamped === 0) {
      stopPlayback({ resetCountdown: false, markCompleted: true })
      return
    }

    setPlaybackStatus('playing')
    playbackEndRef.current = Date.now() + clamped
    setRemainingMs(clamped)
    clearPlaybackTimer()

    playbackTimerRef.current = setInterval(() => {
      if (!playbackEndRef.current) return

      const left = Math.max(0, playbackEndRef.current - Date.now())
      setRemainingMs(left)

      if (left === 0) {
        stopPlayback({ resetCountdown: false, markCompleted: true })
      }
    }, 150)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const prompt = intention.trim()
    if (prompt.length < 3 || isGenerating) return

    if (sceneTransitionTimerRef.current) {
      clearTimeout(sceneTransitionTimerRef.current)
      sceneTransitionTimerRef.current = null
    }

    sceneReadyTokenRef.current = null
    setIsSceneTransitioning(false)
    setIsSceneRenderReady(false)
    setIsComposerOpen(false)
    setAuthRequiredMessage('')
    const baseDurationMs = selectedDuration.seconds * 1000
    setSessionDurationMs(baseDurationMs)
    setRemainingMs(baseDurationMs)
    setPlaybackStatus('idle')
    stopPlayback({ resetCountdown: false, markCompleted: false })
    setError('')
    setShareError('')
    setShareUrl('')
    setShareCopyStatus('idle')
    setIsShareDialogOpen(false)
    setIsGenerating(true)

    try {
      const bundle = await createGeneration({
        intention: prompt,
        durationSeconds: selectedDuration.seconds,
        backgroundTheme,
        sceneTime
      })

      applyExperience({
        snapshot: bundle,
        generationId: bundle.generationId || ''
      })
    } catch (caughtError) {
      if (caughtError instanceof ApiError && LOGIN_REQUIRED_CODES.has(caughtError.code)) {
        setAuthRequiredMessage(caughtError.message)
      }
      setExperience(null)
      setIsComposerOpen(true)
      setError(formatApiError(caughtError, 'Failed to generate the meditation experience.'))
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlay = async () => {
    if (!experience || playbackStatus === 'playing') return

    try {
      const Tone = await getTone()
      await Tone.start()
      const targetDb = volumeToDb(masterVolume)
      Tone.Destination.volume.rampTo(isMuted ? MIN_MASTER_VOLUME_DB : targetDb, 0.15)

      if (playbackStatus === 'paused' && playbackCleanupRef.current) {
        startPlaybackTimer(remainingMs)
        return
      }

      stopPlayback({ resetCountdown: false, markCompleted: false })
      const totalDurationMs = getSessionDuration()
      if (totalDurationMs === 0) return

      const cleanup = experience.musicModule.create(Tone)
      playbackCleanupRef.current = typeof cleanup === 'function' ? cleanup : null
      Tone.Destination.volume.rampTo(isMuted ? MIN_MASTER_VOLUME_DB : targetDb, 0.1)
      startPlaybackTimer(totalDurationMs)
    } catch (caughtError) {
      setError(formatApiError(caughtError, 'Unable to start audio playback.'))
    }
  }

  const startPlaybackFromBeginning = async () => {
    if (!experience) return
    const totalDurationMs = getSessionDuration()
    if (totalDurationMs === 0) return

    const Tone = await getTone()
    await Tone.start()
    const targetDb = volumeToDb(masterVolume)
    Tone.Destination.volume.rampTo(isMuted ? MIN_MASTER_VOLUME_DB : targetDb, 0.15)

    stopPlayback({ resetCountdown: false, markCompleted: false })
    setRemainingMs(totalDurationMs)

    const cleanup = experience.musicModule.create(Tone)
    playbackCleanupRef.current = typeof cleanup === 'function' ? cleanup : null
    Tone.Destination.volume.rampTo(isMuted ? MIN_MASTER_VOLUME_DB : targetDb, 0.1)
    startPlaybackTimer(totalDurationMs)
  }

  const handlePause = async () => {
    if (playbackStatus !== 'playing') return

    const left = playbackEndRef.current ? Math.max(0, playbackEndRef.current - Date.now()) : remainingMs
    clearPlaybackTimer()
    playbackEndRef.current = null
    setRemainingMs(left)
    setPlaybackStatus('paused')

    try {
      const Tone = await getTone()
      const context = Tone.getContext?.().rawContext
      if (context?.state === 'running') {
        await context.suspend()
      }
    } catch {
      // Keep pause resilient.
    }
  }

  const handleStop = () => {
    stopPlayback({ resetCountdown: true, markCompleted: false })
  }

  const toggleMute = async () => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    try {
      const Tone = await getTone()
      await Tone.start()
      const targetDb = volumeToDb(masterVolume)
      Tone.Destination.volume.rampTo(nextMuted ? MIN_MASTER_VOLUME_DB : targetDb, 0.2)
    } catch {
      // Keep mute resilient.
    }
  }

  const handleVolumeChange = async (nextValue) => {
    const normalized = clamp(nextValue, 0, 1)
    setMasterVolume(normalized)
    if (isMuted) return
    try {
      const Tone = await getTone()
      await Tone.start()
      Tone.Destination.volume.rampTo(volumeToDb(normalized), 0.15)
    } catch {
      // Keep volume resilient.
    }
  }

  const handleReplay = async () => {
    if (!experience) return
    try {
      await startPlaybackFromBeginning()
    } catch (caughtError) {
      setError(formatApiError(caughtError, 'Unable to restart audio playback.'))
    }
  }

  const handleShare = async () => {
    if (!experience || isSharing) return
    if (!isAuthenticated) {
      setAuthRequiredMessage('Please sign in to share this scene.')
      navigateToLogin()
      return
    }

    const payload = buildSharePayload()
    if (!payload) return

    setIsSharing(true)
    setShareError('')
    setShareCopyStatus('idle')

    try {
      let url = ''

      try {
        const job = await createShareJob(payload)
        const startedAt = Date.now()

        while (Date.now() - startedAt < SHARE_JOB_TIMEOUT_MS) {
          const state = await fetchShareJob(job.jobId)

          if (state.status === 'completed' && state.result?.shareUrl) {
            url = state.result.shareUrl
            break
          }

          if (state.status === 'failed') {
            throw new Error(state.error || 'Share processing failed.')
          }

          await sleep(SHARE_JOB_POLL_INTERVAL_MS)
        }

        if (!url) {
          throw new Error('Share job timed out.')
        }
      } catch {
        const result = await createShare(payload)
        url = result.shareUrl
      }

      setShareUrl(url)
      setIsShareDialogOpen(true)
    } catch (caughtError) {
      if (caughtError instanceof ApiError && LOGIN_REQUIRED_CODES.has(caughtError.code)) {
        setAuthRequiredMessage(caughtError.message)
        navigateToLogin()
        return
      }
      setShareError(formatApiError(caughtError, 'Unable to create share URL.'))
    } finally {
      setIsSharing(false)
    }
  }

  const copyShareUrl = async () => {
    if (!shareUrl) return
    setShareCopyStatus('copying')

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = shareUrl
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'absolute'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!copied) throw new Error('Copy failed')
      }

      setShareCopyStatus('copied')
    } catch {
      setShareCopyStatus('error')
    }
  }

  const shareNatively = async () => {
    if (!shareUrl || !canUseNativeShare) return

    try {
      await navigator.share({
        title: 'softsky',
        text: 'Try this meditation scene',
        url: shareUrl
      })
    } catch {
      // Ignore cancellations.
    }
  }

  const handleExtendSession = (additionalMs = EXTEND_SESSION_STEP_MS) => {
    if (!experience) return
    const extraMs = Math.max(0, additionalMs)
    if (extraMs === 0) return

    if (playbackStatus === 'completed') {
      setPlaybackStatus('idle')
    }

    setSessionDurationMs((prev) => {
      const base = prev > 0 ? prev : experience.durationSeconds * 1000
      return base + extraMs
    })

    setRemainingMs((prev) => prev + extraMs)
    if (playbackEndRef.current) {
      playbackEndRef.current += extraMs
    }
  }

  const handleReduceSession = (reductionMs = EXTEND_SESSION_STEP_MS) => {
    if (!experience) return
    const cutMs = Math.max(0, reductionMs)
    if (cutMs === 0) return

    const baseDurationMs = sessionDurationMs > 0 ? sessionDurationMs : experience.durationSeconds * 1000
    const nextDurationMs = Math.max(MIN_SESSION_DURATION_MS, baseDurationMs - cutMs)
    const appliedReductionMs = baseDurationMs - nextDurationMs
    if (appliedReductionMs === 0) return

    setSessionDurationMs(nextDurationMs)
    const nextRemainingMs = Math.max(0, remainingMs - appliedReductionMs)
    setRemainingMs(nextRemainingMs)

    if (playbackStatus === 'completed' && nextRemainingMs > 0) {
      setPlaybackStatus('idle')
    }

    if (playbackEndRef.current) {
      playbackEndRef.current -= appliedReductionMs
      if (playbackEndRef.current <= Date.now()) {
        stopPlayback({ resetCountdown: false, markCompleted: true })
        return
      }
    }

    if (nextRemainingMs === 0 && (playbackStatus === 'playing' || playbackStatus === 'paused')) {
      stopPlayback({ resetCountdown: false, markCompleted: true })
    }
  }

  const handleSceneReady = () => {
    if (!experience || isGenerating) return
    if (sceneReadyTokenRef.current === experience.generatedAt) return

    sceneReadyTokenRef.current = experience.generatedAt
    setIsSceneRenderReady(true)
    setIsSceneTransitioning(true)

    if (sceneTransitionTimerRef.current) {
      clearTimeout(sceneTransitionTimerRef.current)
    }
    sceneTransitionTimerRef.current = setTimeout(() => {
      setIsSceneTransitioning(false)
      sceneTransitionTimerRef.current = null
    }, SCENE_TRANSITION_MS)
  }

  const handleSceneSnapshot = async (thumbnailDataUrl) => {
    const generationId = String(experience?.generationId || '').trim()
    if (!isAuthenticated || !generationId) return
    if (!thumbnailDataUrl || !thumbnailDataUrl.startsWith('data:image/')) return
    if (thumbnailUploadedGenerationIdsRef.current.has(generationId)) return

    thumbnailUploadedGenerationIdsRef.current.add(generationId)
    try {
      await updateGenerationThumbnail(generationId, thumbnailDataUrl)
      setHistoryItems((prev) =>
        prev.map((item) => (item.generationId === generationId ? { ...item, thumbnailDataUrl } : item))
      )
      setExperience((prev) =>
        prev && prev.generationId === generationId ? { ...prev, thumbnailDataUrl } : prev
      )
    } catch {
      thumbnailUploadedGenerationIdsRef.current.delete(generationId)
    }
  }

  const refreshSession = async () => {
    try {
      const session = await fetchAuthSession()
      setAuthUser(session.authenticated ? session.user : null)
    } catch {
      setAuthUser(null)
    } finally {
      setAuthLoading(false)
    }
  }

  const openHistory = async () => {
    if (!isAuthenticated) {
      navigateToLogin()
      return
    }

    const initialLimit = HISTORY_PAGE_SIZE
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryLoadingMore(false)
    setHistoryError('')
    setHistoryLimit(initialLimit)
    try {
      const result = await listGenerations({ limit: initialLimit })
      const nextItems = Array.isArray(result.items) ? result.items : []
      setHistoryItems(nextItems)
      setHistoryHasMore(hasMoreHistory(nextItems.length, initialLimit))
    } catch (caughtError) {
      setHistoryError(formatApiError(caughtError, 'Unable to load previous generations.'))
      setHistoryHasMore(false)
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadMoreHistory = async () => {
    if (!isAuthenticated || historyLoading || historyLoadingMore || !historyHasMore) return
    const nextLimit = Math.min(historyLimit + HISTORY_PAGE_SIZE, HISTORY_MAX_LIMIT)

    setHistoryLoadingMore(true)
    setHistoryError('')
    try {
      const result = await listGenerations({ limit: nextLimit })
      const nextItems = Array.isArray(result.items) ? result.items : []
      setHistoryItems(nextItems)
      setHistoryLimit(nextLimit)
      setHistoryHasMore(hasMoreHistory(nextItems.length, nextLimit))
    } catch (caughtError) {
      setHistoryError(formatApiError(caughtError, 'Unable to load more generations.'))
    } finally {
      setHistoryLoadingMore(false)
    }
  }

  const selectHistoryGeneration = async (generationId) => {
    try {
      const item = await fetchGenerationById(generationId)
      applyExperience({
        snapshot: item,
        generationId: item.generationId || generationId
      })
      setHistoryOpen(false)
    } catch (caughtError) {
      setHistoryError(formatApiError(caughtError, 'Unable to open generation.'))
    }
  }

  useEffect(() => {
    refreshSession()
  }, [])

  useEffect(() => {
    if (!initialShareId || initialShareLoadRef.current) return

    initialShareLoadRef.current = true
    let cancelled = false

    const loadSharedExperience = async () => {
      if (sceneTransitionTimerRef.current) {
        clearTimeout(sceneTransitionTimerRef.current)
        sceneTransitionTimerRef.current = null
      }

      sceneReadyTokenRef.current = null
      setIsSceneTransitioning(false)
      setIsSceneRenderReady(false)
      setIsGenerating(true)
      setError('')
      setShareError('')
      stopPlayback({ resetCountdown: false, markCompleted: false })

      try {
        const shared = await fetchShareById(initialShareId)
        if (cancelled) return

        applyExperience({
          snapshot: shared.snapshot,
          shareId: shared.shareId || initialShareId
        })

        if (typeof window !== 'undefined') {
          setShareUrl(`${window.location.origin}/s/${initialShareId}`)
        }
      } catch (caughtError) {
        if (cancelled) return
        setIsComposerOpen(true)
        setError(formatApiError(caughtError, 'Unable to load shared experience.'))
      } finally {
        if (!cancelled) {
          setIsGenerating(false)
        }
      }
    }

    loadSharedExperience()

    return () => {
      cancelled = true
    }
  // Initial share load is intentionally one-shot and guarded by initialShareLoadRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShareId])

  useEffect(() => {
    document.body.setAttribute('data-scene-bg', backgroundTheme)
  }, [backgroundTheme])

  useEffect(() => {
    document.body.setAttribute('data-scene-time', sceneTime)
  }, [sceneTime])

  useEffect(() => {
    document.body.setAttribute('data-scene-focus', showExperience ? 'soft' : 'clear')
  }, [showExperience])

  useEffect(
    () => () => {
      document.body.removeAttribute('data-scene-bg')
      document.body.removeAttribute('data-scene-time')
      document.body.removeAttribute('data-scene-focus')
    },
    []
  )

  useEffect(() => {
    return () => {
      if (sceneTransitionTimerRef.current) {
        clearTimeout(sceneTransitionTimerRef.current)
        sceneTransitionTimerRef.current = null
      }
      clearPlaybackTimer()
      if (typeof playbackCleanupRef.current === 'function') {
        playbackCleanupRef.current()
        playbackCleanupRef.current = null
      }
      playbackEndRef.current = null
    }
  }, [])

  const scenePanel = showExperience ? (
    <ScenePlaybackPanel
      sceneModule={experience.sceneModule}
      playbackStatus={playbackStatus}
      onPlay={handlePlay}
      onPause={handlePause}
      onStop={handleStop}
      onReplay={handleReplay}
      onReduceDuration={handleReduceSession}
      onExtendDuration={handleExtendSession}
      isMuted={isMuted}
      onToggleMute={toggleMute}
      volume={masterVolume}
      onVolumeChange={handleVolumeChange}
      canPlay
      remainingMs={remainingMs}
      onSceneReady={handleSceneReady}
      onSceneSnapshot={handleSceneSnapshot}
      onShare={handleShare}
      isSharing={isSharing}
      phase={!isSceneRenderReady ? 'preload' : isSceneTransitioning ? 'entering' : 'ready'}
    />
  ) : null

  return (
    <div className="studio-shell">
      <div className="studio-ambient studio-ambient--left" aria-hidden="true" />
      <div className="studio-ambient studio-ambient--right" aria-hidden="true" />

      <div className={`studio ${isInitialState ? 'studio--compose' : ''}`.trim()}>
        <header className="brand">
          <h1>softsky</h1>
          <div className="brand__actions">
            {authLoading ? (
              <span className="brand__meta">Checking account...</span>
            ) : isAuthenticated ? (
              <>
                <span className="brand__meta">{authUser.email}</span>
                <button className="brand__action" type="button" onClick={openHistory}>
                  Library
                </button>
                <button className="brand__action" type="button" onClick={() => window.location.assign('/logout')}>
                  Logout
                </button>
              </>
            ) : (
              <button className="brand__action" type="button" onClick={navigateToLogin}>
                Login
              </button>
            )}
          </div>
        </header>

        <div className={`scene-controls ${isThemeControlsOpen ? 'scene-controls--open' : 'scene-controls--closed'}`.trim()}>
          <button
            className="scene-controls__toggle"
            type="button"
            onClick={() => setIsThemeControlsOpen((prev) => !prev)}
            aria-expanded={isThemeControlsOpen}
            aria-controls="scene-theme-controls"
          >
            Theme
          </button>

          <div id="scene-theme-controls" className="scene-controls__content" aria-hidden={!isThemeControlsOpen}>
            <div className="scene-controls__content-inner">
              <div className="scene-theme-toggle" role="group" aria-label="Background style">
                {BACKGROUND_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`scene-theme-toggle__chip ${backgroundTheme === option.id ? 'scene-theme-toggle__chip--active' : ''}`.trim()}
                    onClick={() => setBackgroundTheme(option.id)}
                    aria-pressed={backgroundTheme === option.id}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="scene-time-toggle" role="group" aria-label="Time of day">
                {SCENE_TIME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`scene-time-toggle__chip ${sceneTime === option.id ? 'scene-time-toggle__chip--active' : ''}`.trim()}
                    onClick={() => setSceneTime(option.id)}
                    aria-pressed={sceneTime === option.id}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {showComposer && (
          <div className={`composer-shell ${composerVisible ? 'composer-shell--open' : 'composer-shell--closed'}`.trim()}>
            <MeditationComposer
              intention={intention}
              onIntentionChange={setIntention}
              durationOptions={DURATION_OPTIONS}
              selectedDurationId={selectedDurationId}
              onDurationChange={setSelectedDurationId}
              onSubmit={handleSubmit}
              disabled={isGenerating}
            />
          </div>
        )}

        {!isGenerating && experience && (
          <button
            className="studio__compose-toggle"
            type="button"
            onClick={() => setIsComposerOpen((prev) => !prev)}
            aria-label={isComposerOpen ? 'Hide composer' : 'Show composer'}
            title={isComposerOpen ? 'Hide composer' : 'Show composer'}
            data-state={isComposerOpen ? 'open' : 'closed'}
          >
            <span className="studio__compose-toggle-icon" aria-hidden="true" />
          </button>
        )}

        {error && <p className="error-banner">{error}</p>}
        {shareError && <p className="error-banner">{shareError}</p>}
        {authRequiredMessage && !isAuthenticated && (
          <p className="error-banner error-banner--auth">
            {authRequiredMessage}{' '}
            <button type="button" className="error-banner__link" onClick={navigateToLogin}>
              Sign in
            </button>
          </p>
        )}

        {!showExperience && showLoader && (
          <section className="studio__output studio__output--loading">
            <GenerationLoader />
          </section>
        )}

        {showExperience && (
          <section className={`studio__output ${showLoader ? 'studio__output--transition' : ''}`.trim()}>
            <div className="stage-layer stage-layer--scene">{scenePanel}</div>
            {showLoader && (
              <div className="stage-layer stage-layer--loader">
                <GenerationLoader variant={isSceneRenderReady ? 'exit' : 'active'} />
              </div>
            )}
          </section>
        )}
      </div>

      <ShareDialog
        open={isShareDialogOpen}
        url={shareUrl}
        canUseNativeShare={canUseNativeShare}
        copyStatus={shareCopyStatus}
        onCopy={copyShareUrl}
        onNativeShare={shareNatively}
        onClose={() => setIsShareDialogOpen(false)}
      />

      <GenerationHistoryPanel
        open={historyOpen}
        loading={historyLoading}
        loadingMore={historyLoadingMore}
        hasMore={historyHasMore}
        error={historyError}
        items={historyItems}
        activeGenerationId={experience?.generationId || ''}
        onClose={() => setHistoryOpen(false)}
        onSelect={selectHistoryGeneration}
        onLoadMore={loadMoreHistory}
      />
    </div>
  )
}
