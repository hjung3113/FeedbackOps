export { Button, buttonVariants } from './components/Button.js';
export type { ButtonProps } from './components/Button.js';
export {
  ManagedSystemPicker,
  type ManagedSystemPickerProps,
  type PickerOption,
} from './components/ManagedSystemPicker.js';
export {
  AnalyticsAreaPicker,
  type AnalyticsAreaPickerProps,
} from './components/AnalyticsAreaPicker.js';
export { cn } from './utils/cn.js';

// shadcn primitives (Pack 17, ADR-0021)
// Note: shadcn/button re-exports Button/buttonVariants already exported above — omitted to avoid collision
export * from './components/shadcn/input.js';
export * from './components/shadcn/textarea.js';
export * from './components/shadcn/label.js';
export * from './components/shadcn/select.js';
export * from './components/shadcn/checkbox.js';
export * from './components/shadcn/radio-group.js';
export * from './components/shadcn/toggle-group.js';
export * from './components/shadcn/card.js';
export * from './components/shadcn/dialog.js';
export * from './components/shadcn/alert-dialog.js';
export * from './components/shadcn/alert.js';
export * from './components/shadcn/tooltip.js';
export * from './components/shadcn/hover-card.js';
export * from './components/shadcn/popover.js';
export * from './components/shadcn/sheet.js';
export * from './components/shadcn/tabs.js';
export * from './components/shadcn/skeleton.js';
export * from './components/shadcn/avatar.js';
export * from './components/shadcn/badge.js';
export * from './components/shadcn/dropdown-menu.js';
export * from './components/shadcn/combobox.js';

// Rich content (Pack 17, ADR-0011)
export { RichEditor, type RichEditorProps, type TipTapDoc } from './rich-content/RichEditor';
export { RichContentRenderer, type RichContentRendererProps, type RichContentMode } from './rich-content/RichContentRenderer';
export { AttachmentRef, type AttachmentRefAttrs } from './rich-content/extensions/attachmentRef';
export { Mention, type MentionAttrs } from './rich-content/extensions/mention';
