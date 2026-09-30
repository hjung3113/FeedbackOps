const MANAGED_SYSTEM_MARK_TOKENS = {
  tableau: '--managed-system-tableau',
  'power-bi': '--managed-system-power-bi',
  looker: '--managed-system-looker',
  metabase: '--managed-system-metabase',
} as const;

export type ManagedSystemMarkToken =
  | (typeof MANAGED_SYSTEM_MARK_TOKENS)[keyof typeof MANAGED_SYSTEM_MARK_TOKENS]
  | '--managed-system-default';

/** Resolve a Managed System slug to its stable identity token. */
export function managedSystemMarkToken(slug: string | null | undefined): ManagedSystemMarkToken {
  const normalizedSlug = typeof slug === 'string' ? slug.toLowerCase() : '';
  const knownToken =
    MANAGED_SYSTEM_MARK_TOKENS[normalizedSlug as keyof typeof MANAGED_SYSTEM_MARK_TOKENS];
  return knownToken ?? '--managed-system-default';
}

/** CSS color for the Managed System mark, using the shared identity token map. */
export function managedSystemMarkColor(slug: string | null | undefined): string {
  return `rgb(var(${managedSystemMarkToken(slug)}) / 1)`;
}
