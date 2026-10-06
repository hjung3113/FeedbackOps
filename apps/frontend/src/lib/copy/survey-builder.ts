export const SURVEY_BUILDER_COPY = {
  addOption: '옵션 추가',
  addQuestionBeforeLaunch: '시작하려면 질문을 하나 이상 추가하세요.',
  branchOptionResetNotice:
    '분기 조건으로 사용 중인 옵션을 삭제하면 첫 번째 남은 옵션으로 변경됩니다.',
  emptyOptionLabel: '옵션을 입력하세요.',
  launchSaveFailed: '저장하지 못해 시작하지 않았습니다.',
  launchOptionValidationFailed: '빈 옵션을 채운 후 다시 시작하세요.',
  optionDeleteLabel: (number: number) => `옵션 ${number} 삭제`,
  optionLabel: (number: number) => `옵션 ${number}`,
} as const;
