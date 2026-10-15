import { describe, expect, it } from 'vitest';
import { TASK_REQUEST_COPY } from './task-requests';

describe('Task conversion copy', () => {
  it.each([
    ['TASK-6003', 'TASK-6003으로'],
    ['TASK-6001', 'TASK-6001로'],
  ])('uses the final character of %s for the particle', (id, expected) => {
    expect(TASK_REQUEST_COPY.converted(id, '담당자 없음')).toBe(
      `Task ${expected} 전환했습니다. 담당자: 담당자 없음`,
    );
  });
});
