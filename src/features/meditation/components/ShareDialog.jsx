import { useEffect } from 'react'

export default function ShareDialog({
  open,
  url,
  canUseNativeShare,
  copyStatus,
  onCopy,
  onNativeShare,
  onClose
}) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || !url) return null

  const copyLabel =
    copyStatus === 'copied'
      ? 'Copied'
      : copyStatus === 'error'
        ? 'Copy Failed'
        : copyStatus === 'copying'
          ? 'Copying...'
          : 'Copy Link'

  return (
    <div className="share-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share this meditation"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="share-modal__header">
          <h2>Share</h2>
          <button className="share-modal__close" type="button" onClick={onClose} aria-label="Close share popup">
            <span aria-hidden="true">x</span>
          </button>
        </header>

        <p className="share-modal__caption">Send this scene with one link.</p>

        <div className="share-modal__url-wrap">
          <a className="share-modal__url" href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        </div>

        <div className="share-modal__actions">
          <button className="share-modal__action" type="button" onClick={onCopy}>
            {copyLabel}
          </button>

          {canUseNativeShare && (
            <button className="share-modal__action" type="button" onClick={onNativeShare}>
              Share
            </button>
          )}

          <a className="share-modal__action share-modal__action--link" href={url} target="_blank" rel="noreferrer">
            Open Link
          </a>
        </div>
      </section>
    </div>
  )
}

