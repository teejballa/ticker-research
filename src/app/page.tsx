'use client';

import { useSession } from 'next-auth/react';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import Hero from '@/components/landing/Hero';
import {
  PipelineSection,
  SectorGrid,
  MarketSnapshot,
  SampleReport,
  HowItWorks,
  StackStrip,
  CTASection,
  Footer,
} from '@/components/landing/sections';

export default function Home() {
  const { data: session } = useSession();

  return (
    <>
      <div className="paper-grain" />
      <div className="coord-grid" />
      <NavBar userEmail={session?.user?.email} />

      <Hero />

      <div style={{ position: 'relative', background: 'var(--bg)', zIndex: 2 }}>
        <PipelineSection />
        <SectorGrid />
        <MarketSnapshot />
        <SampleReport />
        <HowItWorks />
        <StackStrip />
        <CTASection />
        <Footer />
        <FooterTicker />
      </div>
    </>
  );
}
