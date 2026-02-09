import { useLayoutEffect, useRef } from 'react'

export default function MeditationComposer({
  intention,
  onIntentionChange,
  durationOptions,
  selectedDurationId,
  onDurationChange,
  onSubmit,
  disabled
}) {
  const textareaRef = useRef(null)

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }

  useLayoutEffect(() => {
    resizeTextarea()
  }, [intention])

  const canSubmit = !disabled && intention.trim().length >= 3

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer__input-shell">
        <textarea
          id="meditation-intention"
          className="composer__text"
          rows={1}
          aria-label="Meditation intention"
          placeholder="rain / fire / galaxy / ocean / mountain..."
          value={intention}
          maxLength={100}
          onChange={(event) => {
            resizeTextarea()
            onIntentionChange(event.target.value.slice(0, 100))
          }}
          disabled={disabled}
          required
          ref={textareaRef}
        />
        <button
          className="composer__submit-inline"
          type="submit"
          disabled={!canSubmit}
          aria-label="Compose"
          title="Compose"
        >
          <span className="composer__submit-inline-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M3 12H21" />
              <path d="M14 5L21 12L14 19" />
            </svg>
          </span>
        </button>
      </div>

      <div className="composer__durations" role="group" aria-label="Meditation duration">
        {durationOptions.map((option) => {
          const active = option.id === selectedDurationId
          return (
            <button
              key={option.id}
              type="button"
              className={`duration-chip ${active ? 'duration-chip--active' : ''}`.trim()}
              onClick={() => onDurationChange(option.id)}
              disabled={disabled}
            >
              {option.label}
            </button>
          )
        })}
      </div>

    </form>
  )
}
