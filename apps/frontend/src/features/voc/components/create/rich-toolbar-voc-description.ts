// VOC description surface toolbar configuration (spec §5.7).
// Pure data — no imports, no rendering.
// PLAN-22 C8: Attach is now an active button wired through VocDescriptionToolbar's
// `onAttach` render-prop (uploads via attachmentsApi.uploadAttachment).

export type VocDescriptionToolbarAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'code'
  | 'bulletList'
  | 'link'
  | 'attach';

export interface VocDescriptionToolbarItem {
  id: VocDescriptionToolbarAction;
  disabled?: boolean;
  tooltip?: string;
}

export const VOC_DESCRIPTION_TOOLBAR: readonly VocDescriptionToolbarItem[] = [
  { id: 'bold' },
  { id: 'italic' },
  { id: 'underline' },
  { id: 'code' },
  { id: 'bulletList' },
  { id: 'link' },
  { id: 'attach', tooltip: '첨부 파일 추가' },
];
