const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
let pixelmatch;

const BASE_DIR = 'screenshots/final-baselines';
const CUR_DIR = 'screenshots/pack20-current';
const DIFF_DIR = 'screenshots/pack20-diff';
fs.mkdirSync(DIFF_DIR, { recursive: true });

(async () => {
pixelmatch = (await import('pixelmatch')).default;
const files = fs.readdirSync(CUR_DIR).filter(f => f.endsWith('.png'));
const report = [];

for (const f of files) {
  const a = path.join(BASE_DIR, f);
  const b = path.join(CUR_DIR, f);
  if (!fs.existsSync(a)) { report.push({ name: f, status: 'NO_BASELINE' }); continue; }
  const img1 = PNG.sync.read(fs.readFileSync(a));
  const img2 = PNG.sync.read(fs.readFileSync(b));
  if (img1.width !== img2.width || img1.height !== img2.height) {
    report.push({ name: f, status: 'SIZE_MISMATCH', base: [img1.width, img1.height], cur: [img2.width, img2.height] });
    continue;
  }
  const diff = new PNG({ width: img1.width, height: img1.height });
  const n = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, { threshold: 0.1 });
  const total = img1.width * img1.height;
  const pct = (n / total) * 100;
  if (n > 0) fs.writeFileSync(path.join(DIFF_DIR, f), PNG.sync.write(diff));
  report.push({ name: f, status: n === 0 ? 'IDENTICAL' : 'DIFF', diffPx: n, pct: +pct.toFixed(3) });
}

report.sort((a, b) => (b.pct || 0) - (a.pct || 0));
fs.writeFileSync(path.join(DIFF_DIR, 'diff-report.json'), JSON.stringify(report, null, 2));
console.log('name'.padEnd(34), 'status'.padEnd(16), 'pct');
for (const r of report) console.log(r.name.padEnd(34), (r.status || '').padEnd(16), r.pct ?? '');
})();
