# FeedbackOps Reporting Pack

## Purpose

This folder contains reusable HTML reporting materials for FeedbackOps project updates.

Use these files when reporting project status, UX direction, implementation progress, risks, and next actions.

## Files

```text
report-template.html
- Fixed HTML report format.
- Replace values in {{placeholder}} slots.
- Keep the section order stable unless the reporting purpose changes.

current-project-report.html
- Filled project report based on the current documentation state.
- Use as the first example of the report format.

wireframes.html
- Static low-fidelity wireframes for the MVP operating surfaces.
- Focuses on Dashboard, VOC Inbox, detail panel, Finding, Task Request, and Survey Result flows.
```

## Reporting Rule

Future reports to the user should use the same HTML shape:

```text
1. Header
2. Executive Summary
3. Current State
4. Work Completed
5. Decisions / Assumptions
6. Risks / Blockers
7. Next Actions
8. Evidence
```

For short updates, keep all sections but use concise values. This keeps reports easy to compare over time.

## Navigation Assumption

Internal product screens should be described with two left-side navigation layers:

```text
Global System Rail
- Dashboard
- VOC
- Finding
- Tasks
- Survey
- Permission / Admin

Selected System Sidebar
- Workspace selector
- Workspace-level shortcuts
- Managed System list or managed-system-scoped area
- System-owned menus
- Views and Settings
```

Do not collapse each bounded system into one sidebar item when preparing wireframes or reports.
