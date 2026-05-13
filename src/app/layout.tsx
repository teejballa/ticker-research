import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from './providers';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  weight: ['400', '500', '700', '800', '900'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500', '700'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://cipher.tools'),
  title: {
    default: 'Cipher — Source-cited equity research',
    template: '%s | Cipher',
  },
  description:
    'Cited equity research on any ticker. Sentiment, bull and bear drivers, forward outlook, and a recommendation calibrated against the S&P 500 — with every claim linked to a source.',
  keywords: [
    'equity research',
    'stock analysis',
    'stock forecast',
    'fundamental research',
    'analyst estimates',
    'bull case bear case',
    'price target',
    'institutional ownership',
    'insider transactions',
  ],
  openGraph: {
    title: 'Cipher — Source-cited equity research',
    description:
      'Sentiment, drivers, outlook, and a recommendation calibrated against the S&P 500. Every claim linked to a source.',
    url: 'https://cipher.tools',
    siteName: 'Cipher',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cipher — Source-cited equity research',
    description:
      'Sentiment, drivers, outlook, and a recommendation calibrated against the S&P 500.',
  },
  robots: { index: true, follow: true },
};

const ORGANIZATION_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Cipher',
  url: 'https://cipher.tools',
  description:
    'Source-cited equity research. Sentiment, drivers, outlook, and a recommendation calibrated against the S&P 500.',
} as const;

const WEBSITE_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Cipher',
  url: 'https://cipher.tools',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://cipher.tools/research/{ticker}',
    'query-input': 'required name=ticker',
  },
} as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark bg-surface">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_LD) }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-inter)] antialiased bg-surface text-on-surface`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
