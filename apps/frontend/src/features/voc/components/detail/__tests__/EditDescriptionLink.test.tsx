import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock sonner toast before import
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
import { toast } from 'sonner';

import { EditDescriptionLink } from '../EditDescriptionLink';

describe('<EditDescriptionLink>', () => {
  it('renders the button', () => {
    render(<EditDescriptionLink />);
    expect(screen.getByRole('button', { name: '설명 수정' })).toBeInTheDocument();
  });

  it('fires info toast on click', () => {
    render(<EditDescriptionLink />);
    fireEvent.click(screen.getByRole('button', { name: '설명 수정' }));
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith('수정은 다음 이슈에서 제공됩니다');
  });
});
