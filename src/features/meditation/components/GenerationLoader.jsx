export default function GenerationLoader({ variant = 'active' }) {
  return (
    <section className={`loader loader--${variant}`.trim()} aria-live="polite" aria-label="Generating your meditation">
      <div className="loader__horizon" aria-hidden="true">
        <span className="loader__track loader__track--one" />
        <span className="loader__track loader__track--two" />
        <span className="loader__track loader__track--three" />
        <span className="loader__glide loader__glide--one" />
        <span className="loader__glide loader__glide--two" />
        <span className="loader__glide loader__glide--three" />
      </div>
    </section>
  )
}
