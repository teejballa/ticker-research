import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalSection } from '@/components/legal/LegalArticle';
import { SITE_NAME, OPERATOR, CONTACT_EMAIL, JURISDICTION } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Cipher collects, uses, shares, and protects your data — Google sign-in, stored research history, and privacy-friendly analytics.',
  alternates: { canonical: '/privacy' },
};

const toc = [
  { id: 'who', label: 'Who we are' },
  { id: 'collect', label: 'Data we collect' },
  { id: 'use', label: 'How we use it' },
  { id: 'share', label: 'Who we share it with' },
  { id: 'cookies', label: 'Cookies & analytics' },
  { id: 'retention', label: 'Retention' },
  { id: 'rights', label: 'Your rights' },
  { id: 'security', label: 'Security' },
  { id: 'children', label: "Children's privacy" },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

export default function PrivacyPage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Privacy Policy"
      summary={`This policy explains what data ${SITE_NAME} collects when you sign in and generate research, how that data is used, and the choices you have. We collect the minimum needed to run the service and never sell your data.`}
      toc={toc}
    >
      <LegalSection id="who" heading="1. Who we are">
        <p>
          {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an educational equity-research
          tool operated by {OPERATOR}. This policy applies to the {SITE_NAME} website and
          web application. For any privacy question, contact{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection id="collect" heading="2. Data we collect">
        <p>We collect only what we need to provide the service:</p>
        <ul>
          <li>
            <strong>Account data (via Google Sign-In).</strong> When you sign in, our
            authentication provider passes us your name, email address, profile image, and
            a Google account identifier. We do not receive your Google password.
          </li>
          <li>
            <strong>Research history.</strong> The tickers you analyze and the reports we
            generate for you — including their text, scores, and timestamps — are stored
            and linked to your account so you can revisit them.
          </li>
          <li>
            <strong>Technical &amp; usage data.</strong> Standard server logs (IP address,
            browser/device type, request times) and privacy-friendly, aggregated analytics
            about page visits. Our analytics are <strong>cookieless</strong> and do not
            build advertising profiles.
          </li>
        </ul>
        <p>
          We do not intentionally collect special-category data, and we ask that you not
          submit sensitive personal information through the service.
        </p>
      </LegalSection>

      <LegalSection id="use" heading="3. How we use your data">
        <ul>
          <li>To authenticate you and operate your account.</li>
          <li>To generate, store, and display your research history.</li>
          <li>
            To operate and improve the learning/calibration engine using{' '}
            <strong>aggregated, de-identified</strong> outcome metrics — never your personal
            identity.
          </li>
          <li>To secure the service, prevent abuse, debug, and meet legal obligations.</li>
        </ul>
        <p>
          Our lawful bases for processing (where applicable) are performance of our
          agreement with you, our legitimate interest in operating and securing the service,
          and your consent where required.
        </p>
      </LegalSection>

      <LegalSection id="share" heading="4. Who we share it with">
        <p>
          We do <strong>not</strong> sell your personal data. We share data only with the
          service providers (sub-processors) that make {SITE_NAME} work, and only as needed:
        </p>
        <ul>
          <li><strong>Vercel</strong> — application hosting, serverless functions, and analytics.</li>
          <li><strong>Neon</strong> — managed Postgres database where your account and reports are stored.</li>
          <li><strong>Google</strong> — sign-in / OAuth identity.</li>
          <li>
            <strong>Vercel AI Gateway / Google Gemini</strong> and <strong>Anthropic</strong> —
            language-model providers used to generate and assist research.
          </li>
          <li>
            <strong>Market &amp; sentiment data providers</strong> — e.g. Yahoo Finance,
            Polygon, Finnhub, StockTwits, Quiver, Xpoz, Hacker News, and Exa.
          </li>
        </ul>
        <p>
          When we query data and language-model providers, we send the <em>ticker symbol</em>{' '}
          and assembled research context — not your name or email. We may also disclose data
          if required by law or to protect our rights, users, or the public.
        </p>
      </LegalSection>

      <LegalSection id="cookies" heading="5. Cookies & analytics">
        <p>
          We use a small number of <strong>essential</strong> cookies to keep you signed in,
          and a local browser setting to remember your light/dark theme. Our analytics are
          cookieless. We do not use advertising or cross-site tracking cookies. See our{' '}
          <Link href="/cookies">Cookie Policy</Link> for the full list.
        </p>
      </LegalSection>

      <LegalSection id="retention" heading="6. How long we keep it">
        <p>
          We keep your account data for as long as your account is active, and your research
          history until you delete it or ask us to delete your account. Server logs are kept
          for a limited period for security and debugging. We delete or anonymize data when it
          is no longer needed.
        </p>
      </LegalSection>

      <LegalSection id="rights" heading="7. Your rights & choices">
        <p>
          Depending on where you live (including under the GDPR and the California Consumer
          Privacy Act), you may have the right to access, correct, export, or delete your
          personal data, and to object to or restrict certain processing. You can:
        </p>
        <ul>
          <li>
            <strong>Delete individual reports</strong> yourself from your dashboard history
            at any time.
          </li>
          <li>
            <strong>Request account deletion</strong> or exercise any other right by emailing{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </li>
        </ul>
        <p>We will not discriminate against you for exercising these rights.</p>
      </LegalSection>

      <LegalSection id="security" heading="8. Security">
        <p>
          We rely on reputable infrastructure providers, encryption in transit, and
          access controls to protect your data. No system is perfectly secure, however, and
          we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection id="children" heading="9. Children's privacy">
        <p>
          {SITE_NAME} is not directed to children under 13 (or the minimum age required in
          your jurisdiction), and we do not knowingly collect their data. If you believe a
          child has provided us data, contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="10. Changes to this policy">
        <p>
          We may update this policy as the service evolves. Material changes will be
          reflected by an updated &ldquo;Last updated&rdquo; date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="11. Contact">
        <p>
          Questions or requests? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This policy is governed by
          the laws of {JURISDICTION}.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
