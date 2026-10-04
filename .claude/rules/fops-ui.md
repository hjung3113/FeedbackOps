---
paths:
  - "packages/ui/src/**"
  - "apps/frontend/src/features/**/*.tsx"
---

# @fops/ui traps

- `DialogContent` always renders a built-in close button whose sr-only name is the Korean `closeLabel` default (`packages/ui/src/components/shadcn/dialog.tsx`; `SheetContent` does the same; override per call with the `closeLabel` prop). A second button with that same name makes `getByRole('button', { name })` match two elements; target dialog buttons by `data-testid` and keep the visible label.
- `Button variant="subtle"` is an alias for `ghost`: no border and no background, so it reads as plain text. For an action that must look like a control, use `secondary`; `destructive` is for deletes only.
- A chip inside a row or card must not use its container's surface token (`surface-row-*`, `surface-card*`) as its background, or it disappears on hover. Mirror an existing chip: a `/10`-alpha background of its foreground token plus the matching foreground color.
- Unit tests cannot see affordance or layout defects. When a screen changes, look at a rendered before/after screenshot.
