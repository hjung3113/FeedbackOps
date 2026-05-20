OpenAI Codex v0.131.0
--------
workdir: /Users/hyojung/Desktop/2026/FeedbackOps
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019e42cc-1f79-7961-bb4b-13012e621132
--------
user
You are an adversarial reviewer of an implementation. Cycle 1 of 2 (Cycle 2 will be by an Opus subagent).

Branch: feature/18-fe-prologue at /Users/hyojung/Desktop/2026/FeedbackOps
Base: develop @ e6577eb
HEAD: d108627

Diff scope: 10 commits from the C0-C5 chunks of Slice 3 #18 FE prologue:
  3de3c32 docs: ADR-0021 supersedes ADR-0016
  986be04 docs: DESIGN.md Pack 17 values
  f9e4fe2 feat C1a: Pack 17 tokens (R G B) + Tailwind preset + token-fidelity snapshot
  f51c79d feat C1b: 22 shadcn primitives + Button CVA with loading regression fix
  77a91ce feat C1c: ManagedSystemPicker + AnalyticsAreaPicker on ToggleGroup
  9157920 feat C2: TipTap RichEditor + RichContentRenderer + extensions
  e3659c0 test: admin/analytics-areas test on ToggleGroup picker
  079535b feat C3: sonner Toaster + apiClient + errorMapper + useIdempotencyKey
  ef9604f fix: distinct error toast icon
  829ff69 feat C4a: PageShell + ListShell + WorkbenchShell + ShellHeader
  b26f687 feat C4b: AppFrame + DetailPanelSlot + useFullscreenPanel
  d108627 feat C5: _authed layout route + /vocs route + admin relocation

Plan + history:
- `.review/SLICE-3-18-PLAN.md` — 10-chunk plan, 5 checkpoints, ADR-0021 + ADR-0020 amendment
- `.review/SLICE-3-18-PLAN-REVIEW-codex.md` — cycle 1 of PLAN review (11 findings, reinforced)
- `.review/SLICE-3-18-PLAN-REVIEW-CYCLE-2.md` — cycle 2 of PLAN review (11 cycle-2 findings, reinforced)
- `.review/SLICE-3-18-PLAN-REINFORCE-2-codex.md` — codex's plan reinforcement log

Tests: 68/68 @fops/frontend, 148/148 @fops/ui, 186/186 @fops/backend. Typecheck clean. Build clean. Biome lint 627 errors / 4 warnings (pre-existing repo-wide; not introduced by #18).

## READ FIRST (sample broadly — branch is large; cite file:line in findings)

1. `git diff develop...HEAD --stat` and walk the top-changed files
2. `.review/SLICE-3-18-PLAN.md` (the spec the impl must satisfy)
3. `packages/ui/src/styles/tokens.css` + `semantic.css` (Pack 17 port)
4. `packages/ui/tailwind.preset.ts` (Tailwind 3 + alpha-value composition)
5. `packages/ui/src/styles/__tests__/token-fidelity.test.ts` + `.fixture.ts` (closed-world snapshot)
6. `packages/ui/src/components/shadcn/*.tsx` — verify 22 primitives complete + correct shadcn patterns
7. `packages/ui/src/components/Button.tsx` (CVA + loading + asChild contract)
8. `packages/ui/src/rich-content/{RichEditor,RichContentRenderer}.tsx` + extensions
9. `packages/ui/src/layout/*.tsx` (3 shells per ADR-0020)
10. `apps/frontend/src/lib/api/{client,errorMapper,useIdempotencyKey}.ts` + tests
11. `apps/frontend/src/lib/layout/{AppFrame,AppRail,AppSidebar}.tsx` + tests
12. `apps/frontend/src/lib/panel/useFullscreenPanel.ts`
13. `apps/frontend/src/routes/_authed.tsx` + `_authed/admin/*` (relocation)
14. `apps/frontend/src/routes/_authed/vocs.tsx` (zod search + per-view shell)
15. `apps/frontend/src/routes/__root.tsx` (Toaster + custom icons)
16. `apps/frontend/src/routes/dev-rich-editor.tsx`
17. Move history: `git log --follow` on the admin relocated files to confirm history preserved
18. `apps/frontend/src/components-test-pickers.test.tsx` (post-C1c chip-click migration)

## REVIEW DIMENSIONS — find real failures (severity P0/P1/P2/P3)

1. **Pack 17 token correctness** — Every prototype hex from `docs/design-prototype/styles.css` lines 1-200 ported with correct R G B triple? Set-equality vs fixture? Any tokens missing from preset that semantic.css references? Compromises documented (surface-sidebar/row-hover/row-selected/severity-high non-triple) — are they safe (no production-relevant opacity utility) or do they bite #19/#20?
2. **Tailwind preset** — `rgb(var(--X) / <alpha-value>)` composition works for every color key (color, accent, severity, status, confidence)? `bg-severity-high/15` works at runtime (severity-high is RAW hex — confirmed bug?). spacing/radius/boxShadow extends complete?
3. **shadcn coverage** — 22 primitives listed in plan all present + correctly built? Each consumes Pack 17 semantic tokens (not shadcn default HSL)? combobox command-less pattern works (search + filter)? alert-dialog vs dialog distinction correct?
4. **Button.tsx contract** — loading + aria-busy + spinner preserved? asChild + loading throws in dev / warns in prod? primary/subtle aliases functional? Type contracts haven't regressed callers?
5. **TipTap extensions + renderer** — attachmentRef/mention attrs round-trip JSON → HTML → JSON? Mention strip in reporter_visible mode actually filters before generateHTML? StarterKit image disabled? TipTap v3 quirks (link/underline duplicate, setContent signature) addressed?
6. **Three shells + AppFrame** — exactly 3 shells in packages/ui/src/layout/? AppFrame is NOT exported from @fops/ui (lives in apps/frontend only)? 50px header rhythm enforced (h-toolbar token)? DetailPanelSlot single-registrant + last-write-wins warn?
7. **_authed.tsx auth guard** — fetchMe + redirect /login replicated from existing per-route guard? Admin route per-route guards DELETED? File moves used git mv (history preserved)? Route.id NOT used anywhere?
8. **/vocs zod search + shell selection** — schema rejects invalid view/action? shell picked correctly per view? passthrough preserves filter.* for #20? routeTree.gen.ts regen healthy (or manually updated in-tree — will it survive `pnpm dev`)?
9. **apiClient + idempotency** — Idempotency-Key on mutations only? If-Match plumbed? useIdempotencyKey re-mints on etag change (queueMicrotask)? 304 short-circuit? ApiError envelope shape correct?
10. **errorMapper** — every ERROR_CODES code covered? Slice-3-owner codes have non-fallback Korean? conflict.stale_write maps to warning + action? tone classification ∈ {error, warning, info}? Fallback for unknown codes?
11. **AppSidebar SSR safety** — initial state reads localStorage in window-guarded initializer? hydration mismatch risk?
12. **C1c regression spillover** — did C1c break any other test that called ManagedSystemPicker/AnalyticsAreaPicker via fireEvent.change? grep for `fireEvent.change.*picker` to find missed ones.
13. **Lint** — 7 new errors introduced by #18 (relative to develop baseline of 627). What are they? Should they be fixed before merge or filed as follow-up?
14. **Build size** — `apps/frontend` bundle is 985 kB (gzip 299 kB). Acceptable for slice 3 prologue? Code-split warning — any quick wins?
15. **Cycle-2 plan-review findings** — go through `.review/SLICE-3-18-PLAN-REVIEW-CYCLE-2.md` cycle 2 findings (P0-A through P3-C) and confirm each is reflected in the impl, not just in PLAN.md. The plan was reinforced; verify the CODE actually implements them.

## Output

Write to stdout in this format:

# Implementation Review — Slice 3 #18 FE Prologue (codex cycle 1)

## Severity summary
- P0: N · P1: N · P2: N · P3: N

## Findings

### P0-1 / P1-1 / ... — <title>
**File:line:** absolute or repo-relative
**Issue:** what is wrong
**Why it matters:** consequence (test coverage gap, runtime bug, follow-up debt)
**Suggested fix:** concrete code change

[repeat per finding, ordered by severity then file path]

## Cycle-2 PLAN finding verification
For each cycle-2 PLAN finding (P0-A, P0-B, P1-A through P1-E, P2-A through P2-D, P3-A through P3-C):
- ID, status: IMPLEMENTED / PARTIAL / NOT IMPLEMENTED
- file:line citation

## Quality call
One paragraph — is this branch mergeable now / mergeable after fixes / needs major rework?

## What I did NOT review
Bullet list of areas I skipped or had insufficient context.

DO NOT be diplomatic. Find real failures. Cite file:line. Prefer 8 specific findings over 20 vague ones.

hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
codex
I’ll treat this as a code-review pass, with findings first and file:line citations. I’m going to gather the diff shape, plan docs, and targeted implementation files before deciding what’s actually broken.
hook: PreToolUse
hook: PreToolUse Completed
exec
/bin/zsh -lc "pwd && rg --files -g 'SKILL.md' /Users/hyojung/.codex/skills /Users/hyojung/.agents/skills /Users/hyojung/.codex/plugins/cache/openai-curated/superpowers/eed16198/skills 2>/dev/null | rg '/(review|context-mode|requesting-code-review|verification-before-completion)/SKILL.md"'$'"'" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
/Users/hyojung/Desktop/2026/FeedbackOps
/Users/hyojung/.codex/skills/context-mode/SKILL.md

hook: PostToolUse
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
/bin/zsh -lc "sed -n '1,180p' /Users/hyojung/.codex/skills/context-mode/SKILL.md" in /Users/hyojung/Desktop/2026/FeedbackOps
exec
/bin/zsh -lc "sed -n '1,220p' /Users/hyojung/conductor/repos/conductor-playground/.claude/skills/gstack/.agents/skills/gstack-review/SKILL.md" in /Users/hyojung/Desktop/2026/FeedbackOps
 succeeded in 0ms:
---
name: review
description: |
  Pre-landing PR review. Analyzes diff against the base branch for SQL safety, LLM trust
  boundary violations, conditional side effects, and other structural issues. Use when
  asked to "review this PR", "code review", "pre-landing review", or "check my diff".
  Proactively suggest when the user is about to merge or land code changes. (gstack)
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

## Preamble (run first)

```bash
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
GSTACK_ROOT="$HOME/.codex/skills/gstack"
[ -n "$_ROOT" ] && [ -d "$_ROOT/.agents/skills/gstack" ] && GSTACK_ROOT="$_ROOT/.agents/skills/gstack"
GSTACK_BIN="$GSTACK_ROOT/bin"
GSTACK_BROWSE="$GSTACK_ROOT/browse/dist"
GSTACK_DESIGN="$GSTACK_ROOT/design/dist"
_UPD=$($GSTACK_BIN/gstack-update-check 2>/dev/null || .agents/skills/gstack/bin/gstack-update-check 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
mkdir -p ~/.gstack/sessions
touch ~/.gstack/sessions/"$PPID"
_SESSIONS=$(find ~/.gstack/sessions -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find ~/.gstack/sessions -mmin +120 -type f -exec rm {} + 2>/dev/null || true
_PROACTIVE=$($GSTACK_BIN/gstack-config get proactive 2>/dev/null || echo "true")
_PROACTIVE_PROMPTED=$([ -f ~/.gstack/.proactive-prompted ] && echo "yes" || echo "no")
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
_SKILL_PREFIX=$($GSTACK_BIN/gstack-config get skill_prefix 2>/dev/null || echo "false")
echo "PROACTIVE: $_PROACTIVE"
echo "PROACTIVE_PROMPTED: $_PROACTIVE_PROMPTED"
echo "SKILL_PREFIX: $_SKILL_PREFIX"
source <($GSTACK_BIN/gstack-repo-mode 2>/dev/null) || true
REPO_MODE=${REPO_MODE:-unknown}
echo "REPO_MODE: $REPO_MODE"
_LAKE_SEEN=$([ -f ~/.gstack/.completeness-intro-seen ] && echo "yes" || echo "no")
echo "LAKE_INTRO: $_LAKE_SEEN"
_TEL=$($GSTACK_BIN/gstack-config get telemetry 2>/dev/null || true)
_TEL_PROMPTED=$([ -f ~/.gstack/.telemetry-prompted ] && echo "yes" || echo "no")
_TEL_START=$(date +%s)
_SESSION_ID="$$-$(date +%s)"
echo "TELEMETRY: ${_TEL:-off}"
echo "TEL_PROMPTED: $_TEL_PROMPTED"
_EXPLAIN_LEVEL=$($GSTACK_BIN/gstack-config get explain_level 2>/dev/null || echo "default")
if [ "$_EXPLAIN_LEVEL" != "default" ] && [ "$_EXPLAIN_LEVEL" != "terse" ]; then _EXPLAIN_LEVEL="default"; fi
echo "EXPLAIN_LEVEL: $_EXPLAIN_LEVEL"
_QUESTION_TUNING=$($GSTACK_BIN/gstack-config get question_tuning 2>/dev/null || echo "false")
echo "QUESTION_TUNING: $_QUESTION_TUNING"
mkdir -p ~/.gstack/analytics
if [ "$_TEL" != "off" ]; then
echo '{"skill":"review","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> ~/.gstack/analytics/skill-usage.jsonl 2>/dev/null || true
fi
for _PF in $(find ~/.gstack/analytics -maxdepth 1 -name '.pending-*' 2>/dev/null); do
  if [ -f "$_PF" ]; then
    if [ "$_TEL" != "off" ] && [ -x "$GSTACK_BIN/gstack-telemetry-log" ]; then
      $GSTACK_BIN/gstack-telemetry-log --event-type skill_run --skill _pending_finalize --outcome unknown --session-id "$_SESSION_ID" 2>/dev/null || true
    fi
    rm -f "$_PF" 2>/dev/null || true
  fi
  break
done
eval "$($GSTACK_BIN/gstack-slug 2>/dev/null)" 2>/dev/null || true
_LEARN_FILE="${GSTACK_HOME:-$HOME/.gstack}/projects/${SLUG:-unknown}/learnings.jsonl"
if [ -f "$_LEARN_FILE" ]; then
  _LEARN_COUNT=$(wc -l < "$_LEARN_FILE" 2>/dev/null | tr -d ' ')
  echo "LEARNINGS: $_LEARN_COUNT entries loaded"
  if [ "$_LEARN_COUNT" -gt 5 ] 2>/dev/null; then
    $GSTACK_BIN/gstack-learnings-search --limit 3 2>/dev/null || true
  fi
else
  echo "LEARNINGS: 0"
fi
$GSTACK_BIN/gstack-timeline-log '{"skill":"review","event":"started","branch":"'"$_BRANCH"'","session":"'"$_SESSION_ID"'"}' 2>/dev/null &
_HAS_ROUTING="no"
if [ -f CLAUDE.md ] && grep -q "## Skill routing" CLAUDE.md 2>/dev/null; then
  _HAS_ROUTING="yes"
fi
_ROUTING_DECLINED=$($GSTACK_BIN/gstack-config get routing_declined 2>/dev/null || echo "false")
echo "HAS_ROUTING: $_HAS_ROUTING"
echo "ROUTING_DECLINED: $_ROUTING_DECLINED"
_VENDORED="no"
if [ -d ".agents/skills/gstack" ] && [ ! -L ".agents/skills/gstack" ]; then
  if [ -f ".agents/skills/gstack/VERSION" ] || [ -d ".agents/skills/gstack/.git" ]; then
    _VENDORED="yes"
  fi
fi
echo "VENDORED_GSTACK: $_VENDORED"
echo "MODEL_OVERLAY: claude"
_CHECKPOINT_MODE=$($GSTACK_BIN/gstack-config get checkpoint_mode 2>/dev/null || echo "explicit")
_CHECKPOINT_PUSH=$($GSTACK_BIN/gstack-config get checkpoint_push 2>/dev/null || echo "false")
echo "CHECKPOINT_MODE: $_CHECKPOINT_MODE"
echo "CHECKPOINT_PUSH: $_CHECKPOINT_PUSH"
[ -n "$OPENCLAW_SESSION" ] && echo "SPAWNED_SESSION: true" || true
```

## Plan Mode Safe Operations

In plan mode, allowed because they inform the plan: `$B`, `$D`, `codex exec`/`codex review`, writes to `~/.gstack/`, writes to the plan file, and `open` for generated artifacts.

## Skill Invocation During Plan Mode

If the user invokes a skill in plan mode, the skill takes precedence over generic plan mode behavior. **Treat the skill file as executable instructions, not reference.** Follow it step by step starting from Step 0; the first AskUserQuestion is the workflow entering plan mode, not a violation of it. AskUserQuestion (any variant — `mcp__*__AskUserQuestion` or native; see "AskUserQuestion Format → Tool resolution") satisfies plan mode's end-of-turn requirement. If no variant is callable, the skill is BLOCKED — stop and report `BLOCKED — AskUserQuestion unavailable` per the AskUserQuestion Format rule. At a STOP point, stop immediately. Do not continue the workflow or call ExitPlanMode there. Commands marked "PLAN MODE EXCEPTION — ALWAYS RUN" execute. Call ExitPlanMode only after the skill workflow completes, or if the user tells you to cancel the skill or leave plan mode.

If `PROACTIVE` is `"false"`, do not auto-invoke or proactively suggest skills. If a skill seems useful, ask: "I think /skillname might help here — want me to run it?"

If `SKILL_PREFIX` is `"true"`, suggest/invoke `/gstack-*` names. Disk paths stay `$GSTACK_ROOT/[skill-name]/SKILL.md`.

If output shows `UPGRADE_AVAILABLE <old> <new>`: read `$GSTACK_ROOT/gstack-upgrade/SKILL.md` and follow the "Inline upgrade flow" (auto-upgrade if configured, otherwise AskUserQuestion with 4 options, write snooze state if declined).

If output shows `JUST_UPGRADED <from> <to>`: print "Running gstack v{to} (just updated!)". If `SPAWNED_SESSION` is true, skip feature discovery.

Feature discovery, max one prompt per session:
- Missing `$GSTACK_ROOT/.feature-prompted-continuous-checkpoint`: AskUserQuestion for Continuous checkpoint auto-commits. If accepted, run `$GSTACK_BIN/gstack-config set checkpoint_mode continuous`. Always touch marker.
- Missing `$GSTACK_ROOT/.feature-prompted-model-overlay`: inform "Model overlays are active. MODEL_OVERLAY shows the patch." Always touch marker.

After upgrade prompts, continue workflow.

If `WRITING_STYLE_PENDING` is `yes`: ask once about writing style:

> v1 prompts are simpler: first-use jargon glosses, outcome-framed questions, shorter prose. Keep default or restore terse?

Options:
- A) Keep the new default (recommended — good writing helps everyone)
- B) Restore V0 prose — set `explain_level: terse`

If A: leave `explain_level` unset (defaults to `default`).
If B: run `$GSTACK_BIN/gstack-config set explain_level terse`.

Always run (regardless of choice):
```bash
rm -f ~/.gstack/.writing-style-prompt-pending
touch ~/.gstack/.writing-style-prompted
```

Skip if `WRITING_STYLE_PENDING` is `no`.

If `LAKE_INTRO` is `no`: say "gstack follows the **Boil the Lake** principle — do the complete thing when AI makes marginal cost near-zero. Read more: https://garryslist.org/posts/boil-the-ocean" Offer to open:

```bash
open https://garryslist.org/posts/boil-the-ocean
touch ~/.gstack/.completeness-intro-seen
```

Only run `open` if yes. Always run `touch`.

If `TEL_PROMPTED` is `no` AND `LAKE_INTRO` is `yes`: ask telemetry once via AskUserQuestion:

> Help gstack get better. Share usage data only: skill, duration, crashes, stable device ID. No code, file paths, or repo names.

Options:
- A) Help gstack get better! (recommended)
- B) No thanks

If A: run `$GSTACK_BIN/gstack-config set telemetry community`

If B: ask follow-up:

> Anonymous mode sends only aggregate usage, no unique ID.

Options:
- A) Sure, anonymous is fine
- B) No thanks, fully off

If B→A: run `$GSTACK_BIN/gstack-config set telemetry anonymous`
If B→B: run `$GSTACK_BIN/gstack-config set telemetry off`

Always run:
```bash
touch ~/.gstack/.telemetry-prompted
```

Skip if `TEL_PROMPTED` is `yes`.

If `PROACTIVE_PROMPTED` is `no` AND `TEL_PROMPTED` is `yes`: ask once:

> Let gstack proactively suggest skills, like /qa for "does this work?" or /investigate for bugs?

Options:
- A) Keep it on (recommended)
- B) Turn it off — I'll type /commands myself

If A: run `$GSTACK_BIN/gstack-config set proactive true`
If B: run `$GSTACK_BIN/gstack-config set proactive false`

Always run:
```bash
touch ~/.gstack/.proactive-prompted
```

Skip if `PROACTIVE_PROMPTED` is `yes`.

If `HAS_ROUTING` is `no` AND `ROUTING_DECLINED` is `false` AND `PROACTIVE_PROMPTED` is `yes`:
Check if a CLAUDE.md file exists in the project root. If it does not exist, create it.

Use AskUserQuestion:

> gstack works best when your project's CLAUDE.md includes skill routing rules.

Options:
- A) Add routing rules to CLAUDE.md (recommended)
- B) No thanks, I'll invoke skills manually

If A: Append this section to the end of CLAUDE.md:

```markdown

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only

 succeeded in 0ms:
---
name: context-mode
description: |
  Use context-mode tools (ctx_execute, ctx_execute_file) instead of Bash/cat when processing
  large outputs. Triggers: "analyze logs", "summarize output", "process data",
  "parse JSON", "filter results", "extract errors", "check build output",
  "analyze dependencies", "process API response", "large file analysis",
  "page snapshot", "browser snapshot", "DOM structure", "inspect page",
  "accessibility tree", "Playwright snapshot",
  "run tests", "test output", "coverage report", "git log", "recent commits",
  "diff between branches", "list containers", "pod status", "disk usage",
  "fetch docs", "API reference", "index documentation",
  "call API", "check response", "query results",
  "find TODOs", "count lines", "codebase statistics", "security audit",
  "outdated packages", "dependency tree", "cloud resources", "CI/CD output".
  Also triggers on ANY MCP tool output that may exceed 20 lines.
  Subagent routing is handled automatically via PreToolUse hook.
---

# Context Mode: Default for All Large Output

## MANDATORY RULE

<context_mode_logic>
  <mandatory_rule>
    Default to context-mode for ALL commands. Only use Bash for guaranteed-small-output operations.
  </mandatory_rule>
</context_mode_logic>

Bash whitelist (safe to run directly):
- **File mutations**: `mkdir`, `mv`, `cp`, `rm`, `touch`, `chmod`
- **Git writes**: `git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`
- **Navigation**: `cd`, `pwd`, `which`
- **Process control**: `kill`, `pkill`
- **Package management**: `npm install`, `npm publish`, `pip install`
- **Simple output**: `echo`, `printf`

**Everything else → `ctx_execute` or `ctx_execute_file`.** Any command that reads, queries, fetches, lists, logs, tests, builds, diffs, inspects, or calls an external service. This includes ALL CLIs (gh, aws, kubectl, docker, terraform, wrangler, fly, heroku, gcloud, etc.) — there are thousands and we cannot list them all.

**When uncertain, use context-mode.** Every KB of unnecessary context reduces the quality and speed of the entire session.

## Decision Tree

```
About to run a command / read a file / call an API?
│
├── Command is on the Bash whitelist (file mutations, git writes, navigation, echo)?
│   └── Use Bash
│
├── Output MIGHT be large or you're UNSURE?
│   └── Use context-mode ctx_execute or ctx_execute_file
│
├── Fetching web documentation or HTML page?
│   └── Use ctx_fetch_and_index → ctx_search
│
├── Using Playwright (navigate, snapshot, console, network)?
│   └── ALWAYS use filename parameter to save to file, then:
│       browser_snapshot(filename) → ctx_index(path) or ctx_execute_file(path)
│       browser_console_messages(filename) → ctx_execute_file(path)
│       browser_network_requests(filename) → ctx_execute_file(path)
│       ⚠ browser_navigate returns a snapshot automatically — ignore it,
│         use browser_snapshot(filename) for any inspection.
│       ⚠ Playwright MCP uses a SINGLE browser instance — NOT parallel-safe.
│         For parallel browser ops, use agent-browser via execute instead.
│
├── Using agent-browser (parallel-safe browser automation)?
│   └── Run via execute (shell) — each call gets its own subprocess:
│       execute("agent-browser open example.com && agent-browser snapshot -i -c")
│       ✓ Supports sessions for isolated browser instances
│       ✓ Safe for parallel subagent execution
│       ✓ Lightweight accessibility tree with ref-based interaction
│
├── Processing output from another MCP tool (Context7, GitHub API, etc.)?
│   ├── Output already in context from a previous tool call?
│   │   └── Use it directly. Do NOT re-index with ctx_index(content: ...).
│   ├── Need to search the output multiple times?
│   │   └── Save to file via ctx_execute, then ctx_index(path) → ctx_search
│   └── One-shot extraction?
│       └── Save to file via ctx_execute, then ctx_execute_file(path)
│
└── Reading a file to analyze/summarize (not edit)?
    └── Use ctx_execute_file (file loads into FILE_CONTENT, not context)
```

## When to Use Each Tool

| Situation | Tool | Example |
|-----------|------|---------|
| Hit an API endpoint | `ctx_execute` | `fetch('http://localhost:3000/api/orders')` |
| Run CLI that returns data | `ctx_execute` | `gh pr list`, `aws s3 ls`, `kubectl get pods` |
| Run tests | `ctx_execute` | `npm test`, `pytest`, `go test ./...` |
| Git operations | `ctx_execute` | `git log --oneline -50`, `git diff HEAD~5` |
| Docker/K8s inspection | `ctx_execute` | `docker stats --no-stream`, `kubectl describe pod` |
| Read a log file | `ctx_execute_file` | Parse access.log, error.log, build output |
| Read a data file | `ctx_execute_file` | Analyze CSV, JSON, YAML, XML |
| Read source code to analyze | `ctx_execute_file` | Count functions, find patterns, extract metrics |
| Fetch web docs | `ctx_fetch_and_index` | Index React/Next.js/Zod docs, then search |
| Playwright snapshot | `browser_snapshot(filename)` → `ctx_index(path)` → `ctx_search` | Save to file, index server-side, query |
| Playwright snapshot (one-shot) | `browser_snapshot(filename)` → `ctx_execute_file(path)` | Save to file, extract in sandbox |
| Playwright console/network | `browser_*(filename)` → `ctx_execute_file(path)` | Save to file, analyze in sandbox |
| MCP output (already in context) | Use directly | Don't re-index — it's already loaded |
| MCP output (need multi-query) | `ctx_execute` to save → `ctx_index(path)` → `ctx_search` | Save to file first, index server-side |
| Wipe indexed KB content | `ctx_purge(confirm: true)` | Permanently deletes all indexed content |

## Automatic Triggers

Use context-mode for ANY of these, without being asked:

- **API debugging**: "hit this endpoint", "call the API", "check the response", "find the bug in the response"
- **Log analysis**: "check the logs", "what errors", "read access.log", "debug the 500s"
- **Test runs**: "run the tests", "check if tests pass", "test suite output"
- **Git history**: "show recent commits", "git log", "what changed", "diff between branches"
- **Data inspection**: "look at the CSV", "parse the JSON", "analyze the config"
- **Infrastructure**: "list containers", "check pods", "S3 buckets", "show running services"
- **Dependency audit**: "check dependencies", "outdated packages", "security audit"
- **Build output**: "build the project", "check for warnings", "compile errors"
- **Code metrics**: "count lines", "find TODOs", "function count", "analyze codebase"
- **Web docs lookup**: "look up the docs", "check the API reference", "find examples"

## Language Selection

| Situation | Language | Why |
|-----------|----------|-----|
| HTTP/API calls, JSON | `javascript` | Native fetch, JSON.parse, async/await |
| Data analysis, CSV, stats | `python` | csv, statistics, collections, re |
| Shell commands with pipes | `shell` | grep, awk, jq, native tools |
| File pattern matching | `shell` | find, wc, sort, uniq |

## Search Query Strategy

- BM25 uses **OR semantics** — results matching more terms rank higher automatically
- Use 2-4 specific technical terms per query
- **Always use `source` parameter** when multiple docs are indexed to avoid cross-source contamination
  - Partial match works: `source: "Node"` matches `"Node.js v22 CHANGELOG"`
- **Always use `queries` array** — batch ALL search questions in ONE call:
  - `ctx_search(queries: ["transform pipe", "refine superRefine", "coerce codec"], source: "Zod")`
  - NEVER make multiple separate ctx_search() calls — put all queries in one array

## External Documentation

- **Always use `ctx_fetch_and_index`** for external docs — NEVER `cat` or `ctx_execute` with local paths for packages you don't own
- For GitHub-hosted projects, use the raw URL: `https://raw.githubusercontent.com/org/repo/main/CHANGELOG.md`
- After indexing, use the `source` parameter in search to scope results to that specific document

## Critical Rules

1. **Always console.log/print your findings.** stdout is all that enters context. No output = wasted call.
2. **Write analysis code, not just data dumps.** Don't `console.log(JSON.stringify(data))` — analyze first, print findings.
3. **Be specific in output.** Print bug details with IDs, line numbers, exact values — not just counts.
4. **For files you need to EDIT**: Use the normal Read tool. context-mode is for analysis, not editing.
5. **For Bash whitelist commands only**: Use Bash for file mutations, git writes, navigation, process control, package install, and echo. Everything else goes through context-mode.
6. **Never use `ctx_index(content: large_data)`.** Use `ctx_index(path: ...)` to read files server-side. The `content` parameter sends data through context as a tool parameter — use it only for small inline text.
7. **Always use `filename` parameter** on Playwright tools (`browser_snapshot`, `browser_console_messages`, `browser_network_requests`). Without it, the full output enters context.
8. **Don't re-index data already in context.** If an MCP tool returned data in a previous response, it's already loaded — use it directly or save to file first.

## Sandboxed Data Workflow

<sandboxed_data_workflow>
  <critical_rule>
    When using tools that support saving to a file: ALWAYS use the 'filename' parameter.
    NEVER return large raw datasets directly to context.
  </critical_rule>
  <workflow>
    LargeDataTool(filename: "path") → mcp__context-mode__ctx_index(path: "path") → ctx_search()
  </workflow>
</sandboxed_data_workflow>

This is the universal pattern for context preservation regardless of
the source tool (Playwright, GitHub API, AWS CLI, etc.).

## Examples

### Debug an API endpoint
```javascript
const resp = await fetch('http://localhost:3000/api/orders');
const { orders } = await resp.json();

const bugs = [];
const negQty = orders.filter(o => o.quantity < 0);
if (negQty.length) bugs.push(`Negative qty: ${negQty.map(o => o.id).join(', ')}`);

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
I’m using the repo’s review guidance and context-mode constraints. The callable context-mode MCP tools are not exposed directly in this session, so I’ll keep shell output bounded and use small targeted scripts instead of dumping diffs.
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
There’s prior context for the plan review, so I’m not starting from zero. Next I’m indexing the implementation shape: changed files, key plan requirements, and targeted source slices where runtime regressions are most likely.
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (failed)
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
I have the cycle-2 plan findings now. The next pass is implementation-focused: I’m checking whether the reinforced plan actually landed in code, especially token opacity, auth route behavior, rich-content serialization, and API/error edge cases.
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (failed)
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_batch_execute started
mcp: context-mode/ctx_batch_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
The first concrete bug is already visible: at least one Tailwind color key is still a raw hex while the preset advertises opacity composition. I’m also checking route and lint deltas because those tend to reveal small but merge-blocking misses in this kind of prologue branch.
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_search started
mcp: context-mode/ctx_search (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
mcp: context-mode/ctx_execute started
mcp: context-mode/ctx_execute (completed)
hook: PostToolUse
hook: PostToolUse Completed
codex
# Implementation Review — Slice 3 #18 FE Prologue (codex cycle 1)

## Severity summary
- P0: 0 · P1: 3 · P2: 3 · P3: 1

## Findings

### P1-1 — Pack 17 semantic colors do not round-trip through Tailwind, and `/15` opacity is still broken
**File:line:** `packages/ui/tailwind.preset.ts:20`, `packages/ui/tailwind.preset.ts:22`, `packages/ui/tailwind.preset.ts:23`, `packages/ui/tailwind.preset.ts:82`  
**Issue:** `surface-sidebar`, `surface-row-hover`, and `surface-row-selected` are mapped to other raw color vars instead of their own Pack 17 semantic tokens, while `severity-high` is still a raw `#f08a4a`. That means `bg-surface-sidebar` renders `#f3f7fe`, not prototype `#eef4fb`, and `bg-severity-high/15` cannot compose alpha via `rgb(var(...) / <alpha-value>)`.  
**Why it matters:** This breaks the exact bug the reinforced plan was supposed to prevent: VOC severity/status translucency and list hover/selected colors will be visually wrong in #20.  
**Suggested fix:** Convert every color-valued semantic token to RGB triples in `tokens.css`, then map Tailwind keys to their own vars, e.g. `severity-high: 'rgb(var(--severity-high) / <alpha-value>)'`.

### P1-2 — Token-fidelity test encodes color tokens as `raw`, so it greenlights the broken runtime format
**File:line:** `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:49`, `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:53`, `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:55`, `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:94`, `packages/ui/src/styles/__tests__/token-fidelity.test.ts:61`  
**Issue:** The fixture marks real prototype hex colors like `--surface-sidebar`, `--surface-row-hover`, `--surface-row-selected`, `--text-on-accent`, and `--severity-high` as `raw`, so the test only asserts raw hex preservation instead of RGB runtime conversion.  
**Why it matters:** The test claims “runtime tokens.css format = R G B” but explicitly exempts the exact tokens that need opacity and color fidelity.  
**Suggested fix:** Treat all `#RRGGBB` prototype values as `{ hex, rgb }`, except genuinely non-color values. Add an assertion that no color-valued runtime token remains `#...`.

### P1-3 — Command-less Combobox is mouse-only and incomplete ARIA
**File:line:** `packages/ui/src/components/shadcn/combobox.tsx:57`, `packages/ui/src/components/shadcn/combobox.tsx:84`, `packages/ui/src/components/shadcn/combobox.tsx:93`, `packages/ui/src/components/shadcn/combobox.tsx:102`  
**Issue:** The trigger has `role="combobox"` but no `aria-controls`; the listbox/options are non-focusable `<ul>/<li>` nodes; option selection is click-only with no keyboard handler or active descendant model.  
**Why it matters:** OwnerPicker / AnalyticsAreaPicker users cannot reliably operate this with keyboard or screen reader. This is not a complete shadcn-style combobox baseline.  
**Suggested fix:** Either use a proven cmdk/Radix command pattern, or implement `aria-controls`, `aria-activedescendant`, roving/active option state, Enter/Escape/Arrow key handling, and focusable options.

### P2-1 — `useIdempotencyKey` returns a stale key for the render where `If-Match` changes
**File:line:** `apps/frontend/src/lib/api/useIdempotencyKey.ts:27`  
**Issue:** On etag change, the hook queues `setKey(next)` in a microtask but still returns the previous `key` from the current render.  
**Why it matters:** A mutation triggered by an effect or immediately after prop/state reconciliation can send the new `If-Match` with the old `Idempotency-Key`, recreating the stale-write/idempotency reuse failure this hook was meant to prevent.  
**Suggested fix:** Store `{ etag, key }` together and derive the returned key synchronously when `ifMatchEtag` changes, or use a ref-backed current key that updates before returning.

### P2-2 — apiClient adds `Idempotency-Key` to PUT, outside the locked contract
**File:line:** `apps/frontend/src/lib/api/client.ts:19`  
**Issue:** `MUTATION_METHODS` includes `PUT`, but the plan and API client contract only locked auto-minting for `POST/PATCH/DELETE`.  
**Why it matters:** If a future PUT endpoint does not participate in the idempotency hash contract, this silently sends an unexpected header and can create backend/client contract drift.  
**Suggested fix:** Remove `PUT` until an API contract explicitly requires idempotency for PUT.

### P2-3 — RichEditor demo still cannot validate sanitizer-error-to-toast UX
**File:line:** `apps/frontend/src/routes/dev-rich-editor.tsx:61`, `apps/frontend/src/routes/dev-rich-editor.tsx:67`  
**Issue:** The demo is only local editor state plus renderer. It does not call `apiClient`, does not map `rich_content.disallowed_node`, and does not show the sonner error path.  
**Why it matters:** Cycle-2 P2-C asked for the end-to-end sanitizer rejection UX to be validated after C3. The code still leaves that interaction untested.  
**Suggested fix:** Add a dev-only action that feeds a representative `rich_content.disallowed_node` envelope through `errorMapper` and `toast`.

### P3-1 — Lint debt is not only pre-existing
**File:line:** `packages/ui/src/components/shadcn/combobox.tsx:59`, `packages/ui/src/rich-content/RichContentRenderer.tsx:55`, `apps/frontend/src/lib/layout/AppRail.tsx:1`  
**Issue:** My delta check against `develop` reports current `637 errors / 4 warnings` vs develop `534 errors / 4 warnings`, with 105 unique added diagnostics. Many are format/import order, but there are real new ones: combobox a11y, `dangerouslySetInnerHTML`, unused imports, non-null assertions.  
**Why it matters:** The branch narrative says lint is pre-existing; it is not. This will normalize avoidable review noise before #19/#20.  
**Suggested fix:** Run Biome on the changed files and fix at least non-format diagnostics; then decide whether to format the branch or defer formatting explicitly.

## Cycle-2 PLAN finding verification

- P0-A: IMPLEMENTED — ADR-0021 says it amends ADR-0020 (`docs/adr/0021-pack-17-samsung-light-design-system.md:5`); ADR-0020 now references ADR-0021 (`docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md:65`).
- P0-B: IMPLEMENTED — Alert/HoverCard/Sheet/Combobox are present and exported (`packages/ui/src/index.ts:26`, `:28`, `:30`, `:36`).
- P1-A: IMPLEMENTED — `@fops/ui` test script is Vitest (`packages/ui/package.json:17`), jsdom config exists (`packages/ui/vitest.config.ts:7`).
- P1-B: IMPLEMENTED — old invalid classes are gone; token coverage test scans semantic prefixes (`apps/frontend/src/__tests__/token-class-coverage.test.ts:31`).
- P1-C: IMPLEMENTED — `_authed.beforeLoad` calls `fetchMe` and redirects unauthenticated users (`apps/frontend/src/routes/_authed.tsx:28`).
- P1-D: IMPLEMENTED — `asChild + loading` throws in dev and warns/degrades in prod (`packages/ui/src/components/Button.tsx:70`).
- P1-E: IMPLEMENTED — tests assert valid tones, Slice 3 non-fallback copy, and stale-write action (`apps/frontend/src/lib/api/__tests__/errorMapper.test.ts:5`, `:42`, `:53`).
- P2-A: PARTIAL — closed-world names exist, but fixture misclassifies several color tokens as raw (`packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:53`).
- P2-B: IMPLEMENTED — window-guarded localStorage initializer (`apps/frontend/src/lib/layout/AppSidebar.tsx:23`).
- P2-C: PARTIAL — Toaster/errorMapper exist, but no editor sanitizer error toast flow (`apps/frontend/src/routes/dev-rich-editor.tsx:61`).
- P2-D: IMPLEMENTED — shells forward detail panels through `useDetailPanelSlot` (`packages/ui/src/layout/useDetailPanelSlot.ts:19`).
- P3-A: IMPLEMENTED — lucide pinned in package deps (`packages/ui/package.json:44`).
- P3-B: IMPLEMENTED — TipTap deps live in `@fops/ui` (`packages/ui/package.json:34`).
- P3-C: NOT IMPLEMENTED — I did not find checkpoint screenshot/baseline artifacts for this implementation branch.

## Quality call
Mergeable after fixes, not now. The architecture direction is mostly correct, but the Pack 17 token/Tailwind bug is exactly in the prologue’s critical path, and the combobox is not a usable primitive yet. Fix those before letting #19/#20 build on this.

## What I did NOT review
- I did not rerun the full test/build matrix; I relied on the supplied pass counts.
- I did not do visual browser QA across desktop/tablet/mobile.
- I did not fully audit every shadcn primitive against upstream shadcn line-by-line.
- I did not independently remeasure bundle size or code-splitting impact.
hook: Stop
hook: Stop Completed
tokens used
146,160
# Implementation Review — Slice 3 #18 FE Prologue (codex cycle 1)

## Severity summary
- P0: 0 · P1: 3 · P2: 3 · P3: 1

## Findings

### P1-1 — Pack 17 semantic colors do not round-trip through Tailwind, and `/15` opacity is still broken
**File:line:** `packages/ui/tailwind.preset.ts:20`, `packages/ui/tailwind.preset.ts:22`, `packages/ui/tailwind.preset.ts:23`, `packages/ui/tailwind.preset.ts:82`  
**Issue:** `surface-sidebar`, `surface-row-hover`, and `surface-row-selected` are mapped to other raw color vars instead of their own Pack 17 semantic tokens, while `severity-high` is still a raw `#f08a4a`. That means `bg-surface-sidebar` renders `#f3f7fe`, not prototype `#eef4fb`, and `bg-severity-high/15` cannot compose alpha via `rgb(var(...) / <alpha-value>)`.  
**Why it matters:** This breaks the exact bug the reinforced plan was supposed to prevent: VOC severity/status translucency and list hover/selected colors will be visually wrong in #20.  
**Suggested fix:** Convert every color-valued semantic token to RGB triples in `tokens.css`, then map Tailwind keys to their own vars, e.g. `severity-high: 'rgb(var(--severity-high) / <alpha-value>)'`.

### P1-2 — Token-fidelity test encodes color tokens as `raw`, so it greenlights the broken runtime format
**File:line:** `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:49`, `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:53`, `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:55`, `packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:94`, `packages/ui/src/styles/__tests__/token-fidelity.test.ts:61`  
**Issue:** The fixture marks real prototype hex colors like `--surface-sidebar`, `--surface-row-hover`, `--surface-row-selected`, `--text-on-accent`, and `--severity-high` as `raw`, so the test only asserts raw hex preservation instead of RGB runtime conversion.  
**Why it matters:** The test claims “runtime tokens.css format = R G B” but explicitly exempts the exact tokens that need opacity and color fidelity.  
**Suggested fix:** Treat all `#RRGGBB` prototype values as `{ hex, rgb }`, except genuinely non-color values. Add an assertion that no color-valued runtime token remains `#...`.

### P1-3 — Command-less Combobox is mouse-only and incomplete ARIA
**File:line:** `packages/ui/src/components/shadcn/combobox.tsx:57`, `packages/ui/src/components/shadcn/combobox.tsx:84`, `packages/ui/src/components/shadcn/combobox.tsx:93`, `packages/ui/src/components/shadcn/combobox.tsx:102`  
**Issue:** The trigger has `role="combobox"` but no `aria-controls`; the listbox/options are non-focusable `<ul>/<li>` nodes; option selection is click-only with no keyboard handler or active descendant model.  
**Why it matters:** OwnerPicker / AnalyticsAreaPicker users cannot reliably operate this with keyboard or screen reader. This is not a complete shadcn-style combobox baseline.  
**Suggested fix:** Either use a proven cmdk/Radix command pattern, or implement `aria-controls`, `aria-activedescendant`, roving/active option state, Enter/Escape/Arrow key handling, and focusable options.

### P2-1 — `useIdempotencyKey` returns a stale key for the render where `If-Match` changes
**File:line:** `apps/frontend/src/lib/api/useIdempotencyKey.ts:27`  
**Issue:** On etag change, the hook queues `setKey(next)` in a microtask but still returns the previous `key` from the current render.  
**Why it matters:** A mutation triggered by an effect or immediately after prop/state reconciliation can send the new `If-Match` with the old `Idempotency-Key`, recreating the stale-write/idempotency reuse failure this hook was meant to prevent.  
**Suggested fix:** Store `{ etag, key }` together and derive the returned key synchronously when `ifMatchEtag` changes, or use a ref-backed current key that updates before returning.

### P2-2 — apiClient adds `Idempotency-Key` to PUT, outside the locked contract
**File:line:** `apps/frontend/src/lib/api/client.ts:19`  
**Issue:** `MUTATION_METHODS` includes `PUT`, but the plan and API client contract only locked auto-minting for `POST/PATCH/DELETE`.  
**Why it matters:** If a future PUT endpoint does not participate in the idempotency hash contract, this silently sends an unexpected header and can create backend/client contract drift.  
**Suggested fix:** Remove `PUT` until an API contract explicitly requires idempotency for PUT.

### P2-3 — RichEditor demo still cannot validate sanitizer-error-to-toast UX
**File:line:** `apps/frontend/src/routes/dev-rich-editor.tsx:61`, `apps/frontend/src/routes/dev-rich-editor.tsx:67`  
**Issue:** The demo is only local editor state plus renderer. It does not call `apiClient`, does not map `rich_content.disallowed_node`, and does not show the sonner error path.  
**Why it matters:** Cycle-2 P2-C asked for the end-to-end sanitizer rejection UX to be validated after C3. The code still leaves that interaction untested.  
**Suggested fix:** Add a dev-only action that feeds a representative `rich_content.disallowed_node` envelope through `errorMapper` and `toast`.

### P3-1 — Lint debt is not only pre-existing
**File:line:** `packages/ui/src/components/shadcn/combobox.tsx:59`, `packages/ui/src/rich-content/RichContentRenderer.tsx:55`, `apps/frontend/src/lib/layout/AppRail.tsx:1`  
**Issue:** My delta check against `develop` reports current `637 errors / 4 warnings` vs develop `534 errors / 4 warnings`, with 105 unique added diagnostics. Many are format/import order, but there are real new ones: combobox a11y, `dangerouslySetInnerHTML`, unused imports, non-null assertions.  
**Why it matters:** The branch narrative says lint is pre-existing; it is not. This will normalize avoidable review noise before #19/#20.  
**Suggested fix:** Run Biome on the changed files and fix at least non-format diagnostics; then decide whether to format the branch or defer formatting explicitly.

## Cycle-2 PLAN finding verification

- P0-A: IMPLEMENTED — ADR-0021 says it amends ADR-0020 (`docs/adr/0021-pack-17-samsung-light-design-system.md:5`); ADR-0020 now references ADR-0021 (`docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md:65`).
- P0-B: IMPLEMENTED — Alert/HoverCard/Sheet/Combobox are present and exported (`packages/ui/src/index.ts:26`, `:28`, `:30`, `:36`).
- P1-A: IMPLEMENTED — `@fops/ui` test script is Vitest (`packages/ui/package.json:17`), jsdom config exists (`packages/ui/vitest.config.ts:7`).
- P1-B: IMPLEMENTED — old invalid classes are gone; token coverage test scans semantic prefixes (`apps/frontend/src/__tests__/token-class-coverage.test.ts:31`).
- P1-C: IMPLEMENTED — `_authed.beforeLoad` calls `fetchMe` and redirects unauthenticated users (`apps/frontend/src/routes/_authed.tsx:28`).
- P1-D: IMPLEMENTED — `asChild + loading` throws in dev and warns/degrades in prod (`packages/ui/src/components/Button.tsx:70`).
- P1-E: IMPLEMENTED — tests assert valid tones, Slice 3 non-fallback copy, and stale-write action (`apps/frontend/src/lib/api/__tests__/errorMapper.test.ts:5`, `:42`, `:53`).
- P2-A: PARTIAL — closed-world names exist, but fixture misclassifies several color tokens as raw (`packages/ui/src/styles/__tests__/token-fidelity.fixture.ts:53`).
- P2-B: IMPLEMENTED — window-guarded localStorage initializer (`apps/frontend/src/lib/layout/AppSidebar.tsx:23`).
- P2-C: PARTIAL — Toaster/errorMapper exist, but no editor sanitizer error toast flow (`apps/frontend/src/routes/dev-rich-editor.tsx:61`).
- P2-D: IMPLEMENTED — shells forward detail panels through `useDetailPanelSlot` (`packages/ui/src/layout/useDetailPanelSlot.ts:19`).
- P3-A: IMPLEMENTED — lucide pinned in package deps (`packages/ui/package.json:44`).
- P3-B: IMPLEMENTED — TipTap deps live in `@fops/ui` (`packages/ui/package.json:34`).
- P3-C: NOT IMPLEMENTED — I did not find checkpoint screenshot/baseline artifacts for this implementation branch.

## Quality call
Mergeable after fixes, not now. The architecture direction is mostly correct, but the Pack 17 token/Tailwind bug is exactly in the prologue’s critical path, and the combobox is not a usable primitive yet. Fix those before letting #19/#20 build on this.

## What I did NOT review
- I did not rerun the full test/build matrix; I relied on the supplied pass counts.
- I did not do visual browser QA across desktop/tablet/mobile.
- I did not fully audit every shadcn primitive against upstream shadcn line-by-line.
- I did not independently remeasure bundle size or code-splitting impact.
