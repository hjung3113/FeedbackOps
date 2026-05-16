// Reserved for Permission-module pg-boss jobs (e.g. expiring grants,
// auto-revoking pending requests). Slice 1 has zero scheduled jobs — keeping
// the file alongside check-service.ts so S1.4+ slots its job registrar here
// the same way modules/core/jobs/ is structured (ADR-0009 boot order).
//
// Intentionally empty.

export {};
