const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8765/FeedbackOps.html';
const OUT = 'screenshots/pack20-current';
fs.mkdirSync(OUT, { recursive: true });

const routes = [
  ['home-action-dashboard',     '#route=home'],
  ['my-work',                   '#route=my-work'],
  ['voc-inbox-detail',          '#route=voc&view=inbox'],
  ['voc-triage-console',        '#route=voc&view=triage'],
  ['voc-new',                   '#route=voc-new'],
  ['voc-clusters',              '#route=voc-clusters'],
  ['findings-detail',           '#route=findings'],
  ['tasks-board',               '#route=tasks&view=board'],
  ['tasks-requests',            '#route=tasks&view=requests'],
  ['tasks-backlog',             '#route=tasks&view=backlog'],
  ['tasks-inbox',               '#route=tasks&view=inbox'],
  ['tasks-my',                  '#route=tasks&view=my'],
  ['tasks-milestones',          '#route=tasks&view=milestones'],
  ['tasks-roadmap',             '#route=tasks&view=roadmap'],
  ['integration-action-dashboard','#route=integration'],
  ['integration-evidence',      '#route=integration-evidence'],
  ['integration-coverage',      '#route=integration-coverage'],
  ['integration-links',         '#route=integration-links'],
  ['surveys-list',              '#route=surveys'],
  ['survey-builder',            '#route=survey-builder'],
  ['survey-result',             '#route=survey-result'],
  ['admin-managed-systems',     '#route=admin'],
  ['admin-analytics-areas',     '#route=admin-areas'],
  ['admin-permissions',         '#route=admin-permissions'],
  ['admin-settings',            '#route=admin-settings'],
  ['probe-rail-scope',          '#route=home&scope=all'],
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({ where: 'pageerror', msg: e.message }));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push({ where: 'console', msg: m.text() }); });

  const log = [];
  for (const [name, hash] of routes) {
    const url = BASE + hash;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);
      const file = path.join(OUT, name + '.png');
      await page.screenshot({ path: file, fullPage: false });
      log.push({ name, ok: true, file });
    } catch (e) {
      log.push({ name, ok: false, error: e.message });
    }
  }

  fs.writeFileSync(path.join(OUT, 'capture-log.json'), JSON.stringify({ log, errors }, null, 2));
  await browser.close();
  console.log('DONE', log.filter(l => l.ok).length, '/', routes.length, 'errors:', errors.length);
})();
