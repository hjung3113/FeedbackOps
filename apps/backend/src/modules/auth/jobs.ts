// Placeholder for auth-module background jobs. Slice 1 #3 has none — the
// session sweep job (delete revoked/expired rows older than N days) is
// scoped to a later slice once pg-boss is wired (#6). The file exists so
// the module shape matches `docs/implementation/02-domain-module-boundaries.md`.

export const __authJobs = {} as const;
