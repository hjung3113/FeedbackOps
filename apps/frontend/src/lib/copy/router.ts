export const ROUTER_FALLBACK_COPY = {
  pending: '불러오는 중…',
  error: {
    title: '화면을 불러오지 못했습니다',
    body: '잠시 후 다시 시도하세요.',
    action: '다시 시도',
    meRateLimitedTitle: '로그인 상태를 확인할 수 없습니다',
    meRateLimitedBody: '잠시 후 다시 시도하세요.',
  },
  notFound: {
    title: '페이지를 찾을 수 없습니다',
    body: '주소가 변경되었거나 페이지가 삭제되었을 수 있습니다.',
    home: '홈으로',
    back: '뒤로',
  },
} as const;
