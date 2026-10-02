import { afterEach, describe, expect, it } from 'vitest';

import { isMacPlatform, shortcutLabel } from '../platform';

// jsdom's navigator.platform is '' and userAgentData is absent; install both as
// configurable own properties and restore the originals afterwards.
const originalPlatform = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
const originalUaData = Object.getOwnPropertyDescriptor(window.navigator, 'userAgentData');

function stubPlatform(platform: string, userAgentDataPlatform?: string): void {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(window.navigator, 'userAgentData', {
    ...(userAgentDataPlatform !== undefined
      ? { value: { platform: userAgentDataPlatform } }
      : { value: undefined }),
    configurable: true,
  });
}

afterEach(() => {
  if (originalPlatform) Object.defineProperty(window.navigator, 'platform', originalPlatform);
  if (originalUaData) Object.defineProperty(window.navigator, 'userAgentData', originalUaData);
  else Reflect.deleteProperty(window.navigator, 'userAgentData');
});

describe('isMacPlatform', () => {
  it.each([
    { name: 'macOS legacy platform', platform: 'MacIntel', uaData: undefined, isMac: true },
    { name: 'iPhone legacy platform', platform: 'iPhone', uaData: undefined, isMac: true },
    { name: 'Windows legacy platform', platform: 'Win32', uaData: undefined, isMac: false },
    { name: 'Linux legacy platform', platform: 'Linux x86_64', uaData: undefined, isMac: false },
    { name: 'Chromium on Windows', platform: 'Win32', uaData: 'Windows', isMac: false },
    { name: 'Chromium on macOS', platform: 'MacIntel', uaData: 'Mac OS X', isMac: true },
  ] as const)('$name is detected', ({ platform, uaData, isMac }) => {
    stubPlatform(platform, uaData);
    expect(isMacPlatform()).toBe(isMac);
  });

  it('prefers navigator.userAgentData.platform over navigator.platform', () => {
    stubPlatform('MacIntel', 'Windows');
    expect(isMacPlatform()).toBe(false);
  });
});

describe('shortcutLabel', () => {
  it.each([
    { name: 'macOS', platform: 'MacIntel', label: '⌘K' },
    { name: 'Windows', platform: 'Win32', label: 'Ctrl K' },
    { name: 'Linux', platform: 'Linux x86_64', label: 'Ctrl K' },
  ] as const)('shows $name the $label label', ({ platform, label }) => {
    stubPlatform(platform);
    expect(shortcutLabel()).toBe(label);
  });
});
