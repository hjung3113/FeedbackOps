# CP2 Pixel-Diff Baseline Capture Instructions

## Baselines required

- `voc-triage-console.png` — Triage console view at `/vocs?view=triage` with 5 seeded VOCs, 1440×900
- `voc-detail-composer.png` — VOC detail panel with composer section open (admin actor, Public update tab), 1440×900

## Capture steps

1. Start the full stack:
   ```bash
   pnpm dev
   ```

2. Seed the database with triage fixture VOCs:
   ```bash
   pnpm --filter=backend seed:triage
   ```

3. Authenticate via mock-login (admin actor):
   ```
   POST /auth/mock-login { "external_id": "admin-001" }
   ```

4. Navigate to `/vocs?view=triage` → capture `voc-triage-console.png` at 1440×900 via Playwright MCP.

5. Click the first VOC in the queue → TriagePanel opens → scroll to detail panel.
   Navigate to `/vocs?selected=<voc-id>` → capture `voc-detail-composer.png` at 1440×900 via Playwright MCP.

6. Place captured PNGs in this directory (`.review/baselines/`).

7. Commit:
   ```bash
   git add .review/baselines/voc-triage-console.png .review/baselines/voc-detail-composer.png
   git commit -m "docs(slice3 #21): CP2 pixel-diff baselines for triage + detail composer"
   ```

## Diff threshold

After capture, subsequent Playwright runs should assert ≤ 0.1% pixel diff against these baselines.
