// VOC description surface toolbar configuration (spec §5.7).
// Pure data — no imports, no rendering.
// The Attach action is visible but disabled with a deferral tooltip.
// C5 wires this constant into VocCreateScreen's RichEditor.

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
  { id: 'attach', disabled: true, tooltip: '첨부 기능은 다음 슬라이스에서 제공됩니다' },
];
