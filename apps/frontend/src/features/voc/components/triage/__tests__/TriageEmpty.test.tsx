// TriageEmpty.test.tsx — RED test for the empty state component.
// Prototype ref: screen-voc-create.jsx:691-697
// TDD RED: this test is written before the implementation file exists.

import { VOC_TRIAGE_TAB_EMPTY_LABEL } from '@/lib/copy/voc-views';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TriageEmpty } from '../TriageEmpty';

describe('TriageEmpty', () => {
  it.each([
    {
      tabScoped: true,
      title: VOC_TRIAGE_TAB_EMPTY_LABEL,
      subtext: null,
    },
    {
      // Default (whole-queue) variant: title plus the helper sub-text.
      tabScoped: false,
      title: '큐가 비었습니다',
      subtext: /새 VOC가 들어오면 자동으로 추가됩니다/,
    },
  ])(
    'picks the right copy for the empty variant (tabScoped=$tabScoped)',
    ({ tabScoped, title, subtext }) => {
      render(<TriageEmpty {...(tabScoped ? { tabScoped } : {})} />);
      expect(screen.getByText(title)).toBeInTheDocument();
      if (subtext === null) {
        // The tab-scoped variant must not claim the whole queue was processed.
        expect(screen.queryByText(/큐가 비었습니다/)).not.toBeInTheDocument();
        expect(screen.queryByText(/모든 VOC를 Triage 처리했습니다/)).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(subtext)).toBeInTheDocument();
      }
    },
  );
});
