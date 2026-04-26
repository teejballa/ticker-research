import { InsightsDashboard } from '@/components/InsightsDashboard';

export const metadata = {
  title: 'Research Insights — Cipher',
  description: 'Live behavioral finance research: how community sentiment predicts price movement',
};

export default function InsightsPage() {
  return (
    <main>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-4">
        <h1 className="text-3xl font-bold text-white mb-2">Research Insights</h1>
        <p className="text-zinc-400 text-sm max-w-2xl">
          Cipher continuously monitors community sentiment across niche, middle, and mainstream tiers.
          This page shows what the data has learned — which signals predicted price movements, and where the diffusion gap is active right now.
        </p>
      </div>
      <InsightsDashboard />
    </main>
  );
}
