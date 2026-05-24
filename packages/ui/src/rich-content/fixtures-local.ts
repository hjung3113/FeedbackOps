// ADR-0016 forbids @fops/ui from importing @fops/shared. This file mirrors
// packages/shared/src/rich-content/fixtures.ts; drift is pinned by
// __tests__/fixtures-drift.test.ts.

import type { TipTapDoc } from './RichEditor';
import type { UISurface } from './allowlist-local';

export const UI_RICH_CONTENT_ERROR_CODES = [
  'rich_content.disallowed_node',
  'rich_content.disallowed_attr',
  'rich_content.invalid_attr_value',
  'rich_content.missing_required_attr',
  'rich_content.external_image_forbidden',
] as const;

export type UIRichContentErrorCode = (typeof UI_RICH_CONTENT_ERROR_CODES)[number];

export interface UIInvalidRichContentFixture {
  doc: TipTapDoc;
  expectedCode: UIRichContentErrorCode;
}

const ATTACHMENT_ID = '00000000-0000-4000-8000-000000000001';
const ATTACHMENT_ID_2 = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const doc = (...content: unknown[]): TipTapDoc => ({ type: 'doc', content } as unknown as TipTapDoc);

const paragraph = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

export const UI_VALID_RICH_CONTENT_FIXTURES: Record<UISurface, TipTapDoc[]> = {
  'voc-description': [
    doc(
      paragraph('Tableau 대시보드가 월마감 중 504 오류를 반환합니다.', [
        { type: 'bold' },
        { type: 'link', attrs: { href: 'https://status.example.com/incidents/voc-44' } },
      ]),
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph('영향: Finance Ops 정산 검증 지연')] },
          { type: 'listItem', content: [paragraph('첨부 로그는 아래 reference를 확인')] },
        ],
      },
      { type: 'attachmentRef', attrs: { id: ATTACHMENT_ID } },
    ),
  ],
  'reporter-reply': [
    doc(
      paragraph('재현 시간은 09:12 KST이고 동일 화면에서 다시 시도해도 실패했습니다.', [
        { type: 'italic' },
      ]),
      { type: 'attachmentRef', attrs: { id: ATTACHMENT_ID_2 } },
    ),
  ],
  'public-update': [
    doc(
      paragraph('조사 중입니다. 원인 후보를 좁혔고 다음 업데이트는 15:00 KST에 공유합니다.', [
        { type: 'bold' },
      ]),
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [paragraph('영향 범위 확인')] },
          { type: 'listItem', content: [paragraph('우회 경로 검증')] },
        ],
      },
    ),
  ],
  'internal-comment': [
    doc(
      paragraph('SRE 확인 필요. actor mention과 로그 스니펫을 남깁니다.', [
        { type: 'link', attrs: { href: 'https://runbooks.example.com/warehouse-refresh' } },
      ]),
      { type: 'mention', attrs: { actor_id: ACTOR_ID } },
      {
        type: 'codeBlock',
        attrs: { language: 'sql' },
        content: [{ type: 'text', text: 'select job_id, status from refresh_jobs where status = ' + "'failed';" }],
      },
      { type: 'attachmentRef', attrs: { id: ATTACHMENT_ID } },
    ),
  ],
};

export const UI_INVALID_RICH_CONTENT_FIXTURES: Record<UISurface, UIInvalidRichContentFixture[]> = {
  'voc-description': [
    {
      doc: doc({ type: 'image', attrs: { src: 'https://cdn.example.com/evidence.png' } }),
      expectedCode: 'rich_content.external_image_forbidden',
    },
    {
      doc: doc({
        type: 'attachmentRef',
        attrs: { id: ATTACHMENT_ID },
        content: [{ type: 'text', text: 'leaf nodes must not carry inline notes' }],
      }),
      expectedCode: 'rich_content.disallowed_node',
    },
    {
      doc: doc({ type: 'paragraph', attrs: { onclick: 'alert(1)' }, content: [{ type: 'text', text: 'unsafe' }] }),
      expectedCode: 'rich_content.disallowed_attr',
    },
    {
      doc: doc(paragraph('click here', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
      expectedCode: 'rich_content.invalid_attr_value',
    },
    {
      doc: doc({ type: 'attachmentRef', attrs: {} }),
      expectedCode: 'rich_content.missing_required_attr',
    },
  ],
  'reporter-reply': [
    {
      doc: doc({ type: 'mention', attrs: { actor_id: ACTOR_ID } }),
      expectedCode: 'rich_content.disallowed_node',
    },
    {
      doc: doc(paragraph('첨부 확인 부탁드립니다.', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }])),
      expectedCode: 'rich_content.disallowed_attr',
    },
    {
      doc: doc({ type: 'attachmentRef', attrs: { id: 'not-a-uuid' } }),
      expectedCode: 'rich_content.invalid_attr_value',
    },
    {
      doc: doc(paragraph('링크만 다시 보냅니다.', [{ type: 'link', attrs: {} }])),
      expectedCode: 'rich_content.missing_required_attr',
    },
  ],
  'public-update': [
    {
      doc: doc({ type: 'image', attrs: { src: 'https://cdn.example.com/public.png' } }),
      expectedCode: 'rich_content.external_image_forbidden',
    },
    {
      doc: doc({ type: 'codeBlock', content: [{ type: 'text', text: 'internal stack trace' }] }),
      expectedCode: 'rich_content.disallowed_node',
    },
    {
      doc: doc({ type: 'paragraph', attrs: { dataPrivate: 'jira-ops-778' }, content: [{ type: 'text', text: 'update' }] }),
      expectedCode: 'rich_content.disallowed_attr',
    },
  ],
  'internal-comment': [
    {
      doc: doc({
        type: 'mention',
        attrs: { actor_id: ACTOR_ID },
        content: [{ type: 'text', text: '@mention label must stay external to the atom' }],
      }),
      expectedCode: 'rich_content.disallowed_node',
    },
    {
      doc: doc({ type: 'mention', attrs: { actor_id: ACTOR_ID, label: '<script>alert(1)</script>' } }),
      expectedCode: 'rich_content.disallowed_attr',
    },
    {
      doc: doc({ type: 'codeBlock', attrs: { language: 'x'.repeat(33) }, content: [{ type: 'text', text: 'select 1' }] }),
      expectedCode: 'rich_content.invalid_attr_value',
    },
    {
      doc: doc({ type: 'mention', attrs: {} }),
      expectedCode: 'rich_content.missing_required_attr',
    },
  ],
};
