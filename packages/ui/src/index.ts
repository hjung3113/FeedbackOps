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
export {
  DIALOG_CONTENT_MOTION,
  POPPER_CONTENT_MOTION,
  SCRIM_MOTION,
  SELECT_CONTENT_MOTION,
  SHEET_CONTENT_MOTION,
  prefersReducedMotion,
} from './utils/motion.js';

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
  type RichEditorToolbarApi,
  type RichEditorAttachmentResult,
  type TipTapDoc,
} from './rich-content/RichEditor';
export { AttachButton, type AttachButtonProps } from './rich-content/toolbar/AttachButton';
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
export { ToolbarKicker, type ToolbarKickerProps } from './layout/ToolbarKicker';
export { useDetailPanelSlot, DetailPanelSlotContext } from './layout/useDetailPanelSlot';

// Form primitives (Slice 3 #19)
export { FieldLabel, type FieldLabelProps } from './forms/FieldLabel';
export { DatePicker, type DatePickerProps } from './forms/DatePicker.js';
// Feedback primitives (Slice 3 #19)
export { DirtyConfirmation, type DirtyConfirmationProps } from './feedback/DirtyConfirmation';
// Feedback primitives (Slice 3 #21 C3.1)
export { UndoToast, type UndoToastProps } from './feedback/UndoToast';
// Feedback primitives (Slice 3 #21 C5.5)
export { PreviewModal, type PreviewModalProps } from './feedback/PreviewModal';

// Indicators + badges (Slice 3 #20)
export {
  SeverityIndicator,
  type SeverityIndicatorProps,
  type SeverityEnum,
} from './indicators/SeverityIndicator';
export { ProgressMeter, type ProgressMeterProps } from './indicators/ProgressMeter';
export {
  SeverityBadge,
  SEVERITY_LABELS,
  type SeverityBadgeProps,
} from './badges/SeverityBadge';
export {
  ReporterStatusBadge,
  type ReporterStatusBadgeProps,
  type ReporterFacingStatusEnum,
} from './badges/ReporterStatusBadge';
export {
  InternalTaskBadge,
  type InternalTaskBadgeProps,
  type InternalTaskStatusEnum,
} from './badges/InternalTaskBadge';
export {
  StatusBadgeFrame,
  type StatusBadgeFrameProps,
  type StatusBadgeAppearance,
  type StatusBadgeTone,
} from './badges/StatusBadgeFrame';
export { UnassignedBadge, type UnassignedBadgeProps } from './badges/UnassignedBadge';
export { ManagedSystemPill, type ManagedSystemPillProps } from './badges/ManagedSystemPill';
export { ManagedSystemMark, type ManagedSystemMarkProps } from './badges/ManagedSystemMark';
export {
  managedSystemMarkColor,
  managedSystemMarkToken,
  type ManagedSystemMarkToken,
} from './badges/managed-system-mark.js';
export { OutlineBadge, type OutlineBadgeProps } from './badges/OutlineBadge';
export { EntityIconBadge, type EntityIconBadgeProps, type EntityIconType, ENTITY_ICON_MAP } from './badges/EntityIconBadge';

// Identity (Slice 3 #20)
export { UserAvatar, type UserAvatarProps, type AvatarUser } from './identity/UserAvatar';
export { UserChip, type UserChipProps } from './identity/UserChip';

// Toolbar primitives (Slice 3 #20)
export { ListToolbar, type ListToolbarProps, type ListToolbarTab } from './toolbar/ListToolbar';
export { ListTabs, type ListTabsProps } from './toolbar/ListTabs';
export {
  ListFilterButton,
  type ListFilterButtonProps,
  type FilterCategory,
} from './toolbar/ListFilterButton';
export {
  ListSortButton,
  type ListSortButtonProps,
  type SortOption,
} from './toolbar/ListSortButton';
export { KeyboardShortcut, type KeyboardShortcutProps } from './components/KeyboardShortcut';
export { SkeletonRows, type SkeletonRowsProps } from './components/SkeletonRows';
export {
  SkeletonBlocks,
  type SkeletonBlocksProps,
  type SkeletonBlock,
} from './components/SkeletonBlocks';
// Forms (Slice 3 #20)
export { SearchInput, type SearchInputProps } from './forms/SearchInput';
// Feedback (Slice 3 #20)
export { EmptyState, type EmptyStateProps } from './feedback/EmptyState';

// Data primitives (Slice 6 #137)
export {
  ObjectRow,
  type ObjectRowProps,
  type ObjectRowDensity,
  type ObjectRowSeverity,
} from './data/ObjectRow';

// Panel primitives (Slice 3 #20)
export { DetailPanelHeader, type DetailPanelHeaderProps, type DetailPanelKind } from './panel/DetailPanelHeader';
export {
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
  DetailPanelReadingColumn,
  type DetailPanelFullscreenValue,
} from './panel/DetailPanelFullscreenContext';
export { PanelTitleBlock, type PanelTitleBlockProps } from './panel/PanelTitleBlock';
export { NestedTextBlock, type NestedTextBlockProps } from './panel/NestedTextBlock';
export { FieldRow, type FieldRowProps } from './panel/FieldRow';
export { PanelSectionTitle, type PanelSectionTitleProps } from './panel/PanelSectionTitle';
export { Callout, type CalloutProps, type CalloutTone } from './panel/Callout';
export { DetailPanelHeaderActions, type DetailPanelHeaderActionsProps } from './panel/DetailPanelHeaderActions';
// Panel section nav (Slice 3 #21 — deferred from #20)
export { DetailPanelSectionNav, type DetailPanelSectionNavProps, type PanelSection } from './panel/DetailPanelSectionNav';

// Permissions (Slice 3 #20)
export {
  PermissionBlockedPanel,
  type PermissionBlockedPanelProps,
  type PermissionState,
} from './permissions/PermissionBlockedPanel';
// Entity (Slice 3 #20 placeholder; Slice 4 wires real node resolution)
export {
  LinkedEntityTrail,
  type LinkedEntityTrailProps,
  type EntityNodeRef,
} from './entity/LinkedEntityTrail';
