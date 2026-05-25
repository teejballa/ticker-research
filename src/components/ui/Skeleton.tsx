import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A single shimmering placeholder block. Decorative — hidden from the
 * accessibility tree (the surrounding region should expose aria-busy instead).
 * Animation + reduced-motion fallback live in globals.css (.skeleton).
 */
export function Skeleton({ width, height, radius, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={className ? `skeleton ${className}` : 'skeleton'}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

interface SkeletonTextProps {
  /** Number of placeholder lines. */
  lines?: number;
  /** Width of the final (short) line, e.g. "60%". */
  lastLineWidth?: string;
  className?: string;
  style?: CSSProperties;
}

/** A stack of text-line skeletons; the last line is shortened for realism. */
export function SkeletonText({
  lines = 3,
  lastLineWidth = '62%',
  className,
  style,
}: SkeletonTextProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: 'block', ...style }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <span
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 ? lastLineWidth : '100%' }}
        />
      ))}
    </span>
  );
}

export default Skeleton;
