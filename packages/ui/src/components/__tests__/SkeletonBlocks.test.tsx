import { render } from '@testing-library/react';
import { SkeletonBlocks } from '../SkeletonBlocks.js';

describe('SkeletonBlocks', () => {
  it('renders one placeholder for each requested detail block', () => {
    const { container } = render(
      <SkeletonBlocks
        blocks={[
          { kind: 'title', size: 'large', width: 'half' },
          { kind: 'line', width: 'full' },
          { kind: 'body', size: 'large', width: 'full' },
        ]}
      />,
    );

    expect(container.children).toHaveLength(3);
  });
});
