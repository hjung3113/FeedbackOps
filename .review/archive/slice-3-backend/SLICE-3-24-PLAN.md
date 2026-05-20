# Slice 3 #24 — Plan

## Goal

Add **`maxDepth`** + **`maxNodes`** caps to the sanitizer so a 1 MB Fastify body of ~50 000-deep nested lists cannot exhaust the V8 stack or burn CPU. Today (post-#23) `visit()` is bounded-recursive with text byte cap only.

P0 blocking #18.

## Threat

```json
{"type":"doc","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"bulletList", ... 50_000 deep ...}]}]}]}
```

- Depth ~10k+ → `RangeError: Maximum call stack size exceeded` → request crashes → 500.
- Width 5k+ peer nodes within depth → CPU walk on hot path.

## Decision: depth param + node counter (not iterative rewrite)

Issue body permits either. Choosing **depth param**:

- Single +2 closure-scope counters; trivial diff vs full iterative rewrite.
- Iterative DFS-post-order is harder (need explicit child-result accumulation per stack frame) and the canonical-rebuild logic from #23 lives inside the visit closure.
- Hard cap at 32 / 5 000 is well below any safe V8 limit; iterative gains nothing in practice.
- F-RICH-LEAF-NODES (#45) and other follow-ups can revisit if profile demands.

## Caps (rev 2 post codex plan review)

| Surface | maxDepth | maxNodes | maxMarks |
|---|---|---|---|
| all | 32 | 5 000 | 1 000 |

Single shared defaults. Per-surface override placeholder kept on `SurfaceAllowlist` for future tuning.

- **Depth count.** Root `doc` is depth 0; immediate children depth 1. Cap: deepest node ≤ 32.
- **Node count.** Every visited node (including `doc`, `text`, `paragraph`, leaves) increments once.
- **Mark count.** Every visited mark increments separately. Closes BLOCKER from codex plan review: a single text node with 50 k inline marks would bypass node cap. `1000` total marks per doc is generous for normal use, hard cap for adversarial.

**Counter placement:** Both `maxNodes` and `maxMarks` checks are the **first** operation inside `visit()` / `visitMark()`, before any shape/type/attrs work. Rejection short-circuits any further validation cost.

## Codex plan review — disposition

| Sev | Finding | Disposition |
|---|---|---|
| BLOCKER | maxNodes bypass via large marks arrays | **Accepted.** Add `maxMarks: 1000` + count marks in `visitMark()` first op. |
| MAJOR | Counter must run first | **Accepted.** Counter is first op in both `visit()` and `visitMark()`. |
| MAJOR | Depth-param recursion OK at depth 32 | **Accepted.** Add test: depth 10 000 fast-fails (validation error, not RangeError). |
| MAJOR | 32 depth justify with TipTap fixtures | **Accepted.** Header comment explains: root=0 doc, ~6 list levels + ~25 inline structure = 32 = ~10× typical TipTap output. |
| MAJOR | 5000 nodes loose | **Accept as conservative DoS cap, NOT UX allowance.** Documented in header. Lowering would clip realistic long internal-comments. |
| MINOR | "50KB" hardcoded in text-cap reason | **Accepted.** Use `allow.maxTextBytes` in template literal. |
| MINOR | Optional route smoke | **Skip.** Unit covers; existing integration tests cover the error-mapping pipeline already. |

## Error mapping

Reuse `rich_content.disallowed_node` (ADR-0012 closed enum). `fields_code` defaults to `disallowed_node` for caps — these are structural, not value/key issues. `reason` distinguishes: `"max depth exceeded (cap: 32)"` / `"max node count exceeded (cap: 5000)"`. `path` is the offending node's JSON path so the FE can highlight.

## Files touched

- `apps/backend/src/lib/rich-content/surface-allowlists.ts` — add `maxDepth: number; maxNodes: number` to `SurfaceAllowlist`, populate `32` / `5000` per surface.
- `apps/backend/src/lib/rich-content/sanitize.ts` — depth param on `visit`, nodes counter in outer closure, bail at start of each `visit()` call.
- `apps/backend/src/lib/rich-content/__tests__/sanitize.test.ts` — depth + nodes test cases.

Out of scope:
- Service-layer changes (sanitizer return shape unchanged).
- Integration tests (caps fire pre-DB, identical to other sanitizer 422 paths already covered in integration tests for create/conversation routes).
- ADR amendment.

## Tests (unit only)

Builders:

```ts
function nestedListDoc(depth: number) {
  let node: any = { type: 'paragraph', content: [{ type: 'text', text: 'x' }] };
  for (let i = 0; i < depth; i++) {
    node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
  }
  return { type: 'doc', content: [node] };
}

function wideDoc(width: number) {
  return { type: 'doc', content: Array.from({ length: width }, () => ({ type: 'paragraph', content: [{ type: 'text', text: 'x' }] })) };
}
```

Cases:

- Depth 5 → ok.
- Depth 32 boundary (exactly cap) → ok (root=0, deepest leaf=32 inclusive).
- Depth 33 → 422 with reason matching `/max depth/`, path includes nested location.
- Depth 100 → 422 same.
- Width 100 → ok.
- Width 5000 boundary → ok (counter ≤ cap).
- Width 5001 → 422 with reason matching `/max node/`.
- Depth + width combo just under both caps → ok.
- Depth + width combo where node count fires before depth → assert reason is node, not depth.
- 50 KB text inside depth=10 → still hits existing text-byte cap, not depth/nodes (regression guard).
- **Mark fan-out** (cycle-1 BLOCKER): single text node with `marks: Array(1500).fill({type:'bold'})` → 422 with reason matching `/max mark/`. Single text with 100 marks → ok. Counter is first op in `visitMark()` (proven by 50k-mark fast-fail timing test).
- **Counter-placement regression**: payload depth=2, width=10 with each text node having 200 marks → total marks 2000, exceeds 1000 cap → 422 reason `/max mark/`, NOT `/max node/`.

Depth-32 boundary calculation:
- root doc = depth 0, content = depth 1, …
- The decision: caller-friendly invariant is "no descendant deeper than `maxDepth` *edges* from root." Tests pin the off-by-one.

## Risks

1. **Cap too tight?** Real VOC threads are short prose + short lists. 32 depth and 5 000 nodes leave ~100× headroom for normal use. Reviewable post-#18 if user telemetry shows clip rate >0.1%.
2. **codeBlock content counted as nodes?** Yes — a `codeBlock` with 5001 text-node children would 422. Realistic code blocks are 1 child (the text). No drift.
3. **Performance regression?** O(1) per node; no traversal cost change.

## Chunks

- **C1 (Sonnet):** `surface-allowlists.ts` + `sanitize.ts` + unit tests.
- **C2 (Opus orchestrator):** codex CLI cycle-1 review.
- **C3 (Opus subagent):** cycle-2 deeper review.
- **C4 (Haiku/main):** PR + merge + close + memory + wiki update (amend `/wiki/concepts/rich-content-sanitizer.md` to add caps section).

## Exit criteria

- ~12 new test cases; full backend suite green.
- 2-cycle review clean.
- PR merged, #24 closed.
- Memory `project_slice3_24_pr` + wiki page amended.
