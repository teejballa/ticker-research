import TickerSearch from '@/components/TickerSearch';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Ticker Research
          </h1>
          <p className="mt-2 text-gray-500 text-base">
            Evidence-backed financial analysis with traceable sources
          </p>
        </div>

        {/* Search */}
        <TickerSearch />
      </div>
    </main>
  );
}
