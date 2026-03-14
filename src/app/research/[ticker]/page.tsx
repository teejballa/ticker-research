import Link from 'next/link';
import ChartConfirmation from '@/components/ChartConfirmation';
import type { ChartDataPoint } from '@/lib/types';

interface ChartRouteResponse {
  points: ChartDataPoint[];
  companyName: string;
  currentPrice: number | null;
  percentChange: number | null;
  marketCap: number | null;
  exchange: string | null;
  sector: string | null;
  error?: string;
}

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function ResearchPage({ params }: PageProps) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  // Determine the base URL for server-side fetch
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  let data: ChartRouteResponse | null = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(`${baseUrl}/api/ticker/chart?symbol=${encodeURIComponent(symbol)}`, {
      cache: 'no-store',
    });
    const json = (await res.json()) as ChartRouteResponse;
    if (!res.ok || json.error) {
      fetchError = json.error ?? 'Ticker not found';
    } else {
      data = json;
    }
  } catch {
    fetchError = 'Failed to load chart data. Please try again.';
  }

  if (fetchError || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">&#x26A0;</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Ticker Not Found</h1>
          <p className="text-gray-500 mb-6">
            <span className="font-mono font-semibold text-gray-700">{symbol}</span> could not be
            found. Please check the symbol and try again.
          </p>
          {fetchError && (
            <p className="text-sm text-red-500 mb-4">{fetchError}</p>
          )}
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors duration-150"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-gray-50 px-4 py-12">
      <ChartConfirmation
        ticker={symbol}
        chartData={data.points}
        meta={{
          companyName: data.companyName,
          currentPrice: data.currentPrice,
          percentChange: data.percentChange,
          marketCap: data.marketCap,
          exchange: data.exchange,
          sector: data.sector,
        }}
      />
    </main>
  );
}
