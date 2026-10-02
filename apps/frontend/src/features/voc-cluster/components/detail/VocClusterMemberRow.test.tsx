import { FINDING_SEVERITY_LABELS } from '@/lib/copy/enum-labels';
import { findingSeveritySchema } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VocClusterMemberRow } from './VocClusterMemberRow';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

describe('VocClusterMemberRow', () => {
  it.each(findingSeveritySchema.options)(
    'renders a display label for member severity %s',
    (severity) => {
      render(
        <VocClusterMemberRow
          member={{
            voc_id: '20000000-0000-4000-8000-000000000002',
            added_by: '50000000-0000-4000-8000-000000000005',
            added_at: '2026-07-10T00:00:00.000Z',
            severity,
          }}
          last
          canRemove={false}
          onRemove={vi.fn()}
          isRemoving={false}
        />,
      );

      expect(screen.getByText(new RegExp(FINDING_SEVERITY_LABELS[severity]))).toBeInTheDocument();
      expect(screen.queryByText(severity, { exact: true })).not.toBeInTheDocument();
    },
  );
});
