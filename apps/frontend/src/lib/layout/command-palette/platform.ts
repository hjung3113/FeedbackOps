// #611 — platform detection for the command palette shortcut.
// Owner decision (issue #611): most users are on Windows, so the binding is
// Ctrl+K on Windows/Linux and ⌘K on macOS, and every visible hint uses
// shortcutLabel() — never a hard-coded ⌘.

interface NavigatorUAData {
  platform: string;
}

export function isMacPlatform(nav: Navigator = navigator): boolean {
  // userAgentData is Chromium-only and not in the standard DOM types yet.
  const uaData = (nav as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const platform = uaData?.platform ?? nav.platform;
  return /mac|iphone|ipad|ipod|ios/i.test(platform);
}

/** `⌘K` on macOS, `Ctrl K` elsewhere. */
export function shortcutLabel(mac: boolean = isMacPlatform()): string {
  return mac ? '⌘K' : 'Ctrl K';
}
