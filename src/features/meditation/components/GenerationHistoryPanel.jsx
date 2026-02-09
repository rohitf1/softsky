const formatTime = (value) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return value || ''
  }
}

const formatDuration = (value) => {
  const seconds = Math.max(1, Number.parseInt(String(value || 60), 10) || 60)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const rem = seconds % 60
  if (rem === 0) return `${mins} min`
  return `${mins}m ${rem}s`
}

const THEME_LABELS = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter'
}

const TIME_LABELS = {
  morning: 'Day',
  night: 'Night'
}

const THUMBNAIL_PALETTES = {
  spring: {
    morning: {
      skyTop: '#66c9f5',
      skyBottom: '#b3ecff',
      horizon: '#9bda92',
      orb: '#ffd666',
      cloud: 'rgba(255, 255, 255, 0.72)',
      glow: 'rgba(173, 226, 143, 0.75)'
    },
    night: {
      skyTop: '#08223a',
      skyBottom: '#1b4367',
      horizon: '#2f5f45',
      orb: '#d7ecff',
      cloud: 'rgba(182, 211, 237, 0.45)',
      glow: 'rgba(71, 129, 203, 0.46)'
    }
  },
  summer: {
    morning: {
      skyTop: '#33b8ef',
      skyBottom: '#a4ebff',
      horizon: '#7fd9a0',
      orb: '#ffe083',
      cloud: 'rgba(255, 255, 255, 0.7)',
      glow: 'rgba(125, 226, 206, 0.68)'
    },
    night: {
      skyTop: '#072a58',
      skyBottom: '#1f4f7c',
      horizon: '#255f6d',
      orb: '#d3e7ff',
      cloud: 'rgba(163, 194, 224, 0.42)',
      glow: 'rgba(83, 144, 208, 0.44)'
    }
  },
  autumn: {
    morning: {
      skyTop: '#61bce6',
      skyBottom: '#e2c796',
      horizon: '#c98d58',
      orb: '#ffd38a',
      cloud: 'rgba(255, 248, 240, 0.66)',
      glow: 'rgba(245, 166, 104, 0.64)'
    },
    night: {
      skyTop: '#222a43',
      skyBottom: '#4e4054',
      horizon: '#654e4a',
      orb: '#f2dbbf',
      cloud: 'rgba(204, 181, 171, 0.37)',
      glow: 'rgba(183, 117, 92, 0.48)'
    }
  },
  winter: {
    morning: {
      skyTop: '#83b7d8',
      skyBottom: '#e4f2fb',
      horizon: '#b7d4e6',
      orb: '#fff0b6',
      cloud: 'rgba(244, 250, 255, 0.75)',
      glow: 'rgba(168, 208, 229, 0.7)'
    },
    night: {
      skyTop: '#0c253e',
      skyBottom: '#375a73',
      horizon: '#4f6f84',
      orb: '#eaf6ff',
      cloud: 'rgba(171, 197, 216, 0.4)',
      glow: 'rgba(104, 148, 178, 0.5)'
    }
  }
}

const normalizeTheme = (value) => (value in THEME_LABELS ? value : 'spring')
const normalizeTime = (value) => (value === 'night' ? 'night' : 'morning')

const getThumbnailStyle = (theme, time) => {
  const palette = THUMBNAIL_PALETTES[theme]?.[time] || THUMBNAIL_PALETTES.spring.morning
  return {
    '--thumb-sky-top': palette.skyTop,
    '--thumb-sky-bottom': palette.skyBottom,
    '--thumb-horizon': palette.horizon,
    '--thumb-orb': palette.orb,
    '--thumb-cloud': palette.cloud,
    '--thumb-glow': palette.glow
  }
}

export default function GenerationHistoryPanel({
  open,
  loading,
  loadingMore = false,
  hasMore = false,
  error,
  items,
  activeGenerationId,
  onClose,
  onSelect,
  onLoadMore
}) {
  if (!open) return null

  return (
    <div className="history-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="history-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Scene library"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="history-modal__header">
          <button className="history-modal__close" type="button" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">x</span>
          </button>
        </header>

        {loading && <p className="history-modal__state">Loading...</p>}
        {!loading && error && <p className="history-modal__state">{error}</p>}
        {!loading && !error && items.length === 0 && <p className="history-modal__state">No saved scenes yet.</p>}

        {!loading && !error && items.length > 0 && (
          <ul className="history-modal__list">
            {items.map((item) => {
              const theme = normalizeTheme(item.backgroundTheme)
              const time = normalizeTime(item.sceneTime)
              const thumbnailDataUrl = typeof item.thumbnailDataUrl === 'string' ? item.thumbnailDataUrl.trim() : ''
              const hasImageThumbnail = thumbnailDataUrl.startsWith('data:image/')
              return (
                <li key={item.generationId}>
                  <button
                    className={`history-modal__item ${activeGenerationId === item.generationId ? 'history-modal__item--active' : ''}`.trim()}
                    type="button"
                    onClick={() => onSelect?.(item.generationId)}
                  >
                    <span
                      className={`history-modal__item-thumb history-modal__item-thumb--${time} ${
                        hasImageThumbnail ? 'history-modal__item-thumb--image' : ''
                      }`.trim()}
                      style={getThumbnailStyle(theme, time)}
                    >
                      {hasImageThumbnail && (
                        <img
                          className="history-modal__item-thumb-image"
                          src={thumbnailDataUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      <span className="history-modal__item-badge">{THEME_LABELS[theme]}</span>
                      <span className="history-modal__item-badge history-modal__item-badge--time">{TIME_LABELS[time]}</span>
                    </span>
                    <span className="history-modal__item-body">
                      <span className="history-modal__item-intention">{String(item.intention || '').trim() || 'Untitled scene'}</span>
                      <span className="history-modal__item-meta">
                        {formatDuration(item.durationSeconds)} • {formatTime(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && !error && items.length > 0 && (
          <footer className="history-modal__footer">
            {hasMore && (
              <button className="history-modal__more" type="button" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  )
}
