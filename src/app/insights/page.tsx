import { InsightsDashboard } from '@/components/InsightsDashboard';
import NavBar from '@/components/NavBar';

export const metadata = {
  title: 'Research Insights — Cipher',
  description:
    'Live behavioral finance research: how community sentiment predicts price movement.',
};

export default function InsightsPage() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <NavBar />
      <main className="pt-[44px]">
        <InsightsDashboard />
      </main>
    </div>
  );
}
