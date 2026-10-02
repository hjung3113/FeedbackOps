import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodIssueMessage } from './zodIssueMessage';

function firstIssue(schema: z.ZodTypeAny, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('Expected the test value to fail validation.');
  return result.error.issues[0];
}

describe('zodIssueMessage', () => {
  it.each([
    [z.string().min(1), '', '필수 입력 항목입니다.'],
    [z.string().min(5), '', '5자 이상 입력하세요.'],
    [z.string().max(4), 'abcde', '4자 이하로 입력하세요.'],
    [z.string().uuid(), 'not-a-uuid', '올바른 ID 형식이 아닙니다.'],
    [z.string().email(), 'not-an-email', '입력값이 올바르지 않습니다.'],
  ] as const)('maps schema issue to Korean copy', (schema, value, message) => {
    const issue = firstIssue(schema, value);
    if (!issue) throw new Error('Expected the schema to produce an issue.');
    expect(zodIssueMessage(issue)).toBe(message);
  });
});
