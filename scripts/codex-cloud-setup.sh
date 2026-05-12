#!/usr/bin/env bash
set -euo pipefail

echo "Codex Cloud setup for hjung3113/FeedbackOps"
echo "Repository type: FeedbackOps documentation and architecture scaffold"

required_paths=(
  "AGENTS.md"
  "DESIGN.md"
  "docs/README.md"
  "docs/design/00-product-overview.md"
  "docs/design/01-domain-model.md"
  "docs/design/02-requirements-matrix.md"
  "docs/design/10-cross-system-workflows.md"
  "docs/design/11-entity-linking.md"
  "docs/design/12-ui-ux-principles.md"
  "docs/frontend/README.md"
  "docs/implementation/README.md"
  "apps/backend/AGENTS.md"
  "apps/frontend/AGENTS.md"
  "packages/shared/AGENTS.md"
  "packages/ui/AGENTS.md"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "Missing required path: $path" >&2
    exit 1
  fi
done

if [[ -e "package.json" || -e "pnpm-lock.yaml" || -e "package-lock.json" || -e "yarn.lock" ]]; then
  echo "JavaScript package files detected. Add explicit install and verification commands before relying on this setup script." >&2
  exit 1
fi

if find . -maxdepth 3 \( -name "*.sln" -o -name "*.csproj" \) | grep -q .; then
  echo ".NET project files detected. Add explicit restore/build/test commands before relying on this setup script." >&2
  exit 1
fi

echo "No application dependencies to install yet."
echo "Setup complete."
