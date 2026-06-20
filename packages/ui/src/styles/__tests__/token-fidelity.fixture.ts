/**
 * Pack 17 Samsung-light token fixture.
 * Source of truth: docs/design-prototype/styles.css lines 1-200.
 * Hex = verbatim from prototype (for docs/fixture comparison).
 * Rgb = decimal triple, space-separated (R G B) — runtime tokens.css format.
 * Raw = verbatim non-color value from prototype.
 * ADR-0021: two-format split is explicit — hex for docs/fixtures, R G B for runtime tokens.
 */

export interface TokenEntry {
  tokenName: string;
  hex?: string;
  rgb?: string;
  raw?: string;
}

export const PACK_17_TOKENS: TokenEntry[] = [
  // --- Raw color tokens ---
  { tokenName: '--color-pitch-black',    hex: '#f3f7fe', rgb: '243 247 254' },
  { tokenName: '--color-graphite',       hex: '#fbfdff', rgb: '251 253 255' },
  { tokenName: '--color-deep-slate',     hex: '#edf3fb', rgb: '237 243 251' },
  { tokenName: '--color-charcoal-grey',  hex: '#cbd6e6', rgb: '203 214 230' },
  { tokenName: '--color-muted-ash',      hex: '#b8c4d6', rgb: '184 196 214' },
  { tokenName: '--color-gunmetal',       hex: '#94a3b8', rgb: '148 163 184' },
  { tokenName: '--color-porcelain',      hex: '#101828', rgb: '16 24 40' },
  { tokenName: '--color-light-steel',    hex: '#374151', rgb: '55 65 81' },
  { tokenName: '--color-storm-cloud',    hex: '#687386', rgb: '104 115 134' },
  { tokenName: '--color-fog-grey',       hex: '#98a2b3', rgb: '152 162 179' },
  { tokenName: '--color-alabaster',      hex: '#e5e5e6', rgb: '229 229 230' },
  { tokenName: '--color-neon-lime',      hex: '#1428a0', rgb: '20 40 160' },
  { tokenName: '--color-aether-blue',    hex: '#1428a0', rgb: '20 40 160' },
  { tokenName: '--color-forest-green',   hex: '#008d4c', rgb: '0 141 76' },
  { tokenName: '--color-cyan-spark',     hex: '#00a9e0', rgb: '0 169 224' },
  { tokenName: '--color-emerald',        hex: '#18a86b', rgb: '24 168 107' },
  { tokenName: '--color-warning-red',    hex: '#d92d3a', rgb: '217 45 58' },
  { tokenName: '--color-deep-violet',    hex: '#3157d5', rgb: '49 87 213' },
  { tokenName: '--color-amethyst',       hex: '#6a8dff', rgb: '106 141 255' },
  { tokenName: '--color-amber',          hex: '#a56300', rgb: '165 99 0' },

  // --- Semantic text tokens ---
  { tokenName: '--text-primary',   raw: 'var(--color-porcelain)' },
  { tokenName: '--text-secondary', raw: 'var(--color-light-steel)' },
  { tokenName: '--text-muted',     raw: 'var(--color-storm-cloud)' },
  { tokenName: '--text-disabled',  raw: 'var(--color-fog-grey)' },
  { tokenName: '--text-danger',    raw: 'var(--color-warning-red)' },
  { tokenName: '--text-warning',   raw: 'var(--color-amber)' },
  { tokenName: '--text-success',   raw: 'var(--color-emerald)' },
  { tokenName: '--text-info',      raw: 'var(--color-cyan-spark)' },
  { tokenName: '--text-on-accent', hex: '#ffffff', rgb: '255 255 255' },

  // --- Surface tokens ---
  { tokenName: '--surface-canvas',        raw: 'var(--color-pitch-black)' },
  { tokenName: '--surface-sidebar',       hex: '#eef4fb', rgb: '238 244 251' },
  { tokenName: '--surface-list',          raw: 'var(--color-pitch-black)' },
  { tokenName: '--surface-row-hover',     hex: '#e7effc', rgb: '231 239 252' },
  { tokenName: '--surface-row-selected',  hex: '#d8e7fb', rgb: '216 231 251' },
  { tokenName: '--surface-detail',        raw: 'var(--color-graphite)' },
  { tokenName: '--surface-popover',       raw: 'var(--color-deep-slate)' },
  { tokenName: '--surface-field',         raw: 'transparent' },
  { tokenName: '--surface-field-filled',  hex: '#ffffff', rgb: '255 255 255' },
  { tokenName: '--surface-blocked',       hex: '#eef2f7', rgb: '238 242 247' },
  { tokenName: '--surface-card',          raw: 'var(--color-graphite)' },
  { tokenName: '--surface-card-elevated', raw: 'var(--color-deep-slate)' },

  // --- Border tokens ---
  { tokenName: '--border-subtle',   raw: 'var(--color-charcoal-grey)' },
  { tokenName: '--border-strong',   raw: 'var(--color-muted-ash)' },
  { tokenName: '--border-selected', raw: 'var(--color-aether-blue)' },
  { tokenName: '--focus-ring',       raw: 'var(--color-neon-lime)' },
  { tokenName: '--focus-ring-danger', raw: 'var(--color-warning-red)' },

  // --- Status tokens (Reporter-facing) ---
  { tokenName: '--status-reporter-received',  raw: 'var(--color-cyan-spark)' },
  { tokenName: '--status-reporter-reviewing', raw: 'var(--color-aether-blue)' },
  { tokenName: '--status-reporter-assigned',  raw: 'var(--color-deep-violet)' },
  { tokenName: '--status-reporter-progress',  raw: 'var(--color-amethyst)' },
  { tokenName: '--status-reporter-prep',      raw: 'var(--color-amber)' },
  { tokenName: '--status-reporter-resolved',  raw: 'var(--color-emerald)' },
  { tokenName: '--status-reporter-reopened',  raw: 'var(--color-warning-red)' },
  { tokenName: '--status-reporter-closed',    raw: 'var(--color-fog-grey)' },

  // --- Status tokens (Internal Task) ---
  { tokenName: '--status-internal-backlog',  raw: 'var(--color-fog-grey)' },
  { tokenName: '--status-internal-todo',     raw: 'var(--color-storm-cloud)' },
  { tokenName: '--status-internal-doing',    raw: 'var(--color-aether-blue)' },
  { tokenName: '--status-internal-review',   raw: 'var(--color-amethyst)' },
  { tokenName: '--status-internal-done',     raw: 'var(--color-emerald)' },
  { tokenName: '--status-internal-released', raw: 'var(--color-cyan-spark)' },
  { tokenName: '--status-internal-reopened', raw: 'var(--color-warning-red)' },

  // --- Severity / signal tokens ---
  { tokenName: '--severity-low',       raw: 'var(--color-storm-cloud)' },
  { tokenName: '--severity-medium',    raw: 'var(--color-amber)' },
  { tokenName: '--severity-high',      hex: '#f08a4a', rgb: '240 138 74' },
  { tokenName: '--severity-critical',  raw: 'var(--color-warning-red)' },
  { tokenName: '--confidence-low',     raw: 'var(--color-storm-cloud)' },
  { tokenName: '--confidence-medium',  raw: 'var(--color-cyan-spark)' },
  { tokenName: '--confidence-high',    raw: 'var(--color-emerald)' },

  // --- Managed System identity tokens ---
  { tokenName: '--managed-system-tableau',  hex: '#5e6ad2', rgb: '94 106 210' },
  { tokenName: '--managed-system-power-bi', hex: '#f2c46d', rgb: '242 196 109' },
  { tokenName: '--managed-system-looker',   hex: '#02b8cc', rgb: '2 184 204' },
  { tokenName: '--managed-system-metabase', hex: '#27a644', rgb: '39 166 68' },
  { tokenName: '--managed-system-default',  raw: 'var(--color-aether-blue)' },

  // --- Layout tokens ---
  { tokenName: '--sidebar-width',           raw: '240px' },
  { tokenName: '--sidebar-width-collapsed', raw: '56px' },
  { tokenName: '--rail-width',              raw: '52px' },
  { tokenName: '--detail-panel-width',      raw: '440px' },
  { tokenName: '--toolbar-height',          raw: '50px' },
  { tokenName: '--topbar-height',           raw: '50px' },
  { tokenName: '--row-height-compact',      raw: '44px' },
  { tokenName: '--row-height-default',      raw: '60px' },
  { tokenName: '--row-height-expanded',     raw: '96px' },
  { tokenName: '--badge-height',            raw: '20px' },
  { tokenName: '--icon-size-sm',            raw: '12px' },
  { tokenName: '--icon-size-md',            raw: '16px' },
  { tokenName: '--icon-size-lg',            raw: '20px' },

  // --- Spacing scale ---
  { tokenName: '--spacing-4',  raw: '4px' },
  { tokenName: '--spacing-8',  raw: '8px' },
  { tokenName: '--spacing-12', raw: '12px' },
  { tokenName: '--spacing-16', raw: '16px' },
  { tokenName: '--spacing-20', raw: '20px' },
  { tokenName: '--spacing-24', raw: '24px' },
  { tokenName: '--spacing-28', raw: '28px' },
  { tokenName: '--spacing-32', raw: '32px' },
  { tokenName: '--spacing-36', raw: '36px' },
  { tokenName: '--spacing-40', raw: '40px' },
  { tokenName: '--spacing-48', raw: '48px' },
  { tokenName: '--spacing-64', raw: '64px' },

  // --- Radius ---
  { tokenName: '--radius-sm',   raw: '2px' },
  { tokenName: '--radius-md',   raw: '6px' },
  { tokenName: '--radius-lg',   raw: '8px' },
  { tokenName: '--radius-xl',   raw: '12px' },
  { tokenName: '--radius-pill', raw: '9999px' },

  // --- Shadows ---
  { tokenName: '--shadow-sm',       raw: 'rgba(16, 24, 40, 0.06) 0px 2px 4px 0px' },
  { tokenName: '--shadow-md',       raw: 'rgba(20, 40, 160, 0.06) 0px 0px 12px 0px inset' },
  { tokenName: '--shadow-subtle',   raw: 'rgb(213, 224, 244) 0px 0px 0px 1px inset' },
  { tokenName: '--shadow-subtle-2', raw: 'rgba(20, 40, 160, 0.10) 0px 0px 0px 1px' },
  { tokenName: '--shadow-xl',       raw: 'rgba(20, 40, 160, 0.12) 0px 12px 36px 0px' },
  { tokenName: '--shadow-focus',    raw: '0 0 0 2px #ffffff, 0 0 0 4px var(--color-neon-lime)' },

  // --- Typography: font families ---
  { tokenName: '--font-sans', raw: "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif" },
  { tokenName: '--font-mono', raw: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },

  // --- Typography: sizes ---
  { tokenName: '--text-caption',    raw: '10px' },
  { tokenName: '--text-tiny',       raw: '11px' },
  { tokenName: '--text-xs',         raw: '12px' },
  { tokenName: '--text-sm',         raw: '13px' },
  { tokenName: '--text-body',       raw: '14px' },
  { tokenName: '--text-md',         raw: '15px' },
  { tokenName: '--text-lg',         raw: '17px' },
  { tokenName: '--text-xl',         raw: '20px' },
  { tokenName: '--text-heading',    raw: '24px' },
  { tokenName: '--text-heading-lg', raw: '32px' },
  { tokenName: '--text-display',    raw: '48px' },
  { tokenName: '--text-system-mark', raw: '8px' },

  // --- Typography: leading ---
  { tokenName: '--leading-tight',   raw: '1.2' },
  { tokenName: '--leading-normal',  raw: '1.4' },
  { tokenName: '--leading-relaxed', raw: '1.6' },

  // --- Typography: tracking ---
  { tokenName: '--tracking-tight',  raw: '-0.22px' },
  { tokenName: '--tracking-normal', raw: '-0.13px' },
  { tokenName: '--tracking-wide',   raw: '0.04em' },
];

/** Map from tokenName → TokenEntry for O(1) lookup in tests. */
export const PACK_17_TOKEN_MAP = new Map(
  PACK_17_TOKENS.map((t) => [t.tokenName, t]),
);
