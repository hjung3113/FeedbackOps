import { vocClusterSuggestionsResponseSchema } from '@fops/shared';

export const clusterSuggestionsFixture = vocClusterSuggestionsResponseSchema.parse({
  available: true,
  items: [
    {
      id: '11111111-1098-4098-8098-111111111111',
      primary_managed_system_id: '99999999-9999-9999-9999-999999999999',
      revision: 1,
      embedding_version: 1,
      source_hashes: ['hash-first', 'hash-second'],
      vocs: [
        {
          id: '22222222-1098-4098-8098-222222222222',
          display_id: 'VOC-12',
          title: '결제 내역을 확인하기 어렵습니다',
          description_rich_content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: '결제 내역 화면에서 지난달 청구 금액을 찾기 어렵습니다. 월별 내역을 한눈에 볼 수 있으면 좋겠습니다.',
                  },
                ],
              },
            ],
          },
        },
        {
          id: '33333333-1098-4098-8098-333333333333',
          display_id: 'VOC-34',
          title: '월별 청구 금액을 비교하고 싶습니다',
          description_rich_content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: '월별 결제 금액을 비교하려면 여러 화면을 오가야 합니다. 결제 내역에 월별 비교 기능을 추가해 주세요.',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
});
