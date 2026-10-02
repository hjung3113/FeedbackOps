/**
 * #715: Pack 17 webfonts. The app loads the variable faces via packages
 * (@fontsource-variable/inter, @fontsource-variable/jetbrains-mono,
 * pretendard dynamic-subset CSS) imported in apps/frontend/src/styles.css;
 * tokens.css must lead the stacks with those faces. Inter has no Hangul, so
 * Korean glyphs fall through to Pretendard per glyph — hence Pretendard
 * Variable must sit between the Inter faces and the system fallbacks.
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const TOKENS_CSS_PATH = path.resolve(__dirname, '../tokens.css');

function readFontTokens(): { sans: string | undefined; mono: string | undefined } {
  const root = postcss.parse(fs.readFileSync(TOKENS_CSS_PATH, 'utf-8'));
  let sans: string | undefined;
  let mono: string | undefined;
  root.walkDecls((decl) => {
    if (decl.prop === '--font-sans') sans = decl.value;
    if (decl.prop === '--font-mono') mono = decl.value;
  });
  return { sans, mono };
}

describe('font stacks (#715 Pack 17 webfonts)', () => {
  const { sans, mono } = readFontTokens();

  it('leads --font-sans with Inter Variable and falls Hangul through to Pretendard Variable', () => {
    expect(sans).toBeDefined();
    // Variable face first, static-name alias second, Korean face before the
    // system fallbacks.
    expect(sans).toMatch(/^'Inter Variable', 'Inter', 'Pretendard Variable', 'Pretendard', /);
  });

  it('leads --font-mono with JetBrains Mono Variable', () => {
    expect(mono).toMatch(/^'JetBrains Mono Variable', /);
  });
});
