# Codex Cloud Setup

Use this guide to work on `hjung3113/FeedbackOps` from a phone through Codex Cloud.

## Connect the repository

1. Open `https://chatgpt.com/codex`.
2. Sign in with the ChatGPT account that has Codex access.
3. Select `Connect GitHub`.
4. Authorize the GitHub connector.
5. Grant access to `hjung3113/FeedbackOps`.

If the repository does not appear immediately, confirm the GitHub connector has access to the repo.

## Create the Codex Cloud environment

Create an environment for:

- Repository: `hjung3113/FeedbackOps`
- Branch: `main`
- Setup command:

```bash
bash scripts/codex-cloud-setup.sh
```

FeedbackOps is a pnpm + Turborepo monorepo: `apps/backend` (Fastify + drizzle), `apps/frontend` (React + TanStack Router), and shared packages under `packages/` (`@fops/shared`, `@fops/ui`). `pnpm-lock.yaml` is committed, so the setup command installs from the lockfile. Backend integration tests need a Postgres instance and will not run in a bare cloud environment — prefer typecheck and unit tests there.

## Suggested task prompt from mobile

Use `Ask` for read-only questions:

```text
Read AGENTS.md, docs/README.md, and the docs relevant to the requested area. Summarize the current FeedbackOps architecture and next safe action. Do not edit files.
```

Use `Code` for focused repo changes:

```text
Update the FeedbackOps implementation docs for the requested workflow. Follow AGENTS.md and nested AGENTS.md files. Keep the change limited to the relevant docs and run bash scripts/codex-cloud-setup.sh.
```

For future app implementation work, ask Codex to identify the required docs, target ownership boundary, expected tests, and verification commands before editing source code.

## GitHub PR review

After Codex Cloud and code review are enabled for the repo, request a review in a PR comment:

```text
@codex review
```

For a focused review:

```text
@codex review for FeedbackOps product invariant and module boundary violations
```

Codex should follow the review guidance in `AGENTS.md` and any nested guide that applies to the changed paths.

## Verification commands

Run these after setup, docs, or harness changes:

```bash
bash scripts/codex-cloud-setup.sh
rg -n "Survey Response never creates VOC|Task Done never automatically resolves|entity_links|Visibility is enforced" AGENTS.md docs
rg -n "Codex Cloud|hjung3113/FeedbackOps|codex-cloud-setup" AGENTS.md docs scripts
```
