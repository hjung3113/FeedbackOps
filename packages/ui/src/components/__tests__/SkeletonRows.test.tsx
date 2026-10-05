import { render } from '@testing-library/react';
import { SkeletonRows } from '../SkeletonRows.js';

describe('SkeletonRows', () => {
  it.each([
    { count: 3, size: 'compact' as const },
    { count: 2, size: 'regular' as const },
  ])('renders the requested number of $size rows', ({ count, size }) => {
    const { container } = render(<SkeletonRows count={count} size={size} />);

    expect(container.children).toHaveLength(count);
  });
});
