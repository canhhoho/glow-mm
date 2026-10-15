/**
 * Đo Lighthouse (mobile) cho các trang storefront chính.
 * Chạy trên bản build production đang chạy (mặc định http://localhost:3100 — cùng server với E2E):
 *   npm run build && npm run start   (PORT=3100, env .env.test)   rồi   npm run perf
 * Tuỳ chọn: PERF_URL=<base url>, PERF_RUNS=<số lần đo mỗi trang, mặc định 3>.
 * Điểm Lighthouse dao động giữa các lần → lấy lần có điểm trung vị (khuyến nghị của Lighthouse).
 *
 * Cổng (đã chốt ở P2):
 *  - "mobile": cấu hình mobile chuẩn của Lighthouse/PageSpeed (Slow 4G mô phỏng) → mọi trang ≥ 85.
 *  - "slow-3g": RTT 400ms, 400 Kbps, CPU ×4 → theo dõi, chặn tụt hạng ≥ 70
 *    (giới hạn bởi ~160KB JS nền của Next/React + font Myanmar ở 400 Kbps).
 * Báo cáo HTML/JSON lưu ở lighthouse-reports/.
 */
import { mkdir, writeFile } from "node:fs/promises";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const BASE = process.env.PERF_URL ?? "http://localhost:3100";
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const PAGES = [
  { name: "home", path: "/" },
  { name: "product", path: "/p/sen-viet-sunscreen-spf50" },
  { name: "category", path: "/c/skincare" },
];
const PROFILES = {
  mobile: { throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 }, min: 85 },
  "slow-3g": { throttling: { rttMs: 400, throughputKbps: 400, cpuSlowdownMultiplier: 4 }, min: 70 },
};

// Dùng Chromium của Playwright (đã cài cho E2E), mở cổng debug cho Lighthouse.
const PORT = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
await mkdir("lighthouse-reports", { recursive: true });

const failures = [];
const rows = [];
try {
  for (const [profile, { throttling, min }] of Object.entries(PROFILES)) {
    for (const page of PAGES) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        runs.push(
          await lighthouse(
            BASE + page.path,
            { port: PORT, output: ["html", "json"], onlyCategories: ["performance"], logLevel: "error" },
            { extends: "lighthouse:default", settings: { formFactor: "mobile", throttlingMethod: "simulate", throttling } },
          ),
        );
      }
      runs.sort((a, b) => (a.lhr.categories.performance.score ?? 0) - (b.lhr.categories.performance.score ?? 0));
      const result = runs[Math.floor(runs.length / 2)];
      const lhr = result.lhr;
      const score = Math.round((lhr.categories.performance.score ?? 0) * 100);
      const ms = (id) => Math.round(lhr.audits[id]?.numericValue ?? 0);
      rows.push({
        profile,
        page: page.name,
        score,
        min: Math.round((runs[0].lhr.categories.performance.score ?? 0) * 100),
        max: Math.round((runs.at(-1).lhr.categories.performance.score ?? 0) * 100),
        FCP: ms("first-contentful-paint"),
        LCP: ms("largest-contentful-paint"),
        TBT: ms("total-blocking-time"),
        CLS: Number((lhr.audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
        jsKB: Math.round(
          (lhr.audits["resource-summary"]?.details?.items?.find((i) => i.resourceType === "script")?.transferSize ?? 0) /
            1024,
        ),
      });
      const [html, json] = result.report;
      await writeFile(`lighthouse-reports/${profile}-${page.name}.html`, html);
      await writeFile(`lighthouse-reports/${profile}-${page.name}.json`, json);
      if (score < min) failures.push(`${profile} ${page.name}: ${score} < ${min}`);
    }
  }
} finally {
  await browser.close();
}

console.table(rows);
if (failures.length > 0) {
  console.error("Dưới ngưỡng:");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
