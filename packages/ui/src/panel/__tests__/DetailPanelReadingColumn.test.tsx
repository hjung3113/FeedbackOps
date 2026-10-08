import { render, screen } from '@testing-library/react';
import {
  DetailPanelFullscreenContext,
  DetailPanelReadingColumn,
} from '../DetailPanelFullscreenContext.js';

const EXPANDED_CLASS = 'mx-auto h-full w-full max-w-[60rem] border-x border-border-subtle';

describe('DetailPanelReadingColumn', () => {
  it.each([
    ['expanded', true, EXPANDED_CLASS],
    ['collapsed', false, 'contents'],
    ['without a fullscreen context', null, 'contents'],
  ] as const)('renders the %s column', (_label, expanded, className) => {
    const column = (
      <DetailPanelReadingColumn data-testid="reading-column">
        <p>panel</p>
      </DetailPanelReadingColumn>
    );
    if (expanded === null) {
      render(column);
    } else {
      render(
        <DetailPanelFullscreenContext.Provider value={{ expanded, toggle: () => {} }}>
          {column}
        </DetailPanelFullscreenContext.Provider>,
      );
    }
    expect(screen.getByTestId('reading-column').className).toBe(className);
  });
});
