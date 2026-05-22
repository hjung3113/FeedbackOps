// Shared byte → human-readable size formatter for attachment chips and
// dropzone rows. Single source of truth — previously duplicated in
// AttachmentDropzone.tsx and ComposerAttachmentDropzone.tsx.
//
// PLAN-22 §Bug-1 (2026-05-22): consolidated when wiring detail-panel and
// timeline-entry attachment chips, which also need this same B/KB/MB
// rendering. Keep the output stable — existing tests assert exact strings.

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
