import { z } from 'zod';

const questionSchema = z.object({ id: z.string().uuid(), kind: z.enum(['single_choice', 'multiple_choice', 'rating', 'text']), prompt: z.string(), is_required: z.boolean() });
const surveySchema = z.object({ id: z.string().uuid(), display_id: z.string(), title: z.string(), type: z.enum(['discovery', 'validation', 'outcome']), status: z.enum(['draft', 'live', 'closed']), questions: z.array(questionSchema) });
export const surveyVisualFixture = surveySchema.parse({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_id: 'SRV-21', title: 'Q3 매출 리포트 사용성 진단', type: 'discovery', status: 'draft', questions: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'single_choice', prompt: '리포트를 얼마나 자주 사용하시나요?', is_required: true }] });
export const surveyVisualScenarios = z.enum(['list', 'detail', 'builder', 'empty', 'error', 'no-permission']).parse(['list', 'detail', 'builder', 'empty', 'error', 'no-permission']);
