import { useEffect, useRef } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { THEME } from '@/shared/theme';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LineChartProps {
  points: readonly ChartPoint[];
  height?: number;
  label?: string;
  format?: (value: number) => string;
}

/**
 * uPlot is only imported by this component, which is only reachable from the
 * lazily loaded analytics route — it never enters the initial bundle.
 */
export function LineChart({ points, height = 180, label = '', format }: LineChartProps) {
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node || points.length === 0) return;

    const width = Math.max(240, node.clientWidth || 320);
    const data: uPlot.AlignedData = [
      points.map((point) => Math.round(point.x / 1000)),
      points.map((point) => point.y),
    ];

    const chart = new uPlot(
      {
        width,
        height,
        padding: [8, 8, 0, 0],
        legend: { show: false },
        cursor: { drag: { x: false, y: false }, points: { show: false } },
        scales: { x: { time: true }, y: { auto: true } },
        series: [
          { label },
          {
            label,
            stroke: THEME.primary,
            width: 2,
            points: { show: points.length < 24, size: 5, stroke: THEME.primary, fill: THEME.background },
            value: (_u, value) => (value === null ? '—' : format ? format(value) : String(value)),
          },
        ],
        axes: [
          {
            stroke: THEME.muted,
            grid: { stroke: THEME.line, width: 1 },
            ticks: { stroke: THEME.line, width: 1 },
            font: '11px system-ui',
          },
          {
            stroke: THEME.muted,
            grid: { stroke: THEME.line, width: 1 },
            ticks: { stroke: THEME.line, width: 1 },
            font: '11px system-ui',
            size: 52,
          },
        ],
      },
      data,
      node,
    );

    const onResize = () => {
      if (container.current) chart.setSize({ width: Math.max(240, container.current.clientWidth), height });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.destroy();
    };
  }, [points, height, label, format]);

  if (points.length === 0) return null;

  return <div ref={container} class="w-full overflow-hidden" style={{ height: `${height}px` }} />;
}
