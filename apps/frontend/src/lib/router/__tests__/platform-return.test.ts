import { describe, expect, it } from 'vitest';
import {
  allowedPlatformReturnHref,
  platformReturnField,
  selectPlatformReturn,
} from '../platform-return';

describe('platformReturnField (syntactic)', () => {
  it.each([
    ['https://platform.example.com'],
    ['https://platform.example.com:8443/a/b?x=1#frag'],
    ['http://localhost:5173/x'],
    ['http://127.0.0.1/x'],
  ])('accepts %s', (value) => {
    expect(platformReturnField.safeParse(value).success).toBe(true);
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['//platform.example.com/x'],
    ['/relative/path'],
    ['http://platform.example.com'],
    ['https://user:pw@platform.example.com'],
    ['not a url'],
    [`https://platform.example.com/${'a'.repeat(2048)}`],
  ])('rejects %s', (value) => {
    expect(platformReturnField.safeParse(value).success).toBe(false);
  });
});

describe('allowedPlatformReturnHref (exact origin)', () => {
  const origins = ['https://a.example', 'https://b.example:8443', 'http://localhost:5173'];

  it.each([
    ['https://a.example/path?x=1', true],
    ['https://A.EXAMPLE/path', true],
    ['https://a.example:443/path', true],
    ['https://b.example:8443/', true],
    ['http://localhost:5173/x', true],
    ['https://a.example.evil.com/', false],
    ['https://evil.com/https://a.example', false],
    ['https://b.example/', false],
    ['https://b.example:9443/', false],
    ['http://a.example/', false],
    ['https://user@a.example/', false],
    ['javascript:alert(1)', false],
    [undefined, false],
    [42, false],
  ])('%s -> %s', (value, expected) => {
    expect(allowedPlatformReturnHref(value, origins) !== undefined).toBe(expected);
  });

  it.each([
    ['https://A.EXAMPLE:443/path?x=1', 'https://a.example/path?x=1'],
    ['https:a.example/path', 'https://a.example/path'],
    ['https:/a.example/path', 'https://a.example/path'],
    ['https:\\a.example/path', 'https://a.example/path'],
  ])('returns the absolute href for %s', (value, href) => {
    expect(allowedPlatformReturnHref(value, origins)).toBe(href);
  });

  it.each([[undefined], [[]]])('is off when origins is %p', (list) => {
    expect(allowedPlatformReturnHref('https://a.example/', list)).toBeUndefined();
  });
});

describe('selectPlatformReturn (leaf route restriction)', () => {
  const search = { platformReturn: 'https://a.example/x' };

  it.each([
    ['/_authed/vocs'],
    ['/_authed/tasks'],
    ['/_authed/surveys/'],
    ['/_authed/surveys/$surveyId'],
  ])('returns the value on leaf %s', (routeId) => {
    expect(
      selectPlatformReturn([
        { routeId: '/_authed', search: {} },
        { routeId, search },
      ]),
    ).toBe(search.platformReturn);
  });

  it.each([
    ['/_authed/surveys/$surveyId/results'],
    ['/_authed/surveys/$surveyId/follow-up'],
    ['/_authed/home'],
  ])('returns undefined on leaf %s', (routeId) => {
    expect(selectPlatformReturn([{ routeId, search }])).toBeUndefined();
  });

  it('returns undefined without the key or matches', () => {
    expect(selectPlatformReturn([{ routeId: '/_authed/vocs', search: {} }])).toBeUndefined();
    expect(selectPlatformReturn([])).toBeUndefined();
  });
});
