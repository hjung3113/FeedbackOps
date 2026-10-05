import { Skeleton } from './shadcn/skeleton.js';

export interface SkeletonRowsProps {
  count: number;
  size: 'compact' | 'regular';
}

const ROW_CLASS: Record<SkeletonRowsProps['size'], string> = {
  compact: 'h-12 w-full',
  regular: 'h-14 w-full',
};

/** Repeated list loading rows at the shipped 48px and 56px heights. */
export function SkeletonRows({ count, size }: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders have no state or identity across renders.
        <Skeleton className={ROW_CLASS[size]} key={index} />
      ))}
    </>
  );
}
