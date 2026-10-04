import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { expect, it } from 'vitest';

/**
 * Consumer contract for the documented @fops/ui imports (ADR-0058).
 *
 * analytics-platform imports only these five lines — never the app stylesheet.
 * These tests compile EXACTLY the documented recipe with Tailwind's Node API
 * and assert the parity-critical CSS the package components rely on is present
 * in that package-only output (FIX1 for W-743 final review R1/R2/R3).
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The documented consumer imports — the only stylesheet input allowed here. */
const DOCUMENTED_IMPORTS = [
  "@import 'tailwindcss';",
  "@import '@fops/ui/styles/tokens.css' layer(base);",
  "@import '@fops/ui/styles/semantic.css' layer(base);",
  "@import '@fops/ui/styles/theme.css';",
  "@import '@fops/ui/styles/compat.css';",
].join('\n');

async function compileConsumerCss(candidates: string[]): Promise<string> {
  const compiler = await compile(DOCUMENTED_IMPORTS, {
    base: packageRoot,
    onDependency: () => {},
  });
  // Whitespace-insensitive: assert structure, not the printer's indentation.
  return compiler.build(candidates).replace(/\s+/g, ' ');
}

const COMPILE_TIMEOUT = 30_000;

it(
  'documented imports ship the parity rules package components rely on',
  async () => {
    const css = await compileConsumerCss([
      // Button.tsx, dialog.tsx, ChipPicker.tsx, LinkedEntityTrail.tsx.
      'bg-accent-primary',
      'space-y-1.5',
      'rounded-(--radius-pill)',
      'leading-tight',
      'text-xs',
      'text-text-success-label',
      'text-text-info-label',
      'text-text-warning-label',
      'text-text-danger-label',
    ]);

    // v3 Preflight pins (compat.css base layer).
    expect(css).toContain(
      'button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }',
    );
    expect(css).toContain('input::placeholder, textarea::placeholder { color: #9ca3af; }');
    expect(css).toContain('border-color: #e5e7eb;');

    // v3 `space-y` selector, not the v4 `> :not(:last-child)` shape.
    expect(css).toContain('.space-y-1\\.5 > :not([hidden]) ~ :not([hidden])');
    // v4's built-in rule also adds the gap to the preceding sibling; the compat
    // utility must cancel it so the gap is applied once.
    expect(css).toMatch(/\.space-y-1\\\.5 > :not\(:last-child\) \{\s*margin-block-end: 0;/);
    expect(css).toContain(
      'margin-top: calc(calc(var(--spacing) * 1.5) * calc(1 - var(--tw-space-y-reverse)));',
    );

    // Token color utility inlines the theme value.
    expect(css).toContain('.bg-accent-primary { background-color: rgb(var(--color-neon-lime)); }');
    expect(css).toContain('.text-text-success-label { color: rgb(var(--text-success-label)); }');
    expect(css).toContain('.text-text-info-label { color: rgb(var(--text-info-label)); }');
    expect(css).toContain('.text-text-warning-label { color: rgb(var(--text-warning-label)); }');
    expect(css).toContain('.text-text-danger-label { color: rgb(var(--text-danger-label)); }');

    // The token-backed pill radius compiles to the token variable.
    expect(css).toContain('.rounded-\\(--radius-pill\\) { border-radius: var(--radius-pill); }');

    // The legacy leading pin survives with the v3 value (not the token var).
    expect(css).toContain('.leading-tight { --tw-leading: 1.25; line-height: 1.25; }');

    // v3 text-xs/sm/lg/xl utilities had no line-height companion. Keep the
    // representative text utility size-only so it inherits the body leading.
    const textXsRule = css.match(/\.text-xs \{[^}]+\}/)?.[0];
    expect(textXsRule).toBeDefined();
    expect(textXsRule).not.toContain('line-height:');

    // The documented Tailwind layer order leaves the real base token after
    // theme-layer self references, so rounded-pill keeps its 9999px value.
    const layerOrder = css.indexOf('@layer theme, base, components, utilities;');
    const themeRadius = css.indexOf('--radius-pill: var(--radius-pill);');
    const tokenRadius = css.indexOf('--radius-pill: 9999px;');
    expect(layerOrder).toBeGreaterThan(-1);
    expect(themeRadius).toBeGreaterThan(layerOrder);
    expect(tokenRadius).toBeGreaterThan(themeRadius);

    // R3: the removed doubled-class override must not come back.
    expect(css).not.toContain('.rounded-full.rounded-full');
  },
  COMPILE_TIMEOUT,
);

it(
  'space-y variants compose and hidden children stay out of the chain',
  async () => {
    const css = await compileConsumerCss(['space-y-2', 'sm:space-y-4']);

    // Base rule keeps the v3 selector and value (--spacing * 2 = 0.5rem).
    const baseRule = css.indexOf('.space-y-2 > :not([hidden]) ~ :not([hidden])');
    expect(baseRule).toBeGreaterThan(-1);
    expect(css.slice(baseRule)).toContain(
      'margin-top: calc(calc(var(--spacing) * 2) * calc(1 - var(--tw-space-y-reverse)));',
    );

    // Responsive override composes: the sm rule carries the v3 selector and
    // the 4-unit value inside the 40rem media query (the deleted bare shim
    // pinned these to 8px at every width).
    const mediaStart = css.indexOf('@media (width >= 40rem)');
    const smRule = css.indexOf('.sm\\:space-y-4 > :not([hidden]) ~ :not([hidden])');
    expect(mediaStart).toBeGreaterThan(-1);
    expect(smRule).toBeGreaterThan(mediaStart);
    expect(css.slice(smRule)).toContain(
      'margin-top: calc(calc(var(--spacing) * 4) * calc(1 - var(--tw-space-y-reverse)));',
    );

    // `:not([hidden]) ~ :not([hidden])` on both sides is what keeps a hidden
    // first child from granting the first visible child a top margin.
    expect(css).toContain('.space-y-2 > :not([hidden]) ~ :not([hidden])');
  },
  COMPILE_TIMEOUT,
);

it(
  'directional and responsive radius overrides are not outranked',
  async () => {
    const css = await compileConsumerCss([
      'rounded-(--radius-pill)',
      'rounded-l-none',
      'md:rounded-md',
    ]);

    const pillRule = css.indexOf('.rounded-\\(--radius-pill\\)');
    const leftRule = css.indexOf('.rounded-l-none');
    expect(pillRule).toBeGreaterThan(-1);
    // Later same-specificity longhand beats the shorthand: directional
    // overrides win without the deleted `.rounded-full.rounded-full` hack.
    expect(leftRule).toBeGreaterThan(pillRule);
    expect(css.slice(leftRule)).toContain(
      '.rounded-l-none { border-top-left-radius: 0; border-bottom-left-radius: 0; }',
    );

    const mediaStart = css.indexOf('@media (width >= 48rem)');
    const mdRule = css.indexOf('.md\\:rounded-md');
    expect(mediaStart).toBeGreaterThan(-1);
    expect(mdRule).toBeGreaterThan(mediaStart);
    expect(css.slice(mdRule)).toContain('border-radius: var(--radius-md);');
  },
  COMPILE_TIMEOUT,
);
