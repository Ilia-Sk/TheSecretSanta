/**
 * The brand is the wordmark only — no pictogram (an icon next to the name
 * read as clutter). "Santa" is set in the italic serif accent.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`logo ${className}`.trim()}>
      <span className="logo-word">
        Secret<span className="logo-word-accent">Santa</span>
      </span>
    </span>
  );
}
