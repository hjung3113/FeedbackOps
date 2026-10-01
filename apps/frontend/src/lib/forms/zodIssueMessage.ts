import type { ZodErrorMap, ZodIssueOptionalMessage } from 'zod';

const INVALID_INPUT_MESSAGE = '입력값이 올바르지 않습니다.';

export function zodIssueMessage(issue: ZodIssueOptionalMessage): string {
  if (issue.code === 'custom' && issue.path.join('.') === 'source_id') {
    return 'VOC 또는 Survey 출처를 선택하면 ID가 필요합니다.';
  }
  if (issue.code === 'too_small' && issue.type === 'string') {
    return issue.minimum === 1 ? '필수 입력 항목입니다.' : `${issue.minimum}자 이상 입력하세요.`;
  }
  if (issue.code === 'too_big' && issue.type === 'string') {
    return `${issue.maximum}자 이하로 입력하세요.`;
  }
  if (issue.code === 'invalid_string' && issue.validation === 'uuid') {
    return '올바른 ID 형식이 아닙니다.';
  }
  return INVALID_INPUT_MESSAGE;
}

export const koreanZodErrorMap: ZodErrorMap = (issue) => ({
  message: zodIssueMessage(issue),
});
