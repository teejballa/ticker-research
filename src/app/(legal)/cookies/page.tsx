import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalSection } from '@/components/legal/LegalArticle';
import { SITE_NAME, CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Cipher uses only essential sign-in cookies and a local theme preference. Our analytics are cookieless and we do not use advertising trackers.',
  alternates: { canonical: '/cookies' },
};

const toc = [
  { id: 'what', label: 'What cookies are' },
  { id: 'essential', label: 'Essential cookies' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'no-ads', label: 'No ad trackers' },
  { id: 'control', label: 'Controlling cookies' },
  { id: 'contact', label: 'Contact' },
];

export default function CookiesPage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Cookie Policy"
      summary={`${SITE_NAME} keeps cookies to a minimum: a small set of essential cookies to keep you signed in, plus a local setting for your theme. Our analytics are cookieless and we run no advertising trackers.`}
      toc={toc}
    >
      <LegalSection id="what" heading="1. What cookies are">
        <p>
          Cookies are small files a website stores in your browser. Related technologies
          like <code>localStorage</code> store small settings on your device. Below is
          everything {SITE_NAME} uses and why.
        </p>
      </LegalSection>

      <LegalSection id="essential" heading="2. Essential cookies (sign-in)">
        <p>
          When you sign in with Google, our authentication layer sets a small number of
          strictly necessary cookies — a session token, a CSRF-protection token, and a
          callback URL. These exist only to keep you securely signed in and to protect the
          sign-in flow. The Service cannot function without them, so they are not subject to
          consent. They are not used for tracking or advertising.
        </p>
      </LegalSection>

      <LegalSection id="preferences" heading="3. Preference storage (theme)">
        <p>
          We remember your light/dark theme choice using a <code>cipher-theme</code> entry in
          your browser&rsquo;s <code>localStorage</code>. This stays on your device, is not
          sent to our servers, and is not used to identify you.
        </p>
      </LegalSection>

      <LegalSection id="analytics" heading="4. Analytics (cookieless)">
        <p>
          We use Vercel Analytics to understand aggregate, anonymous usage such as which
          pages are visited. It is <strong>cookieless</strong> — it does not set tracking
          cookies, does not store personal identifiers, and does not follow you across other
          websites.
        </p>
      </LegalSection>

      <LegalSection id="no-ads" heading="5. No advertising or cross-site trackers">
        <p>
          {SITE_NAME} does not use advertising cookies, third-party marketing pixels, or
          cross-site tracking technologies of any kind.
        </p>
      </LegalSection>

      <LegalSection id="control" heading="6. Controlling cookies">
        <p>
          You can block or delete cookies through your browser settings. Because our only
          cookies are essential to sign-in, blocking them will prevent you from logging in
          and using account features, but you can still browse public pages.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="7. Contact">
        <p>
          For more on how we handle data, see our <Link href="/privacy">Privacy Policy</Link>,
          or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
