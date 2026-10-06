import fs from 'node:fs';
/**
 * #525: WCAG AA (4.5:1) contrast regression guard for status/severity label
 * text. The design review measured the *base* status/severity hues as label
 * foreground failing 4.5:1 (2.25:1-3.91:1 for 6 of 8 reporter statuses; all
 * 4 severity levels once the raw-triplet CSS syntax bug is also fixed).
 * Fix: a paired `-label` token per hue, same hue darkened only, used for
 * label text; the base token stays for the dot/tint. This test computes the
 * actual contrast ratio from tokens.css itself (not a hand-copied number),
 * so a future edit to any of these values gets caught here if it regresses
 * below AA — parsed with postcss, same technique as token-fidelity.test.ts.
 */
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const TOKENS_CSS_PATH = path.resolve(__dirname, '../tokens.css');

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

/** Resolve a token's value to an [r,g,b] triple, following one level of `var(--x)` indirection. */
function resolveRgb(props: Map<string, string>, tokenName: string): [number, number, number] {
  let value = props.get(tokenName);
  if (value === undefined) throw new Error(`token not found: ${tokenName}`);
  const varMatch = value.match(/^var\((--[\w-]+)\)$/);
  const indirectName = varMatch?.[1];
  if (indirectName !== undefined) {
    value = props.get(indirectName);
    if (value === undefined) throw new Error(`indirect token not found: ${indirectName}`);
  }
  const parts = value.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`${tokenName} is not an R G B triple: "${value}"`);
  }
  return parts as [number, number, number];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blend(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number,
): [number, number, number] {
  const [fr, fg2, fb] = fg;
  const [br, bg2, bb] = bg;
  return [
    fr * alpha + br * (1 - alpha),
    fg2 * alpha + bg2 * (1 - alpha),
    fb * alpha + bb * (1 - alpha),
  ];
}

const WCAG_AA_TEXT = 4.5;

describe('#525 status/severity label contrast (WCAG AA)', () => {
  const props = parseCustomProps(TOKENS_CSS_PATH);
  const canvas = resolveRgb(props, '--color-pitch-black');

  it('--color-storm-cloud (muted text) clears 4.5:1 on canvas', () => {
    const stormCloud = resolveRgb(props, '--color-storm-cloud');
    expect(contrastRatio(stormCloud, canvas)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  const reporterStatuses = [
    'received',
    'reviewing',
    'assigned',
    'progress',
    'prep',
    'resolved',
    'reopened',
    'closed',
  ] as const;

  for (const status of reporterStatuses) {
    it(`--status-reporter-${status}-label clears 4.5:1 on the base hue's own 14% tint`, () => {
      const baseHue = resolveRgb(props, `--status-reporter-${status}`);
      const labelColor = resolveRgb(props, `--status-reporter-${status}-label`);
      const tintBackground = blend(baseHue, canvas, 0.14);
      expect(contrastRatio(labelColor, tintBackground)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    });
  }

  const severityLevels = ['low', 'medium', 'high', 'critical'] as const;

  for (const level of severityLevels) {
    it(`--severity-${level}-label clears 4.5:1 on the base hue's own 12% tint`, () => {
      const baseHue = resolveRgb(props, `--severity-${level}`);
      const labelColor = resolveRgb(props, `--severity-${level}-label`);
      const tintBackground = blend(baseHue, canvas, 0.12);
      expect(contrastRatio(labelColor, tintBackground)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    });
  }
});

const internalTaskStatuses = [
  'backlog',
  'todo',
  'doing',
  'review',
  'done',
  'released',
  'reopened',
] as const;

const internalTaskBadgeSurfaces = [
  '--surface-canvas',
  '--surface-card',
  '--surface-card-elevated',
  '--surface-row-hover',
  '--surface-row-selected',
  '--surface-detail',
] as const;

describe('#799 internal Task status label contrast (WCAG AA)', () => {
  const props = parseCustomProps(TOKENS_CSS_PATH);

  it.each(
    internalTaskStatuses.flatMap((status) =>
      internalTaskBadgeSurfaces.map((surfaceToken) => ({ status, surfaceToken })),
    ),
  )(
    '--status-internal-$status-label clears 4.5:1 on its 12% tint over $surfaceToken',
    ({ status, surfaceToken }) => {
      const baseHue = resolveRgb(props, `--status-internal-${status}`);
      const labelColor = resolveRgb(props, `--status-internal-${status}-label`);
      const surfaceColor = resolveRgb(props, surfaceToken);
      // Browsers paint the tint as 8-bit sRGB: measure the rounded pixel, not the
      // float blend (done-label once passed at 4.506 in float and painted 4.49).
      const tintBackground = blend(baseHue, surfaceColor, 0.12).map(Math.round) as [
        number,
        number,
        number,
      ];

      expect(contrastRatio(labelColor, tintBackground)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );
});

const semanticTextLabelPairs = [
  ['success', '--text-success', '--text-success-label', [24, 168, 107]],
  ['info', '--text-info', '--text-info-label', [0, 169, 224]],
  ['warning', '--text-warning', '--text-warning-label', [165, 99, 0]],
  ['danger', '--text-danger', '--text-danger-label', [217, 45, 58]],
] as const;

const semanticTextSurfaces = [
  '--surface-canvas',
  '--surface-card',
  '--surface-card-elevated',
  '--surface-sidebar',
  '--surface-row-hover',
  '--surface-row-selected',
  '--surface-blocked',
  '--surface-field-filled',
] as const;

describe('#750 semantic text label contrast (WCAG AA)', () => {
  const props = parseCustomProps(TOKENS_CSS_PATH);

  it('keeps the base semantic text colors unchanged', () => {
    for (const [, baseToken, , expectedRgb] of semanticTextLabelPairs) {
      expect(resolveRgb(props, baseToken)).toEqual(expectedRgb);
    }
  });

  it.each(
    semanticTextLabelPairs.flatMap(([name, baseToken, labelToken]) =>
      semanticTextSurfaces.map((surfaceToken) => ({
        name,
        baseToken,
        labelToken,
        surfaceToken,
      })),
    ),
  )('$labelToken clears 4.5:1 on $surfaceToken', ({ labelToken, surfaceToken }) => {
    const labelColor = resolveRgb(props, labelToken);
    const surfaceColor = resolveRgb(props, surfaceToken);
    expect(contrastRatio(labelColor, surfaceColor)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(semanticTextLabelPairs)(
    '--text-%s-label clears 4.5:1 on its 14% card tint',
    (_name, baseToken, labelToken) => {
      const baseHue = resolveRgb(props, baseToken);
      const labelColor = resolveRgb(props, labelToken);
      const card = resolveRgb(props, '--surface-card');
      const tintBackground = blend(baseHue, card, 0.14);
      expect(contrastRatio(labelColor, tintBackground)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );

  const badgeSurfaces = [
    { name: 'canvas row', surfaceToken: '--surface-canvas', blocked: false },
    { name: 'card', surfaceToken: '--surface-card', blocked: false },
    { name: 'hovered row', surfaceToken: '--surface-row-hover', blocked: false },
    { name: '60% blocked row over canvas', surfaceToken: '--surface-blocked', blocked: true },
  ] as const;
  const badgePairs = semanticTextLabelPairs.filter(([name]) =>
    ['success', 'warning', 'danger'].includes(name),
  );

  it.each(
    badgePairs.flatMap(([name, baseToken, labelToken]) =>
      badgeSurfaces.map((surface) => ({ name, baseToken, labelToken, surface })),
    ),
  )(
    '$labelToken clears 4.5:1 on its 12% tint over $surface.name',
    ({ baseToken, labelToken, surface }) => {
      const baseHue = resolveRgb(props, baseToken);
      const labelColor = resolveRgb(props, labelToken);
      const rowSurface = resolveRgb(props, surface.surfaceToken);
      const canvas = resolveRgb(props, '--surface-canvas');
      const rowBackground = surface.blocked ? blend(rowSurface, canvas, 0.6) : rowSurface;
      const tintBackground = blend(baseHue, rowBackground, 0.12);
      expect(contrastRatio(labelColor, tintBackground)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );

  it('--text-danger-label clears 4.5:1 on the blocked Milestone badge tint over a selected row', () => {
    const selectedTint = blend(
      resolveRgb(props, '--text-danger'),
      resolveRgb(props, '--surface-row-selected'),
      0.12,
    );
    expect(
      contrastRatio(resolveRgb(props, '--text-danger-label'), selectedTint),
    ).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});
