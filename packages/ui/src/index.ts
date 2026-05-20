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
export {
  RichEditor,
  type RichEditorProps,
  type RichEditorSurface,
  type TipTapDoc,
} from './rich-content/RichEditor';
// Re-export the TipTap Editor type so feature packages can type render-prop callbacks
// (e.g. RichEditor toolbar) without depending on @tiptap/react directly.
export type { Editor as TipTapEditor } from '@tiptap/react';
export {
  RichContentRenderer,
  type RichContentRendererProps,
  type RichContentMode,
} from './rich-content/RichContentRenderer';
export { AttachmentRef, type AttachmentRefAttrs } from './rich-content/extensions/attachmentRef';
export { Mention, type MentionAttrs } from './rich-content/extensions/mention';

// Layout shells (ADR-0020 — exactly three shells: PageShell / ListShell / WorkbenchShell)
export { PageShell, type PageShellProps } from './layout/PageShell';
export { ListShell, type ListShellProps } from './layout/ListShell';
export { WorkbenchShell, type WorkbenchShellProps } from './layout/WorkbenchShell';
export { ShellHeader, type ShellHeaderProps } from './layout/ShellHeader';
export { useDetailPanelSlot, DetailPanelSlotContext } from './layout/useDetailPanelSlot';

// Form primitives (Slice 3 #19)
export { FieldLabel, type FieldLabelProps } from './forms/FieldLabel';
// Feedback primitives (Slice 3 #19)
export { DirtyConfirmation, type DirtyConfirmationProps } from './feedback/DirtyConfirmation';

// Indicators + badges (Slice 3 #20)
export { SeverityIndicator, type SeverityIndicatorProps, type SeverityEnum } from './indicators/SeverityIndicator';
export { SeverityBadge, type SeverityBadgeProps } from './badges/SeverityBadge';
export { ReporterStatusBadge, type ReporterStatusBadgeProps, type ReporterFacingStatusEnum } from './badges/ReporterStatusBadge';
export { InternalTaskBadge, type InternalTaskBadgeProps, type InternalTaskStatusEnum } from './badges/InternalTaskBadge';
export { ManagedSystemPill, type ManagedSystemPillProps } from './badges/ManagedSystemPill';
export { OutlineBadge, type OutlineBadgeProps } from './badges/OutlineBadge';
export { EntityIconBadge, type EntityIconBadgeProps, type EntityIconType, ENTITY_ICON_MAP } from './badges/EntityIconBadge';

// Identity (Slice 3 #20)
export { UserAvatar, type UserAvatarProps, type AvatarUser } from './identity/UserAvatar';
export { UserChip, type UserChipProps } from './identity/UserChip';
