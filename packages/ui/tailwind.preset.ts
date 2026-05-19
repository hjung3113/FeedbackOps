/**
 * Tailwind preset — Pack 17 Samsung-light design system.
 * ADR-0021: utility classes reference semantic token names, never raw color vars.
 * Color utilities use `rgb(var(--X) / <alpha-value>)` so opacity modifiers work
 * (e.g. `bg-severity-high/15`, `text-text-muted/70`).
 *
 * Format: Tailwind 3 syntax only. No `@theme` v4 blocks.
 * Source of truth for token names: docs/design-prototype/styles.css + ADR-0021.
 */
import type { Config } from 'tailwindcss';

const preset: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        // --- Surface tokens ---
        'surface-canvas': 'rgb(var(--surface-canvas) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',        // compat alias
        'surface-sidebar': 'rgb(var(--color-pitch-black) / <alpha-value>)',    // uses raw; #eef4fb is not a triple
        'surface-list': 'rgb(var(--surface-list) / <alpha-value>)',
        'surface-row-hover': 'rgb(var(--color-charcoal-grey) / <alpha-value>)', // closest triple
        'surface-row-selected': 'rgb(var(--color-charcoal-grey) / <alpha-value>)',
        'surface-detail': 'rgb(var(--surface-detail) / <alpha-value>)',
        'surface-popover': 'rgb(var(--surface-popover) / <alpha-value>)',
        'surface-field': 'transparent',
        'surface-field-filled': '#ffffff',
        'surface-card': 'rgb(var(--surface-card) / <alpha-value>)',
        'surface-card-elevated': 'rgb(var(--surface-card-elevated) / <alpha-value>)',

        // --- Text tokens ---
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'text-disabled': 'rgb(var(--text-disabled) / <alpha-value>)',
        'text-danger': 'rgb(var(--text-danger) / <alpha-value>)',
        'text-warning': 'rgb(var(--text-warning) / <alpha-value>)',
        'text-success': 'rgb(var(--text-success) / <alpha-value>)',
        'text-info': 'rgb(var(--text-info) / <alpha-value>)',
        'text-on-accent': '#ffffff',
        'text-inverse': 'rgb(var(--color-pitch-black) / <alpha-value>)',

        // --- Border tokens ---
        'border-default': 'rgb(var(--border-default) / <alpha-value>)',        // compat alias
        'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        'border-selected': 'rgb(var(--border-selected) / <alpha-value>)',

        // --- Focus tokens ---
        'focus-ring': 'rgb(var(--color-neon-lime) / <alpha-value>)',
        'focus-ring-danger': 'rgb(var(--color-warning-red) / <alpha-value>)',

        // --- Accent tokens ---
        'accent-primary': 'rgb(var(--color-neon-lime) / <alpha-value>)',
        'accent-info': 'rgb(var(--color-cyan-spark) / <alpha-value>)',
        'accent-warn': 'rgb(var(--color-amber) / <alpha-value>)',
        'accent-danger': 'rgb(var(--color-warning-red) / <alpha-value>)',
        'accent-success': 'rgb(var(--color-emerald) / <alpha-value>)',

        // --- Status tokens: Reporter-facing ---
        'status-reporter-received':  'rgb(var(--color-cyan-spark) / <alpha-value>)',
        'status-reporter-reviewing': 'rgb(var(--color-aether-blue) / <alpha-value>)',
        'status-reporter-assigned':  'rgb(var(--color-deep-violet) / <alpha-value>)',
        'status-reporter-progress':  'rgb(var(--color-amethyst) / <alpha-value>)',
        'status-reporter-prep':      'rgb(var(--color-amber) / <alpha-value>)',
        'status-reporter-resolved':  'rgb(var(--color-emerald) / <alpha-value>)',
        'status-reporter-reopened':  'rgb(var(--color-warning-red) / <alpha-value>)',
        'status-reporter-closed':    'rgb(var(--color-fog-grey) / <alpha-value>)',

        // --- Status tokens: Internal Task ---
        'status-internal-backlog':  'rgb(var(--color-fog-grey) / <alpha-value>)',
        'status-internal-todo':     'rgb(var(--color-storm-cloud) / <alpha-value>)',
        'status-internal-doing':    'rgb(var(--color-aether-blue) / <alpha-value>)',
        'status-internal-review':   'rgb(var(--color-amethyst) / <alpha-value>)',
        'status-internal-done':     'rgb(var(--color-emerald) / <alpha-value>)',
        'status-internal-released': 'rgb(var(--color-cyan-spark) / <alpha-value>)',
        'status-internal-reopened': 'rgb(var(--color-warning-red) / <alpha-value>)',

        // --- Severity tokens ---
        'severity-low':      'rgb(var(--color-storm-cloud) / <alpha-value>)',
        'severity-medium':   'rgb(var(--color-amber) / <alpha-value>)',
        'severity-high':     '#f08a4a',
        'severity-critical': 'rgb(var(--color-warning-red) / <alpha-value>)',

        // --- Confidence tokens ---
        'confidence-low':    'rgb(var(--color-storm-cloud) / <alpha-value>)',
        'confidence-medium': 'rgb(var(--color-cyan-spark) / <alpha-value>)',
        'confidence-high':   'rgb(var(--color-emerald) / <alpha-value>)',
      },

      spacing: {
        // Layout tokens exposed as spacing utilities
        'sidebar':           'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
        'rail':              'var(--rail-width)',
        'detail-panel':      'var(--detail-panel-width)',
        'toolbar':           'var(--toolbar-height)',
        'topbar':            'var(--topbar-height)',
        'row-compact':       'var(--row-height-compact)',
        'row-default':       'var(--row-height-default)',
        'row-expanded':      'var(--row-height-expanded)',
      },

      borderRadius: {
        'sm':   'var(--radius-sm)',
        'md':   'var(--radius-md)',
        'lg':   'var(--radius-lg)',
        'xl':   'var(--radius-xl)',
        'pill': 'var(--radius-pill)',
      },

      boxShadow: {
        'sm':       'var(--shadow-sm)',
        'md':       'var(--shadow-md)',
        'subtle':   'var(--shadow-subtle)',
        'subtle-2': 'var(--shadow-subtle-2)',
        'xl':       'var(--shadow-xl)',
        'focus':    'var(--shadow-focus)',
      },
    },
  },
};

export default preset;
