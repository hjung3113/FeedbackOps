import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeverityDisclaimerCard } from '../SeverityDisclaimerCard';

describe('<SeverityDisclaimerCard>', () => {
  it('renders the existing disclaimer as one muted help line', () => {
    render(<SeverityDisclaimerCard />);
    const line = screen.getByText('심각도는 검토 후 운영팀이 결정합니다. 직접 설정할 수 없습니다.');
    expect(line).toHaveClass('text-text-muted');
    expect(screen.queryByText('심각도 안내')).not.toBeInTheDocument();
    expect(line.querySelector('svg')).toBeNull();
  });
});
