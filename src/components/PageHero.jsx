export default function PageHero({
  kicker,
  title,
  description,
  action,
  children,
  className = '',
}) {
  return (
    <section className={`knowledge-hero page-hero ${className}`.trim()}>
      <div className="knowledge-hero-layout">
        <div>
          {kicker && <span className="knowledge-hero-kicker">{kicker}</span>}
          <h2 className="knowledge-hero-title">{title}</h2>
          {description && <p className="knowledge-hero-description">{description}</p>}
        </div>
        {(action || children) && (
          <div className="knowledge-hero-actions">
            {action}
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

