'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import type { ChartDataPoint } from '@/lib/types';
import { useTheme } from '@/lib/use-theme';

interface PriceLineChartProps {
  data: ChartDataPoint[];
}

// lightweight-charts needs concrete colour strings, not CSS var() references —
// so we resolve the theme tokens to computed values at chart-build time and
// rebuild the chart whenever the theme flips.
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    surface: v('--surface', '#ffffff'),
    text:    v('--ink-3', '#7c766b'),
    rule:    v('--rule', '#e2dccf'),
    line:    v('--indigo', '#2f44d6'),
  };
}

export default function PriceLineChart({ data }: PriceLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { dark } = useTheme();

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const p = readPalette();

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: p.surface },
        textColor: p.text,
      },
      grid: {
        vertLines: { color: p.rule },
        horzLines: { color: p.rule },
      },
      width: containerRef.current.clientWidth,
      height: 180,
      rightPriceScale: { borderColor: p.rule, textColor: p.text },
      timeScale: { borderColor: p.rule, timeVisible: false },
      crosshair: {
        vertLine: { color: p.line, labelBackgroundColor: p.line },
        horzLine: { color: p.line, labelBackgroundColor: p.line },
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: p.line,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBackgroundColor: p.line,
    });

    lineSeries.setData(data);
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, dark]);

  if (data.length === 0) return null;

  return <div ref={containerRef} className="w-full" style={{ height: '180px' }} />;
}
