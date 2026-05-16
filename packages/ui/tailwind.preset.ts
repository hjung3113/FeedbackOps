import type { Config } from 'tailwindcss';

// Per ADR-0016: utility classes reference semantic names only, never raw colors.
const preset: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        'surface-canvas': 'rgb(var(--surface-canvas) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-overlay': 'rgb(var(--surface-overlay) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'text-subtle': 'rgb(var(--text-subtle) / <alpha-value>)',
        'text-inverse': 'rgb(var(--text-inverse) / <alpha-value>)',
        'border-default': 'rgb(var(--border-default) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        'accent-primary': 'rgb(var(--accent-primary) / <alpha-value>)',
        'accent-info': 'rgb(var(--accent-info) / <alpha-value>)',
        'accent-warn': 'rgb(var(--accent-warn) / <alpha-value>)',
        'accent-danger': 'rgb(var(--accent-danger) / <alpha-value>)',
        'accent-success': 'rgb(var(--accent-success) / <alpha-value>)',
      },
    },
  },
};

export default preset;
