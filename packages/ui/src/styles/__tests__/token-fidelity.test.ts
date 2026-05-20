/**
 * Token-fidelity snapshot: asserts tokens.css matches Pack 17 fixture exactly.
 * RED before token port → GREEN after.
 * Uses postcss (NOT regex) to parse tokens.css.
 * ADR-0021: colors = R G B triple; non-colors = raw value.
 */
import path from 'node:path';
import fs from 'node:fs';
import postcss from 'postcss';
import resolveConfig from 'tailwindcss/resolveConfig';
import { describe, it, expect } from 'vitest';
import { PACK_17_TOKENS } from './token-fidelity.fixture';

// Paths resolved relative to this test file (packages/ui/src/styles/__tests__/)
// tokens.css: all Pack 17 prototype tokens (closed-world set-equality)
// semantic.css: shadcn HSL var remaps only (not checked for set-equality)
const TOKENS_CSS_PATH = path.resolve(__dirname, '../tokens.css');
const PRESET_PATH = path.resolve(__dirname, '../../../tailwind.preset.ts');

/** Parse a CSS file and extract all custom property declarations from all :root blocks. */
function parseCustomProps(cssPath: string): Map<string, string> {
  const source = fs.readFileSync(cssPath, 'utf-8');
  const root = postcss.parse(source);
  const props = new Map<string, string>();

  root.walkRules((rule) => {
    if (rule.selector.trim() === ':root') {
      rule.walkDecls(/^--/, (decl) => {
        props.set(decl.prop, decl.value.trim());
      });
    }
  });

  return props;
}

describe('token-fidelity: tokens.css + semantic.css against Pack 17 fixture', () => {
  // tokens.css owns all Pack 17 prototype tokens; semantic.css owns only shadcn remaps.
  // Set-equality is checked against tokens.css only.
  const tokenProps = parseCustomProps(TOKENS_CSS_PATH);

  const fixtureNames = new Set(PACK_17_TOKENS.map((t) => t.tokenName));
  const parsedNames = new Set(tokenProps.keys());

  it('no color-valued token is stored as raw hex (#RRGGBB) — must be R G B triple', () => {
    // Any fixture entry with a hex field MUST have the runtime value be the rgb triple.
    // This prevents silently broken Tailwind /α utilities.
    const colorTokensWithHex = PACK_17_TOKENS.filter((t) => t.hex !== undefined);
    const violations: string[] = [];
    for (const entry of colorTokensWithHex) {
      const runtimeValue = tokenProps.get(entry.tokenName);
      if (runtimeValue && /^#[0-9a-fA-F]{3,8}$/.test(runtimeValue.trim())) {
        violations.push(`${entry.tokenName}: runtime value is raw hex "${runtimeValue}" — must be R G B triple "${entry.rgb}"`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  it('has no EXTRA tokens beyond fixture (closed-world)', () => {
    const extras = [...parsedNames].filter((n) => !fixtureNames.has(n));
    expect(extras, `Extra tokens in CSS not in fixture: ${extras.join(', ')}`).toHaveLength(0);
  });

  it('has no MISSING tokens from fixture', () => {
    const missing = [...fixtureNames].filter((n) => !parsedNames.has(n));
    expect(missing, `Missing tokens from CSS: ${missing.join(', ')}`).toHaveLength(0);
  });

  describe('value assertions per token', () => {
    for (const entry of PACK_17_TOKENS) {
      it(`${entry.tokenName} has correct value`, () => {
        const parsedValue = tokenProps.get(entry.tokenName);
        expect(parsedValue, `${entry.tokenName} is not declared in tokens.css or semantic.css`).toBeDefined();

        if (entry.rgb !== undefined) {
          // Color token: assert R G B triple
          expect(
            parsedValue,
            `${entry.tokenName}: expected rgb="${entry.rgb}" (hex ${entry.hex}) but got "${parsedValue}"`,
          ).toBe(entry.rgb);
        } else if (entry.raw !== undefined) {
          // Non-color token: assert raw value verbatim
          // Normalize whitespace for font-family strings
          const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
          expect(
            normalize(parsedValue!),
            `${entry.tokenName}: expected raw="${entry.raw}" but got "${parsedValue}"`,
          ).toBe(normalize(entry.raw));
        }
      });
    }
  });
});

describe('token-fidelity: Tailwind preset key resolvability', () => {
  // Import the preset dynamically via require (vitest handles ESM imports)
  // We walk the resolved config to verify every semantic key exists.
  it('preset color keys are resolvable via resolveConfig', async () => {
    // Dynamic import to handle ESM preset
    const presetModule = await import(PRESET_PATH);
    const preset = presetModule.default ?? presetModule;

    const resolved = resolveConfig(preset as Parameters<typeof resolveConfig>[0]);
    const colors = resolved.theme?.colors as unknown as Record<string, unknown> | undefined;

    if (!colors) {
      throw new Error('Tailwind resolveConfig returned no theme.colors');
    }

    const expectedKeys = [
      'surface-canvas',
      'surface-raised',
      'surface-sidebar',
      'surface-list',
      'surface-row-hover',
      'surface-row-selected',
      'surface-detail',
      'surface-popover',
      'surface-field',
      'surface-field-filled',
      'surface-card',
      'surface-card-elevated',
      'text-primary',
      'text-secondary',
      'text-muted',
      'text-disabled',
      'text-danger',
      'text-warning',
      'text-success',
      'text-info',
      'text-on-accent',
      'border-default',
      'border-subtle',
      'border-strong',
      'border-selected',
      'focus-ring',
      'focus-ring-danger',
      'accent-primary',
      'accent-danger',
      'accent-warn',
      'accent-success',
      'accent-info',
      'status-reporter-received',
      'status-reporter-reviewing',
      'status-reporter-assigned',
      'status-reporter-progress',
      'status-reporter-prep',
      'status-reporter-resolved',
      'status-reporter-reopened',
      'status-reporter-closed',
      'status-internal-backlog',
      'status-internal-todo',
      'status-internal-doing',
      'status-internal-review',
      'status-internal-done',
      'status-internal-released',
      'status-internal-reopened',
      'severity-low',
      'severity-medium',
      'severity-high',
      'severity-critical',
      'confidence-low',
      'confidence-medium',
      'confidence-high',
    ];

    const missing = expectedKeys.filter((k) => !(k in colors));
    expect(
      missing,
      `Tailwind preset is missing color keys: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });
});
