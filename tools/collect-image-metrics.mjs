import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const logPath = join(process.cwd(), "..", "debug-7bdaad.log");

async function collectImageMetrics() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });

  const sections = [
    { testId: "home-hero", label: "hero" },
    { testId: "home-product-shelf-hero", label: "shelf-hero", nth: 0 },
    { testId: "agri-community-world-section", label: "agri-community" }
  ];

  const logs = [];

  for (const section of sections) {
    const locator = section.nth !== undefined
      ? page.getByTestId(section.testId).nth(section.nth)
      : page.getByTestId(section.testId);
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }

  const metrics = await page.evaluate(() => {
    const dpr = window.devicePixelRatio;
    return Array.from(document.querySelectorAll("img")).map((img) => {
      const section =
        img.closest("[data-testid]")?.getAttribute("data-testid") ??
        img.closest("[data-home-composite-chapter]")?.getAttribute("data-home-composite-chapter") ??
        "unknown";
      const style = getComputedStyle(img);
      const physicalW = Math.round(img.clientWidth * dpr);
      const physicalH = Math.round(img.clientHeight * dpr);
      const upscale = img.naturalWidth > 0 ? Math.max(physicalW / img.naturalWidth, physicalH / img.naturalHeight) : 0;
      return {
        section,
        currentSrc: img.currentSrc,
        src: img.getAttribute("src"),
        sizes: img.getAttribute("sizes"),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight,
        devicePixelRatio: dpr,
        physicalWidthNeeded: physicalW,
        physicalHeightNeeded: physicalH,
        maxUpscaleRatio: Number(upscale.toFixed(3)),
        isUpscaled: upscale > 1.05,
        cssTransform: style.transform,
        cssFilter: style.filter,
        assetStatus: img.closest("picture")?.getAttribute("data-mithron-asset-status") ?? null,
        assetId: img.closest("picture")?.getAttribute("data-mithron-asset-id") ?? null
      };
    });
  });

  for (const metric of metrics) {
    if (!metric.naturalWidth || metric.clientWidth < 80) continue;
    logs.push({
      sessionId: "7bdaad",
      runId: "post-fix-playwright",
      hypothesisId: "A-B-C",
      location: "tools/collect-image-metrics.mjs",
      message: "playwright image metrics",
      data: metric,
      timestamp: Date.now()
    });
  }

  writeFileSync(logPath, `${logs.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  console.log(`wrote ${logs.length} metrics to ${logPath}`);
  await browser.close();
}

collectImageMetrics().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
