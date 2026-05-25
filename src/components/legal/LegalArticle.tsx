import Link from 'next/link';
import { LEGAL_LAST_UPDATED } from '@/lib/site';

export interface TocEntry {
  id: string;
  label: string;
}

interface LegalArticleProps {
  eyebrow: string;
  title: string;
  summary: string;
  toc: TocEntry[];
  /** Override the global "Last updated" date for a single document. */
  updated?: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for the legal/policy pages: eyebrow + title, a "Last updated"
 * stamp, a short plain-English summary, and an "On this page" jump list.
 * Server component — pure presentation, no client state.
 */
export function LegalArticle({
  eyebrow,
  title,
  summary,
  toc,
  updated = LEGAL_LAST_UPDATED,
  children,
}: LegalArticleProps) {
  return (
    <article className="legal">
      <header className="legal-head">
        <div className="legal-eyebrow">{eyebrow}</div>
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated · {updated}</p>
        <p className="legal-summary">{summary}</p>
      </header>

      <nav className="legal-toc" aria-label="On this page">
        <span className="legal-toc-label">On this page</span>
        <ul>
          {toc.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`}>{t.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="legal-body">{children}</div>

      <footer className="legal-foot">
        <p>
          Related: <Link href="/disclaimer">Disclaimer</Link> ·{' '}
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{' '}
          <Link href="/cookies">Cookies</Link>
        </p>
      </footer>
    </article>
  );
}

/** A titled section with a stable anchor id, used inside LegalArticle. */
export function LegalSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="legal-section">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
