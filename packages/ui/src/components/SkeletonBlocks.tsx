import { Skeleton } from './shadcn/skeleton.js';

export type SkeletonBlock =
  | { kind: 'line'; width: SkeletonWidth }
  | { kind: 'title'; size: 'small' | 'large'; width: SkeletonWidth }
  | { kind: 'body'; size: 'compact' | 'regular' | 'large'; width: 'full' }
  | { kind: 'badge'; width: 'standard' };

export interface SkeletonBlocksProps {
  blocks: readonly SkeletonBlock[];
}

type SkeletonWidth =
  | 'full'
  | 'half'
  | 'third'
  | 'two-thirds'
  | 'three-quarters'
  | 'five-sixths'
  | 'w12'
  | 'w16'
  | 'w24';

const WIDTH_CLASS: Record<SkeletonWidth, string> = {
  full: 'w-full',
  half: 'w-1/2',
  third: 'w-1/3',
  'two-thirds': 'w-2/3',
  'three-quarters': 'w-3/4',
  'five-sixths': 'w-5/6',
  w12: 'w-12',
  w16: 'w-16',
  w24: 'w-24',
};

function blockClass(block: SkeletonBlock): string {
  if (block.kind === 'line') return `h-4 ${WIDTH_CLASS[block.width]}`;
  if (block.kind === 'title') {
    return `${block.size === 'small' ? 'h-6' : 'h-7'} ${WIDTH_CLASS[block.width]}`;
  }
  if (block.kind === 'body') {
    const height = block.size === 'compact' ? 'h-20' : block.size === 'regular' ? 'h-24' : 'h-32';
    return `${height} ${WIDTH_CLASS[block.width]}`;
  }
  return 'h-6 w-20';
}

/** Shared line, title, body, and badge placeholders for detail-panel loading states. */
export function SkeletonBlocks({ blocks }: SkeletonBlocksProps) {
  return (
    <>
      {blocks.map((block, index) => (
        <Skeleton className={blockClass(block)} key={`${block.kind}-${index}`} />
      ))}
    </>
  );
}
