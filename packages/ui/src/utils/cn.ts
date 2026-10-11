import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge only knows Tailwind's default scales. A theme key added in
// `styles/theme.css` must be registered here too, or `cn` misreads it: an
// unknown `text-caption` counts as a text color and is dropped next to
// `text-text-muted` (#782).
const twMerge = extendTailwindMerge<'animation-duration'>({
  extend: {
    classGroups: {
      'animation-duration': [{ 'animation-duration': ['fast', 'base', 'slow'] }],
    },
    theme: {
      ease: ['standard', 'enter', 'exit'],
      text: ['caption', 'tiny', 'micro', 'md'],
      leading: ['body', 'relaxed-ui', 'note'],
      tracking: ['kicker', 'kind-label'],
      radius: ['icon-chip'],
      spacing: ['row-accent', 'row-compact', 'row-default', 'row-expanded'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
