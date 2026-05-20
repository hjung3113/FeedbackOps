import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeverityDisclaimerCard } from '../SeverityDisclaimerCard';

describe('<SeverityDisclaimerCard>', () => {
  it('renders the title', () => {
    render(<SeverityDisclaimerCard />);
    expect(screen.getByText('심각도 안내')).toBeInTheDocument();
  });

  it('renders the body copy', () => {
    render(<SeverityDisclaimerCard />);
    expect(
      screen.getByText('심각도는 검토 후 운영팀이 결정합니다. 직접 설정할 수 없습니다.'),
    ).toBeInTheDocument();
  });
});
