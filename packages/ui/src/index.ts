export {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  DIALOG_CONTENT_MOTION,
  Dialog,
  DialogClose,
  DialogContent,
  DialogContentBare,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  KeyboardShortcut,
  Label,
  POPPER_CONTENT_MOTION,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  SCRIM_MOTION,
  SELECT_CONTENT_MOTION,
  SHEET_CONTENT_MOTION,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  SkeletonBlocks,
  SkeletonRows,
  Tabs,
  TabsContent,
  TabsListBase as TabsList,
  TabsTriggerBase as TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  badgeVariants,
  buttonVariants,
  cn,
  isToastTarget,
  prefersReducedMotion,
  readMotionTiming,
  useListMotion,
  type BadgeProps,
  type ButtonProps,
  type ComboboxOption,
  type ComboboxProps,
  type InputProps,
  type KeyboardShortcutProps,
  type SkeletonBlock,
  type SkeletonBlocksProps,
  type SkeletonRowsProps,
  type TextareaProps,
} from '@ap/ui';

export {
  ManagedSystemPicker,
  type ManagedSystemPickerProps,
  type PickerOption,
} from './components/ManagedSystemPicker.js';
export {
  AnalyticsAreaPicker,
  type AnalyticsAreaPickerProps,
} from './components/AnalyticsAreaPicker.js';
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
export {
  DetailPanelSlotProvider,
  useDetailPanelSlot,
  useDetailPanelSlotHost,
} from './layout/useDetailPanelSlot';

// Bundle 2a panel, toolbar, forms, and feedback exports are sourced from @ap/ui (#1290).
export {
  ActiveFilterBar,
  type ActiveFilterBarProps,
  Callout,
  type CalloutProps,
  type CalloutTone,
  DatePicker,
  type DatePickerProps,
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
  type DetailPanelFullscreenValue,
  DetailPanelHeader,
  type DetailPanelHeaderProps,
  DetailPanelHeaderActions,
  type DetailPanelHeaderActionsProps,
  type DetailPanelKind,
  DetailPanelReadingColumn,
  DetailPanelSectionNav,
  type DetailPanelSectionNavProps,
  type PanelSection,
  DirtyConfirmation,
  type DirtyConfirmationProps,
  EmptyState,
  type EmptyStateProps,
  FieldLabel,
  type FieldLabelProps,
  FieldRow,
  type FieldRowProps,
  ListFilterButton,
  type ListFilterButtonProps,
  ListSortButton,
  type ListSortButtonProps,
  ListTabs,
  type ListTabsProps,
  ListToolbar,
  type ListToolbarProps,
  type ListToolbarTab,
  NestedTextBlock,
  type NestedTextBlockProps,
  PanelSectionTitle,
  type PanelSectionTitleProps,
  PanelTitleBlock,
  type PanelTitleBlockProps,
  PreviewModal,
  type PreviewModalProps,
  SearchInput,
  type SearchInputProps,
  type FilterCategory,
  type SortOption,
  UndoToast,
  type UndoToastProps,
} from '@ap/ui';

// Indicators + badges (Slice 3 #20)
export {
  SeverityIndicator,
  type SeverityIndicatorProps,
  type SeverityEnum,
} from '@ap/ui';
export { ProgressMeter, type ProgressMeterProps } from '@ap/ui';
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
} from '@ap/ui';
export { UnassignedBadge, type UnassignedBadgeProps } from './badges/UnassignedBadge';
export { ManagedSystemPill, type ManagedSystemPillProps } from './badges/ManagedSystemPill';
export { ManagedSystemMark, type ManagedSystemMarkProps } from './badges/ManagedSystemMark';
export {
  managedSystemMarkColor,
  managedSystemMarkToken,
  type ManagedSystemMarkToken,
} from './badges/managed-system-mark.js';
export { OutlineBadge, type OutlineBadgeProps } from './badges/OutlineBadge';
export {
  EntityIconBadge,
  type EntityIconBadgeProps,
  type EntityIconType,
  ENTITY_ICON_MAP,
} from './badges/EntityIconBadge';

// Identity (Slice 3 #20)
export { UserAvatar, type UserAvatarProps, type AvatarUser } from '@ap/ui';
export { UserChip, type UserChipProps } from '@ap/ui';

// Data primitives (Slice 6 #137)
export {
  ObjectRow,
  type ObjectRowProps,
  type ObjectRowDensity,
  type ObjectRowSeverity,
} from '@ap/ui';

// Permissions (Slice 3 #20)
export {
  PermissionBlockedPanel,
  type PermissionBlockedPanelProps,
  type PermissionState,
} from '@ap/ui';
// Entity (Slice 3 #20 placeholder; Slice 4 wires real node resolution)
export {
  LinkedEntityTrail,
  type LinkedEntityTrailProps,
  type EntityNodeRef,
} from './entity/LinkedEntityTrail';
