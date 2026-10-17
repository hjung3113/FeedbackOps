/** Inclusive UTC boundary: current calendar month plus the two preceding whole months. */
export function recoveryHistoryWindowStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
}
