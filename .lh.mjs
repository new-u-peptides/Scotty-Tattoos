import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--remote-debugging-port=9222'] });
for (let i = 0; i < 3; i++) {
  const r = await lighthouse(process.argv[2] ?? 'http://localhost:4321/', { port: 9222, output: 'json', logLevel: 'silent' });
  const a = r.lhr.audits;
  console.log(`run ${i+1}: perf ${String(Math.round(r.lhr.categories.performance.score*100)).padStart(3)}  a11y ${Math.round(r.lhr.categories.accessibility.score*100)}  CLS ${a['cumulative-layout-shift'].numericValue.toFixed(3)}  FCP ${(a['first-contentful-paint'].numericValue/1000).toFixed(2)}s  LCP ${(a['largest-contentful-paint'].numericValue/1000).toFixed(2)}s  SI ${(a['speed-index'].numericValue/1000).toFixed(2)}s  TBT ${Math.round(a['total-blocking-time'].numericValue)}ms`);
}
await b.close();
