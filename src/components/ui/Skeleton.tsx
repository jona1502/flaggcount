import type { CSSProperties } from 'react';

type SkeletonProps = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
};

/** Placeholder while content loads; pair it with a visible or screen reader loading text. */
export function Skeleton({ width = '100%', height = '1rem', radius }: SkeletonProps): React.JSX.Element {
  return <span className="ui-skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}
