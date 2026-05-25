import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalArticle, LegalSection } from '@/components/legal/LegalArticle';
import { SITE_NAME, OPERATOR, CONTACT_EMAIL, JURISDICTION } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms governing your use of Cipher — eligibility, acceptable use, intellectual property, disclaimers, and limitation of liability.',
  alternates: { canonical: '/terms' },
};

const toc = [
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'service', label: 'The service' },
  { id: 'not-advice', label: 'Not investment advice' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'ip', label: 'Intellectual property' },
  { id: 'third-party', label: 'Third-party data' },
  { id: 'warranty', label: 'No warranties' },
  { id: 'liability', label: 'Limitation of liability' },
  { id: 'indemnity', label: 'Indemnification' },
  { id: 'termination', label: 'Termination' },
  { id: 'law', label: 'Governing law' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

export default function TermsPage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Terms of Service"
      summary={`These terms govern your use of ${SITE_NAME}. By using the service you agree to them. ${SITE_NAME} is an educational research tool provided "as is" — please read the disclaimer and liability sections carefully.`}
      toc={toc}
    >
      <LegalSection id="acceptance" heading="1. Acceptance of these terms">
        <p>
          By accessing or using {SITE_NAME} (the &ldquo;Service&rdquo;), you agree to be
          bound by these Terms of Service and by our{' '}
          <Link href="/privacy">Privacy Policy</Link> and{' '}
          <Link href="/disclaimer">Disclaimer</Link>. If you do not agree, do not use the
          Service. You must be at least 18 years old, or the age of majority where you live,
          to use {SITE_NAME}.
        </p>
      </LegalSection>

      <LegalSection id="service" heading="2. The service">
        <p>
          {SITE_NAME} is a software tool that generates source-cited, educational research
          about publicly traded securities. Features, data sources, and availability may
          change, be suspended, or be discontinued at any time without notice.
        </p>
      </LegalSection>

      <LegalSection id="not-advice" heading="3. Not investment advice">
        <p>
          {SITE_NAME} does not provide investment, financial, legal, or tax advice, and is
          not a registered investment adviser or broker-dealer. All output is for
          informational and educational purposes only. See the full{' '}
          <Link href="/disclaimer">Disclaimer</Link>, which is incorporated into these
          terms.
        </p>
      </LegalSection>

      <LegalSection id="accounts" heading="4. Accounts">
        <p>
          Some features require signing in with Google. You are responsible for activity
          under your account and for keeping access to your Google account secure. Provide
          accurate information and notify us of any unauthorized use.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" heading="5. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Scrape, harvest, or bulk-extract content or data except as expressly permitted;</li>
          <li>Resell, redistribute, or commercially exploit the Service or its output without permission;</li>
          <li>Circumvent rate limits, security controls, or access restrictions;</li>
          <li>Use the Service to violate any law or any third party&rsquo;s rights;</li>
          <li>Interfere with, overload, or disrupt the Service or its infrastructure;</li>
          <li>Misrepresent {SITE_NAME} output as licensed financial advice to others.</li>
        </ul>
      </LegalSection>

      <LegalSection id="ip" heading="6. Intellectual property">
        <p>
          The {SITE_NAME} application, design, and underlying software are owned by{' '}
          {OPERATOR} and protected by intellectual-property laws. Research reports generated
          for your account are made available for your personal, non-commercial use.
          Underlying market and sentiment data remain the property of their respective
          providers and are subject to their terms.
        </p>
      </LegalSection>

      <LegalSection id="third-party" heading="7. Third-party data & services">
        <p>
          The Service depends on third-party data providers and infrastructure. Their
          content is provided &ldquo;as is&rdquo;, may be delayed or inaccurate, and is
          subject to their own terms. We are not responsible for third-party services and
          do not endorse any security mentioned in any report.
        </p>
      </LegalSection>

      <LegalSection id="warranty" heading="8. No warranties">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT
          WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR
          A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. We do not warrant that the
          Service will be uninterrupted, error-free, or that any output is accurate or
          reliable.
        </p>
      </LegalSection>

      <LegalSection id="liability" heading="9. Limitation of liability">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, {OPERATOR.toUpperCase()} AND {SITE_NAME.toUpperCase()}{' '}
          WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, INVESTMENT LOSSES, DATA, OR GOODWILL,
          ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE — EVEN IF ADVISED OF THE
          POSSIBILITY. Our total aggregate liability for any claim relating to the Service
          will not exceed one hundred U.S. dollars (US$100).
        </p>
      </LegalSection>

      <LegalSection id="indemnity" heading="10. Indemnification">
        <p>
          You agree to indemnify and hold harmless {OPERATOR} and {SITE_NAME} from any claims,
          losses, or expenses (including reasonable legal fees) arising from your use of the
          Service or your breach of these terms.
        </p>
      </LegalSection>

      <LegalSection id="termination" heading="11. Termination">
        <p>
          We may suspend or terminate your access at any time, with or without cause. You may
          stop using the Service at any time. Sections that by their nature should survive
          termination — including intellectual property, disclaimers, and limitation of
          liability — will survive.
        </p>
      </LegalSection>

      <LegalSection id="law" heading="12. Governing law">
        <p>
          These terms are governed by the laws of {JURISDICTION}, without regard to its
          conflict-of-laws rules. You agree to the exclusive jurisdiction of the state and
          federal courts located there for any dispute that is not subject to other agreed
          resolution.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="13. Changes to these terms">
        <p>
          We may update these terms from time to time. Material changes take effect when
          posted, indicated by the updated date above. Continued use after changes means you
          accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="14. Contact">
        <p>
          Questions about these terms? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
