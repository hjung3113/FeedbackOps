// nav-perf.mjs — measure in-app navigation in the ego-browser runtime. Run it through nav-perf.sh, which prepends
// `const NAV_CONFIG = {...}`: ego-browser scripts do not see the shell's environment.
//
// NAV_CONFIG:
//   bases    [{ label, url }]: previews to compare (app-preview.py URLs, one host each)   required
//   targets  hrefs that exist as <a href> on the pages, clicked in order                 required
//   out      absolute path of the JSON result file                                       required
//   runs     measured passes per base (default 3), after one unrecorded warm-up pass
//   start    first path of every pass (default /home)
//   persona  mock-login external_id (default mock-admin-1)
//
// Every pass logs in through POST /auth/mock-login and checks /me. Bases alternate pass by pass, so drift (a cold
// vite transform, polling, CPU contention) lands on both builds. Each click is timed from the page's own
// capture-phase click event: an ego-browser click adds ~0.5 s of cursor animation. The end point is when no fetch is
// in flight and nothing shows as loading for 300 ms, capped at 30 s (`timedOut`). Counters are injected before any
// app code, so a full-document reload is measured too. The result file is always written, even when a target fails.
const fs = await import('node:fs/promises');

const cfg = typeof NAV_CONFIG === 'undefined' ? {} : NAV_CONFIG;
const BASES = cfg.bases ?? [];
const TARGETS = cfg.targets ?? [];
const OUT = cfg.out;
const RUNS = cfg.runs ?? 3;
const START = cfg.start ?? '/home';
const PERSONA = cfg.persona ?? 'mock-admin-1';
if (BASES.length === 0 || TARGETS.length === 0 || !OUT) {
  console.log(JSON.stringify({ ok: false, error: 'NAV_CONFIG needs bases, targets and out (use nav-perf.sh)' }));
  process.exit(2);
}

const LOADING = '[aria-busy="true"], [data-testid*="skeleton"], [aria-label*="불러오는 중"], .animate-pulse';
const task = await taskSpace('nav-perf');
const page = task.page('p1');
const rows = [];
const errors = [];

async function login(base) {
  await page.goto(base + '/login');
  await page.waitForLoadState();
  const who = await page.evaluate(async (externalId) => {
    const res = await fetch('/auth/mock-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ external_id: externalId }),
    });
    if (!res.ok) return `login ${res.status}`;
    const me = await fetch('/me', { headers: { accept: 'application/json' } });
    const body = await me.json().catch(() => null);
    return body?.actor?.external_id ?? `me ${me.status}`;
  }, PERSONA);
  if (who !== PERSONA) throw new Error(`login as ${PERSONA} on ${base} gave ${who}`);
}

async function pass(base, label, run) {
  await page.goto(base.url + START);
  await page.waitForLoadState();
  await page.waitForTimeout(2000);
  for (const href of TARGETS) {
    try {
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        sessionStorage.setItem('__navArmed', '1');
        window.__navSameDoc = true;
        window.__navPerf.apis = 0;
        window.__navPerf.reqs = [];
      });
      // A full-document reload (the regression this tool exists to catch) can land before the shell renders, or
      // on /login when the session dropped: wait for the link, and log in again if needed.
      if ((await page.url()).includes('/login')) {
        await login(base.url);
        await page.goto(base.url + START);
        await page.waitForLoadState();
      }
      await page.waitForSelector(`a[href="${href}"]`, { timeout: 15000 });
      await page.click(`a[href="${href}"] >> nth=0`);
      const pathname = new URL(href, base.url).pathname;
      await page.waitForFunction((p) => location.pathname === p && !!window.__navPerf, pathname, { timeout: 30000 });
      const row = await page.evaluate(async (loading) => {
        const t0 = Number(sessionStorage.getItem('__navT0'));
        const reloaded = window.__navSameDoc !== true;
        let quietSince = null;
        while (Date.now() - t0 < 30000) {
          await new Promise((r) => setTimeout(r, 16));
          const busy = window.__navPerf.inflight > 0 || document.querySelector(loading);
          if (busy) quietSince = null;
          else if (quietSince === null) quietSince = Date.now();
          else if (Date.now() - quietSince > 300) break;
        }
        const resources = performance.getEntriesByType('resource');
        return {
          reloaded,
          timedOut: quietSince === null || Date.now() - quietSince <= 300,
          readyMs: (quietSince ?? Date.now()) - t0,
          jsRequests: reloaded
            ? resources.filter((e) => /\.(m?js|tsx?|jsx|css)(\?|$)/.test(new URL(e.name).pathname)).length
            : 0,
          apiCalls: window.__navPerf.apis,
          slowest: [...window.__navPerf.reqs].sort((a, b) => b.ms - a.ms).slice(0, 3),
        };
      }, LOADING);
      if (label !== null) rows.push({ base: label, run, href, ...row });
    } catch (error) {
      errors.push({ base: base.label, run, href, error: String(error).slice(0, 200) });
    }
  }
}

try {
  await page.cdp('Page.enable', {});
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      performance.setResourceTimingBufferSize(20000);
      window.__navPerf = { inflight: 0, apis: 0, reqs: [] };
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const started = performance.now();
        window.__navPerf.inflight++; window.__navPerf.apis++;
        try { return await nativeFetch(input, init); }
        finally {
          window.__navPerf.inflight--;
          const url = String(typeof input === 'string' ? input : input.url).replace(location.origin, '');
          window.__navPerf.reqs.push({ url: url.slice(0, 80), ms: Math.round(performance.now() - started) });
        }
      };
      document.addEventListener('click', () => {
        if (sessionStorage.getItem('__navArmed') === '1') {
          sessionStorage.setItem('__navT0', String(Date.now()));
          sessionStorage.setItem('__navArmed', '0');
        }
      }, true);
    `,
  });
  for (const base of BASES) await login(base.url);
  for (const base of BASES) await pass(base, null, 0); // warm-up, not recorded
  for (let run = 1; run <= RUNS; run++) {
    for (const base of BASES) await pass(base, base.label, run);
  }
} catch (error) {
  errors.push({ error: String(error).slice(0, 300) });
} finally {
  await task.finish({ keep: [] }).catch(() => {});
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const perBase = {};
for (const base of BASES) {
  perBase[base.label] = {};
  for (const href of TARGETS) {
    const hits = rows.filter((r) => r.base === base.label && r.href === href);
    perBase[base.label][href] = {
      samples: hits.length,
      readyMs: median(hits.map((r) => r.readyMs)),
      apiCalls: median(hits.map((r) => r.apiCalls)),
      reloaded: hits.some((r) => r.reloaded),
      timedOut: hits.some((r) => r.timedOut),
    };
  }
}
const [first, second] = BASES.map((b) => b.label);
const comparison = second
  ? TARGETS.map((href) => {
      const a = perBase[first][href];
      const b = perBase[second][href];
      return {
        href,
        [`${first}ReadyMs`]: a.readyMs,
        [`${second}ReadyMs`]: b.readyMs,
        [`${first}ApiCalls`]: a.apiCalls,
        [`${second}ApiCalls`]: b.apiCalls,
        reloadedIn: [a.reloaded && first, b.reloaded && second].filter(Boolean),
      };
    })
  : [];
const result = { config: { bases: BASES, targets: TARGETS, runs: RUNS, persona: PERSONA }, perBase, comparison, rows, errors };
await fs.writeFile(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ok: errors.length === 0, out: OUT, samples: rows.length, errors: errors.length, comparison }));
