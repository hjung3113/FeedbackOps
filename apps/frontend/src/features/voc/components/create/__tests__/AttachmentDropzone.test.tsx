import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AttachmentDropzone } from '../AttachmentDropzone';

// Mock sonner so we can assert toast calls without a live DOM Toaster
vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

// Re-import after mocking to get the mock reference
import { toast } from 'sonner';

describe('<AttachmentDropzone>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Paperclip icon area, helper text, and footer text', () => {
    render(<AttachmentDropzone />);
    expect(screen.getByText('첨부 파일')).toBeInTheDocument();
    expect(screen.getByText('드래그 또는 클릭하여 업로드')).toBeInTheDocument();
    expect(screen.getByText('최대 25MB · 첨부 기능은 다음 슬라이스')).toBeInTheDocument();
  });

  it('clicking the dropzone fires the deferral toast', () => {
    render(<AttachmentDropzone />);
    const dropzone = screen.getByRole('button');
    fireEvent.click(dropzone);
    expect(toast).toHaveBeenCalledWith(
      '첨부 기능은 다음 슬라이스에서 제공됩니다 (Slice 3+)',
    );
  });

  it('dropping a file fires the deferral toast', () => {
    render(<AttachmentDropzone />);
    const dropzone = screen.getByRole('button');
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    expect(toast).toHaveBeenCalledWith(
      '첨부 기능은 다음 슬라이스에서 제공됩니다 (Slice 3+)',
    );
  });
});
