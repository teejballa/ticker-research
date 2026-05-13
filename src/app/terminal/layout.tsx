import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Research a ticker',
  description:
    'Generate a source-cited research report on any public company. Sentiment, bull and bear drivers, forward outlook, and a recommendation calibrated against the S&P 500.',
  alternates: { canonical: '/terminal' },
  openGraph: {
    title: 'Research a ticker | Cipher',
    description:
      'Generate a source-cited research report on any public company in under a minute.',
    url: '/terminal',
  },
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
