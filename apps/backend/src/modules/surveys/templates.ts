import {
  type SurveyTemplate,
  type SurveyTemplatesResponse,
  surveyTemplatesResponseSchema,
} from '@fops/shared';

// Version 1 IDs and definitions are stable; content revisions require a new version.
const catalog = surveyTemplatesResponseSchema.parse({
  items: [
    {
      template_id: 'discovery-basic',
      version: 1,
      type: 'discovery',
      title: 'Discovery 기본 템플릿',
      description: 'Managed System 사용 현황과 불편을 확인하세요.',
      questions: [
        {
          key: 'usage-frequency',
          kind: 'single_choice',
          prompt: '이 Managed System을 얼마나 자주 사용하나요?',
          is_required: true,
          sort_order: 0,
          options: [
            { key: 'daily', label: '매일' },
            { key: 'weekly', label: '매주' },
            { key: 'monthly-or-less', label: '월 1회 이하' },
            { key: 'never', label: '사용한 적 없음' },
          ],
        },
        {
          key: 'pain-point',
          kind: 'text',
          prompt: '업무에서 가장 불편한 점은 무엇인가요?',
          is_required: false,
          sort_order: 1,
        },
      ],
    },
    {
      template_id: 'validation-basic',
      version: 1,
      type: 'validation',
      title: 'Validation 기본 템플릿',
      description: '제안된 개선 내용을 Survey 설명에 입력하세요.',
      questions: [
        {
          key: 'expected-usefulness',
          kind: 'rating',
          prompt: '제안된 개선이 업무에 얼마나 도움이 될 것으로 예상하나요?',
          is_required: true,
          sort_order: 0,
          rating_min: 1,
          rating_max: 5,
          rating_low_label: '전혀 도움이 되지 않음',
          rating_high_label: '매우 도움이 됨',
        },
        {
          key: 'improvement-feedback',
          kind: 'text',
          prompt: '개선안에서 보완할 점은 무엇인가요?',
          is_required: false,
          sort_order: 1,
        },
      ],
    },
    {
      template_id: 'outcome-basic',
      version: 1,
      type: 'outcome',
      title: 'Outcome 기본 템플릿',
      description: '출시된 개선 내용을 Survey 설명에 입력하세요.',
      questions: [
        {
          key: 'released-usefulness',
          kind: 'rating',
          prompt: '개선 후 이 Managed System이 업무에 얼마나 도움이 되나요?',
          is_required: true,
          sort_order: 0,
          rating_min: 1,
          rating_max: 5,
          rating_low_label: '전혀 도움이 되지 않음',
          rating_high_label: '매우 도움이 됨',
        },
        {
          key: 'remaining-pain-point',
          kind: 'text',
          prompt: '개선 후에도 남아 있는 불편은 무엇인가요?',
          is_required: false,
          sort_order: 1,
        },
      ],
    },
  ],
});

export function builtinSurveyTemplates(): SurveyTemplatesResponse {
  return structuredClone(catalog);
}

export function findBuiltinSurveyTemplate(
  templateId: string,
  version: number,
): SurveyTemplate | undefined {
  return catalog.items.find((item) => item.template_id === templateId && item.version === version);
}
