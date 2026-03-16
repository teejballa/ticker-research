'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import type { ChartDataPoint } from '@/lib/types';

interface PriceLineChartProps {
  data: ChartDataPoint[];
}

export default function PriceLineChart({ data }: PriceLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#2a3d52',
      },
      grid: {
        vertLines: { color: '#0a1520' },
        horzLines: { color: '#0a1520' },
      },
      width: containerRef.current.clientWidth,
      height: 180,
      rightPriceScale: {
        borderColor: '#131e2b',
        textColor: '#2a3d52',
      },
      timeScale: {
        borderColor: '#131e2b',
        timeVisible: false,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(245, 158, 11, 0.15)',
          labelBackgroundColor: '#0d1117',
        },
        horzLine: {
          color: 'rgba(245, 158, 11, 0.15)',
          labelBackgroundColor: '#0d1117',
        },
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBackgroundColor: '#f59e0b',
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
  }, [data]);

  if (data.length === 0) return null;

  return <div ref={containerRef} className="w-full" style={{ height: '180px' }} />;
}
