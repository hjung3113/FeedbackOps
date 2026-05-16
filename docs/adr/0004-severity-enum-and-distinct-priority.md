# Severity enum is locked and distinct from Priority

VOC **Severity** is `low | medium | high | critical` (defined canonically in `docs/design/15-data-contracts.md`) and is **not** the same concept as **Priority**. Severity describes how serious a problem is — assigned during VOC triage as objective operational impact. Priority is an execution-order signal carried by Finding and Task during planning, decided after triage, and never exposed to Reporters.

We pick four severity bands rather than P0/P1/P2/P3 because the audience filing VOC is non-engineering as often as engineering; `critical/high/medium/low` reads consistently across triage UI, reporter-facing dashboards (severity is **not** reporter-visible but invariant text mentions it), and follow-up rules like "High Severity VOC eligible for follow-up". P-number bands would force a separate explanation layer for non-engineering Reporters and Developers.

We keep Severity and Priority as separate fields, on separate entities (VOC vs Finding/Task), with separate vocabularies because they answer different questions: "how bad is this?" vs "what should we do next?". Collapsing them would lose triage-vs-planning provenance, blur Reporter Summary visibility rules (Severity is internal-only; backlog Priority is also internal-only but for different reasons), and force the automatic priority scoring described in `docs/design/05-finding-insight-system.md` to overwrite triage data.

Reopening this means either adding a severity band (audit + UI ripple), or merging Severity into Priority (which would require revisiting Reporter Summary visibility, Finding priority scoring, and every "High Severity VOC" invariant) — both warrant a new ADR rather than a silent change.
