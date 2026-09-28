# Visual Harness Agent Guide

Committed Playwright visual regression harness. Baseline discipline and the CP-pixel sign-off live in `apps/frontend/AGENTS.md` → Page-Level Pixel-Diff; this file covers running, extending, and debugging the harness.

## How it works

- Config: `apps/frontend/playwright.config.ts`. Scripts (from `apps/frontend`): `pnpm test:visual` (check) and `pnpm test:visual:update` (regenerate).
- Playwright drives `vite build && vite preview` on IPv4 `127.0.0.1`, not the dev server. The webServer command must be `pnpm --filter @fops/frontend exec vite preview --host 127.0.0.1 …`; `pnpm run preview -- --host` binds `[::1]` only and the readiness probe hangs.
- All network is route-mocked and fail-closed through `support/mock-api.ts`: an unmatched same-origin fetch/XHR throws. The auth seam intercepts `GET /me` (role parameter for permission specs).
- Fixtures are parsed through `@fops/shared` Zod schemas at module load, so the mock cannot certify an impossible backend shape.
- Baselines are platform-split (`baselines/<platform>/chromium/`) because font fallback differs between macOS and Linux.
- `support/visual-test.ts` pins `FIXED_CLOCK`, so relative timestamps stay reproducible. A fixture newer than the pin renders a future-dated label: move the pin with the fixture and regenerate the affected baselines in the same commit.
- `support/screenshot.ts` captures the viewport, not the full page, with `maxDiffPixelRatio: 0.0002` (~276 px at 1440×960). An element below the fold gets no visual coverage, and a 1-2 character text change can pass under the threshold.
- Sandboxed workers have no browser. They write specs, fixtures, and config and typecheck them; the conductor runs the harness and generates and commits baselines outside the sandbox.

## Adding a screen

- A new screen is one fixture file plus one spec, not new infrastructure. Keep to about 3 screenshots per screen area; jsdom already covers the behavior matrix, so Playwright adds only real routing, real CSS/portals, and a few screenshots.
- Answer every route the screen calls while mounting (e.g. VOC detail calls `GET /vocs/:id/recommendations`; the Managed Systems registry calls `GET /analytics-areas`). A single unregistered route ends the test before the screenshot. Prefer mocks that answer generously and leave scope-contract assertions to jsdom tests; a handler that throws on an unexpected query also breaks other consumers on the same screen.
- Fixture fidelity: use only capabilities registered in `packages/shared/src/enums/capabilities.ts`; match the backend's list ordering; use per-action response shapes; mirror what the client really posts (an empty optional reason posts `{}`, not `{reason: ''}`).
- Every screenshot must capture a distinct state. Drop one of two byte-identical PNGs.
- A new-screen change usually also touches `apps/frontend/src/lib/layout/AppSidebar.tsx` (nav entry), `apps/frontend/vite.config.ts` (dev proxy for a new API prefix), and `support/mock-api.ts` — include them in scope from the start.
- Before moving or renaming a selector anywhere in the app, grep `tests/visual/` for specs that use it.

## Regenerating baselines

- `pnpm test:visual -- --update-snapshots <filter>` does not take effect. From `apps/frontend`: `env -u NODE_OPTIONS npx playwright test -c playwright.config.ts --update-snapshots=changed <spec filter>` (modes: `all|changed|missing|none`; `changed` is the default when the flag is bare).
- `--update-snapshots` leaves a file untouched when the difference is under the threshold. To force a sub-threshold change into a baseline, delete the PNG first, then regenerate.
- Before regenerating, compare the actual screenshot against the prototype: a failing baseline may mean broken layout, not a stale image.
- Fresh machines may need `pnpm exec playwright install chromium` first.

## Evidence rules

- A new baseline is not evidence until it passes at least 3 reruns without `--update-snapshots`; its first run compared the image to itself.
- The usual source of flake is an independently scrolling container, which `window.scrollTo(0, 0)` does not normalize. Wait for `document.fonts.ready`, then clamp the container to its end (`node.scrollTop = node.scrollHeight`); `scrollIntoView` still drifts with font loading. Comment that the container lookup depends on DOM structure.
- The same pixel count failing on every rerun means a stale baseline or a real regression, not a flake (flake counts wobble). Compare `git log -- <baseline.png>` with `git log -- <component>`.
- A pixel count can combine several causes. Look at the diff image before attributing a number to one change.
- No gate or CI runs this harness, so `develop` itself can be red. To attribute failures, run the full suite on the branch and on `develop`, then `comm` the sorted failure lists; only failures unique to the branch are the branch's.
- To prove a refactor changed nothing on a screen with no spec: first commit a spec, fixture, and baseline against the pre-refactor code (generate it from a detached worktree at the pre-refactor commit), then refactor and rerun 3 times without updating. Wait on a positive condition (e.g. `toHaveCount(1)`), never on a count of 0.

## Debugging "element not found"

Rerun the single spec with `--trace on`, unzip `test-results/**/trace.zip`, and grep the `.trace` files for `"type":"console"` errors. A production-only crash (e.g. a conditional-hook React #310) unmounts the tree and shows up this way. `test:visual` builds fresh through its webServer, so a stale-dist theory is usually wrong.
