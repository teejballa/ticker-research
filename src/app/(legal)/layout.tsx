import SiteNav from '@/components/SiteNav';
import { Footer } from '@/components/landing/sections';

/**
 * Shared layout for the legal/policy pages (/privacy, /terms, /disclaimer,
 * /cookies). The `(legal)` route group keeps the URLs flat while sharing the
 * site nav + footer chrome. The route-group prefix does not appear in the URL.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="paper-grain" />
      <div className="coord-grid" />
      <SiteNav />
      <main className="page legal-shell">{children}</main>
      <Footer />
    </>
  );
}
