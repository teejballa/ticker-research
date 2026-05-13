import type { Metadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ ticker: string }> },
): Promise<Metadata> {
  const { ticker } = await params;
  const TICKER = (ticker ?? '').toUpperCase();
  const title = `${TICKER} Stock Research & Analysis`;
  const description = `Source-cited research on ${TICKER}: market sentiment, bull and bear drivers, forward outlook, and a recommendation calibrated against the S&P 500.`;
  return {
    title,
    description,
    alternates: { canonical: `/research/${TICKER}` },
    openGraph: {
      title: `${TICKER} Stock Research & Analysis | Cipher`,
      description,
      url: `/research/${TICKER}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${TICKER} Stock Research & Analysis | Cipher`,
      description,
    },
  };
}

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
