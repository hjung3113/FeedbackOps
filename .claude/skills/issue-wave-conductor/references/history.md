# Issue wave conductor — history

Dated measurements and incident notes moved out of `SKILL.md` (session 71, 2026-10-11) so the skill loads
only current rules. Each rule they produced is still in `SKILL.md`; this file keeps the evidence.

## Origin (session 58)

Measured in session 58 (2026-09-30): 25+ issues merged from the #578 review wave with this workflow.

## Mock wave (2026-10-08), step 7

**Mock wave (2026-10-08).** #838 and #821 were replayed at their pre-review commits.
- **Code reviewer (Sol xhigh, background):** 3.7–5 min per issue. It caught 6 of the 8 planted code-level
  defects.
- **UX reviewer (Opus high):** 6–10 min, 50–66 turns and $1.9–2.6 per issue in the mock wave; in Slice 48 real
  runs took 15–37 min and $2.8–5.6, and two hit the 120-turn limit.
  - It caught 1 of the 3 planted UI defects. It missed the #838 null-close because the seed has no
    Task/Finding/Survey records (#853), and missed #821's tab-scoped search because it was brief-consistent
    (now an expectation check in the agent).
  - It found 4 real issues no code review had (#849–#852).
  - Tripwires were clean, and no preview or orphan was left.
- A `--seed` preview has one `[preview]` record per drawer surface (Finding,
  Task Request (one converted, one pending), Task, Milestone, VOC Cluster, discovery Survey with a
  response, outcome Survey follow-up, and a Permission request). UX tasks can open those drawers.

## nav-perf validation (2026-10-08)

  - Validated 2026-10-08:
    - noise floor, develop vs develop: ≤4 ms;
    - positive control, the commit before #840 vs develop: reloads on every click, ~290 vs ~100 ms, 15–21 vs 3–11
      API calls;
    - a reload-heavy build can hit the `/me` rate limit and drop a sample.

## app-preview verification (2026-10-08)

  - Verified 2026-10-08:
    - two seeded previews on one throwaway DB kept separate logins (`/me` = admin vs user);
    - the dev-DB env was refused.

## Session 59 traps (2026-10-02, Slice 22/23 wave)

- Session 59 (2026-10-02, Slice 22/23 wave):
  - **TanStack flat-file nesting**: `$surveyId.respond.tsx` became a child of the `$surveyId.tsx` management layout, which
    renders `<Outlet/>` only for its known children — the respondent form never rendered and the parent fired a
    `survey.read`-gated detail read. Unit tests rendered the page component directly and passed. Briefs that add a route
    under an existing `$param.tsx` must require a **real route-tree test**; un-nest with a trailing underscore
    (`$surveyId_.respond.tsx`).
  - A merge that adds dependencies (#721 webfonts) breaks other worktrees' `vite build` (`ENOENT
    @fontsource-variable/inter`) until `pnpm install --frozen-lockfile` runs there; the Playwright webServer just reports
    "was not able to start".
  - Pixel-preserving refactors: changing a label's line box inside a **vertically centred dialog** shifts the whole
    modal by a subpixel (8k-pixel diff across every glyph). Leave such sites local.
  - A rebase that crosses a mass-baseline merge (#721 regenerated 70 PNGs) conflicts on every PNG: take develop's
    (`git checkout --ours` during a rebase), finish the rebase, regenerate once.
  - Tests written before a copy sweep pin the old labels (#706 tests vs #679): after rebasing a copy sweep, expect label
    failures in tests that landed in between; update the expectations, not the copy.
  - omp workers stall silently on their 5-hour quota; read the worker terminal with `orca terminal read --screen`
    (the stream read shows only the splash) and trust `Provider requested Nms wait`, not the printed reset time.
