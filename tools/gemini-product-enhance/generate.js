import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { chromium } from "playwright";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const ROOT = __dirname;
const DIRS = {
  staging: path.join(ROOT, "staging"),
  approved: path.join(ROOT, "approved"),
  processed: path.join(ROOT, "processed"),
  profile: path.join(ROOT, "gemini_profile"),
  downloads: path.join(ROOT, "downloads"),
  work: path.join(ROOT, "work"),
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BUCKET_NAME = process.env.BUCKET_NAME || "product-images";
const FOLDER_PATH = (process.env.FOLDER_PATH || "products/").replace(/^\/+|\/+$/g, "") + "/";
const PROCESS_LIMIT = Number(process.env.PROCESS_LIMIT || 1);
const ONLY_MATCH = (process.env.ONLY_MATCH || "").trim().toLowerCase();
const GEMINI_URL = process.env.GEMINI_URL || "https://gemini.google.com/app";
const LOGIN_TIMEOUT_MS = Number(process.env.LOGIN_TIMEOUT_MS || 600_000);
const GENERATE_TIMEOUT_MS = Number(process.env.GENERATE_TIMEOUT_MS || 120_000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);

const ENHANCEMENT_PROMPT = `Create a NEW professional product showcase image based on this photo (e-commerce catalog / premium listing style).

STRICT RULES:
1) Background: REMOVE completely. Output MUST use a TRUE TRANSPARENT background (alpha channel / PNG with transparency). Do NOT use white, gray, or any solid backdrop. Transparent pixels only behind the product.
2) Product identity: Keep the EXACT same product — shape, proportions, colors, labels, connectors, screws, holes, cables. Do not redesign or invent parts.
3) Crisp micro-detail: Sharpen textures, edges, machining marks, plastic grain, metal, rubber. Ultra-clear, high-resolution detail.
4) Lighting: Clean, even studio softbox lighting with natural highlights. No dramatic colored gels.
5) Framing: Product perfectly centered, well-framed, floating on transparency. Soft contact shadow optional only if it does not fill the background.
6) Output ONLY the product cutout image — no text, watermarks, props, reflections of rooms, or extra objects.
7) Prefer PNG with alpha transparency.

Return the final transparent showcase image only. No explanatory text.`;

function ensureDirs() {
  for (const dir of Object.values(DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(minSec = 2, maxSec = 4) {
  const ms = Math.floor((minSec + Math.random() * (maxSec - minSec)) * 1000);
  log(`Waiting ${(ms / 1000).toFixed(1)}s (anti rate-limit delay)...`);
  return sleep(ms);
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) in .env");
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isImageName(name) {
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(name || "");
}

async function listProductImages(supabase) {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list(FOLDER_PATH.replace(/\/$/, ""), {
    limit: 200,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`Storage list failed: ${error.message}`);

  const files = (data || [])
    .filter((f) => f?.name && isImageName(f.name) && !f.name.endsWith("/"))
    .map((f) => ({
      name: f.name,
      path: `${FOLDER_PATH}${f.name}`,
      size: f.metadata?.size ?? null,
    }));

  // If folder contains subfolders only, dig one level for images
  if (files.length === 0) {
    for (const entry of data || []) {
      if (!entry?.name || entry.name.includes(".")) continue;
      const subPrefix = `${FOLDER_PATH}${entry.name}`;
      const { data: nested, error: nestedErr } = await supabase.storage
        .from(BUCKET_NAME)
        .list(subPrefix, { limit: 50, sortBy: { column: "name", order: "asc" } });
      if (nestedErr) continue;
      for (const f of nested || []) {
        if (isImageName(f.name)) {
          files.push({
            name: f.name,
            path: `${subPrefix}/${f.name}`,
            size: f.metadata?.size ?? null,
          });
        }
      }
      if (files.length) break;
    }
  }

  return files;
}

async function downloadFromSupabase(supabase, objectPath, destPath) {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(objectPath);
  if (error) throw new Error(`Download failed for ${objectPath}: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return destPath;
}

async function compressToStagingWebp(inputPath, baseName) {
  const outName = `${path.parse(baseName).name}.webp`;
  const outPath = path.join(DIRS.staging, outName);
  // Preserve / force alpha so transparent pixels stay transparent (not white).
  await sharp(inputPath)
    .rotate()
    .ensureAlpha()
    .resize(1000, 1000, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .sharpen({ sigma: 0.8 })
    .webp({
      quality: 85,
      alphaQuality: 100,
      lossless: false,
      smartSubsample: true,
    })
    .toFile(outPath);
  const meta = await sharp(outPath).metadata();
  const stat = fs.statSync(outPath);
  log(
    `Staging WebP ready: ${outPath} (${stat.size} bytes, ${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha})`
  );
  // Keep original storage path mapping for upload.js
  fs.writeFileSync(
    path.join(DIRS.staging, `${path.parse(baseName).name}.meta.json`),
    JSON.stringify(
      {
        stagingFile: outName,
        originalObjectPath: process.env.__CURRENT_OBJECT_PATH || null,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  return outPath;
}

async function isLoggedIn(page) {
  const url = page.url();
  if (/accounts\.google\.com|signin/i.test(url)) return false;

  const signIn = page.getByRole("link", { name: /sign in/i }).first();
  if (await signIn.isVisible().catch(() => false)) return false;
  const signInBtn = page.getByRole("button", { name: /sign in/i }).first();
  if (await signInBtn.isVisible().catch(() => false)) return false;

  // Must see the chat composer — avatar alone is not enough
  const composer = page.locator('div[contenteditable="true"], rich-textarea [contenteditable="true"]').first();
  return composer.isVisible({ timeout: 4000 }).catch(() => false);
}

async function saveDebug(page, label) {
  try {
    const shot = path.join(DIRS.downloads, `debug-${label}-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    log(`Debug screenshot: ${shot}`);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("button, a, [role='button']")]
        .slice(0, 80)
        .map((el) => el.getAttribute("aria-label") || el.textContent?.trim()?.slice(0, 60))
        .filter(Boolean)
    );
    log(`UI labels sample: ${JSON.stringify(labels.slice(0, 25))}`);
  } catch (err) {
    log(`Debug capture failed: ${err.message || err}`);
  }
}

async function waitForManualLogin(page) {
  log("Gemini login required. Please sign in to Gemini Pro / Advanced in the opened browser.");
  log(`Waiting up to ${Math.round(LOGIN_TIMEOUT_MS / 1000)}s for login...`);
  const start = Date.now();
  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    if (await isLoggedIn(page)) {
      log("Login detected. Continuing automation...");
      await sleep(2000);
      return;
    }
    await sleep(2500);
  }
  throw new Error("Timed out waiting for manual Gemini login.");
}

async function preferProModel(page) {
  // Gemini shows a mode picker (Flash / Thinking / Pro). Prefer Pro for image quality.
  const picker = page.getByRole("button", { name: /open mode picker|Flash|Pro|Thinking/i }).first();
  if (!(await picker.isVisible({ timeout: 3000 }).catch(() => false))) return;
  const label = ((await picker.getAttribute("aria-label")) || (await picker.innerText().catch(() => "")) || "").toLowerCase();
  if (label.includes("pro") && !label.includes("flash")) {
    log("Model already on Pro-like mode.");
    return;
  }
  await picker.click({ delay: 40 });
  await sleep(600);
  const proOption = page
    .getByRole("option", { name: /pro|advanced/i })
    .or(page.getByText(/^\s*(Pro|Advanced|Gemini Pro)\s*$/i))
    .first();
  if (await proOption.isVisible({ timeout: 3000 }).catch(() => false)) {
    await proOption.click({ delay: 40 });
    log("Switched model picker toward Pro/Advanced.");
    await sleep(800);
  } else {
    log("Could not find Pro/Advanced in mode picker — continuing with current model.");
    await page.keyboard.press("Escape").catch(() => {});
  }
}

async function findComposer(page) {
  const candidates = [
    page.locator('div[contenteditable="true"][aria-label*="prompt" i]'),
    page.locator('div[contenteditable="true"]'),
    page.locator("rich-textarea div[contenteditable='true']"),
    page.getByRole("textbox").first(),
  ];
  for (const loc of candidates) {
    if (await loc.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      return loc.first();
    }
  }
  throw new Error("Could not find Gemini prompt composer.");
}

async function dismissBlockingUi(page) {
  // Account picker / dialogs that steal clicks
  for (const name of [/close/i, /not now/i, /no thanks/i, /got it/i]) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
      await btn.click({ delay: 20 }).catch(() => {});
      await sleep(300);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  const closeSidebar = page.getByRole("button", { name: /close sidebar/i });
  if (await closeSidebar.isVisible({ timeout: 400 }).catch(() => false)) {
    await closeSidebar.click({ delay: 20 }).catch(() => {});
  }
}

async function uploadImage(page, imagePath) {
  log(`Uploading image: ${imagePath}`);
  await dismissBlockingUi(page);

  // Strategy 1 (most reliable on Gemini web): paste image from clipboard into composer
  try {
    const composer = await findComposer(page);
    await composer.click({ delay: 40 });
    await sleep(300);

    const abs = path.resolve(imagePath);
    const bytes = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : "image/jpeg";
    const b64 = bytes.toString("base64");

    const pasted = await page.evaluate(
      async ({ b64Data, mimeType }) => {
        const binary = atob(b64Data);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) arr[i] = binary.charCodeAt(i);
        const blob = new Blob([arr], { type: mimeType });
        try {
          await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
          return "clipboard";
        } catch {
          // Fallback: dispatch paste event with a File
          const file = new File([blob], "product.png", { type: mimeType });
          const dt = new DataTransfer();
          dt.items.add(file);
          const target =
            document.querySelector('[contenteditable="true"]') ||
            document.querySelector("rich-textarea") ||
            document.body;
          const evt = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });
          target.dispatchEvent(evt);
          return "paste-event";
        }
      },
      { b64Data: b64, mimeType: mime }
    );

    if (pasted === "clipboard") {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    }
    await sleep(2500);

    // Detect attachment thumbnail / chip
    const attached = await page
      .locator('img[alt*="uploaded" i], img[src^="blob:"], button[aria-label*="remove" i], [data-test-id*="attachment" i]')
      .first()
      .isVisible({ timeout: 4000 })
      .catch(() => false);
    if (attached || pasted) {
      log(`Upload submitted via ${pasted}${attached ? " (attachment visible)" : ""}.`);
      // Even if chip not detected, Gemini often still accepted the paste
      if (attached) return;
      // Continue to file-menu strategies only if paste clearly failed
      if (pasted === "paste-event") {
        log("Paste event dispatched; assuming attachment accepted.");
        return;
      }
    }
    log("Clipboard paste attempted; verifying via tools menu if needed...");
  } catch (err) {
    log(`Clipboard paste path failed: ${err.message || err}`);
  }

  const trySetViaChooser = async (clickable, label) => {
    log(`Trying filechooser via: ${label}`);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8_000 }),
      clickable.click({ delay: 40, force: true }),
    ]);
    await chooser.setFiles(imagePath);
    return true;
  };

  // Strategy 2: open + menu then choose upload (do NOT wait for chooser on + itself)
  const uploadTools = page.locator('button[aria-label="Upload & tools"], button[aria-label*="Upload & tools"]');
  if (await uploadTools.count()) {
    log("Opening Upload & tools menu (no chooser wait on +)...");
    await uploadTools.first().click({ delay: 40, force: true });
    await sleep(1200);
    await saveDebug(page, "upload-menu-open");

    const menuTexts = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menu"] *, [role="listbox"] *, [role="menuitem"], li, button, span')]
        .map((el) => (el.textContent || "").trim())
        .filter((t) => t && t.length < 80)
        .slice(0, 40)
    );
    log(`Menu texts: ${JSON.stringify(menuTexts)}`);

    const menuItems = page.locator(
      '[role="menuitem"], [role="option"], button, div[role="button"], a'
    ).filter({ hasText: /upload files|upload file|from device|photos|files|image/i });

    const n = await menuItems.count();
    log(`Menu candidate count=${n}`);
    for (let i = 0; i < n; i += 1) {
      const item = menuItems.nth(i);
      const ok = await trySetViaChooser(item, `menu[${i}]`).catch(() => false);
      if (ok) {
        await sleep(2500);
        log("Upload submitted via menu chooser.");
        return;
      }
    }
  }

  const fileInputs = page.locator('input[type="file"]');
  const count = await fileInputs.count();
  log(`Found ${count} file input(s) in DOM.`);
  for (let i = 0; i < count; i += 1) {
    try {
      await fileInputs.nth(i).setInputFiles(imagePath);
      await sleep(2500);
      log("Upload submitted via input[type=file].");
      return;
    } catch (err) {
      log(`input[${i}] failed: ${err.message || err}`);
    }
  }

  await saveDebug(page, "upload-failed");
  throw new Error("No file input / upload button found in Gemini UI. See debug screenshot.");
}

async function sendPrompt(page, prompt) {
  const composer = await findComposer(page);
  await composer.click({ delay: 40 });
  await sleep(400);
  // Clear existing text if any
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await composer.fill(prompt).catch(async () => {
    await page.keyboard.type(prompt, { delay: 8 });
  });
  await sleep(800);

  // Send via Enter or send button
  const sendBtn = page
    .locator('button[aria-label*="Send" i], button[aria-label*="Submit" i], button:has(mat-icon), button.send-button')
    .last();
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click({ delay: 50 });
  } else {
    await page.keyboard.press("Enter");
  }
  log("Prompt sent. Waiting for Gemini image response...");
}

async function saveImageSrcToFile(page, context, src, destPath) {
  if (src?.startsWith("data:image")) {
    const b64 = src.split(",")[1];
    fs.writeFileSync(destPath, Buffer.from(b64, "base64"));
    return;
  }
  if (src?.startsWith("blob:")) {
    const buffer = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      return Array.from(new Uint8Array(ab));
    }, src);
    fs.writeFileSync(destPath, Buffer.from(buffer));
    return;
  }
  if (src?.startsWith("http")) {
    const cookies = await context.cookies(src);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(src, {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
    fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
    return;
  }
  throw new Error(`Unsupported image src: ${String(src).slice(0, 80)}`);
}

/** Capture candidate via src, canvas draw, or element screenshot (handles blob CORS). */
async function saveCandidateToFile(page, context, candidate, destPath) {
  const errors = [];
  try {
    await saveImageSrcToFile(page, context, candidate.src, destPath);
    return "src";
  } catch (err) {
    errors.push(`src: ${err.message || err}`);
  }

  try {
    const dataUrl = await page.evaluate((idx) => {
      const imgs = [...document.querySelectorAll("img")];
      const img = imgs[idx];
      if (!img || !img.naturalWidth) throw new Error("img missing");
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return c.toDataURL("image/png");
    }, candidate.index);
    if (!dataUrl?.startsWith("data:image")) throw new Error("canvas empty");
    const b64 = dataUrl.split(",")[1];
    fs.writeFileSync(destPath, Buffer.from(b64, "base64"));
    return "canvas";
  } catch (err) {
    errors.push(`canvas: ${err.message || err}`);
  }

  try {
    const loc = page.locator("img").nth(candidate.index);
    await loc.screenshot({ path: destPath, type: "png" });
    return "screenshot";
  } catch (err) {
    errors.push(`screenshot: ${err.message || err}`);
  }

  throw new Error(errors.join(" | "));
}

async function waitAndDownloadGeneratedImage(page, context, destPath) {
  const deadline = Date.now() + GENERATE_TIMEOUT_MS;
  let lastErr = null;
  const minPx = 200; // skip avatars / icons
  const acceptPx = Number(process.env.GEMINI_ACCEPT_MIN_PX || 400);
  const pollMs = Number(process.env.GEMINI_POLL_MS || 600);
  // Gemini image gen is ~15–20s; ignore pre-existing chat images
  const minWaitMs = Number(process.env.GEMINI_MIN_WAIT_MS || 8000);
  const waitStarted = Date.now();

  const baselineSrcs = new Set(
    await page.evaluate(() =>
      [...document.querySelectorAll("img")].map((img) => img.currentSrc || img.src || "").filter(Boolean)
    )
  );
  log(`Waiting for NEW Gemini image (ignore ${baselineSrcs.size} existing, min ${minWaitMs / 1000}s)...`);

  while (Date.now() < deadline) {
    try {
      const elapsed = Date.now() - waitStarted;
      const candidates = await page.evaluate((min) => {
        const imgs = [...document.querySelectorAll("img")];
        return imgs
          .map((img, index) => {
            const src = img.currentSrc || img.src || "";
            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            return { index, src, w, h, area: w * h };
          })
          .filter(
            (x) =>
              x.area >= min * min &&
              x.src &&
              (/googleusercontent|lh3\.|blob:|data:image/i.test(x.src) || x.area > 250_000)
          )
          .sort((a, b) => b.area - a.area);
      }, minPx);

      const fresh = candidates.filter((c) => c.src && !baselineSrcs.has(c.src));
      // Only accept after minWaitMs so we don't grab upload thumbnails / stale chat images
      if (fresh.length && elapsed >= minWaitMs) {
        const best = fresh[0];
        if (Math.min(best.w, best.h) >= acceptPx) {
          try {
            const how = await saveCandidateToFile(page, context, best, destPath);
            const meta = await sharp(destPath).metadata();
            if (Math.min(meta.width || 0, meta.height || 0) >= acceptPx) {
              log(
                `Saved generated image (${how}, +${(elapsed / 1000).toFixed(1)}s) -> ${destPath} (${meta.width}x${meta.height})`
              );
              return destPath;
            }
          } catch (err) {
            lastErr = err;
            log(`Candidate ${best.w}x${best.h} save failed: ${err.message || err}`);
          }
        }
      } else if (elapsed < minWaitMs && Math.floor(elapsed / 5000) !== Math.floor((elapsed - pollMs) / 5000)) {
        log(`Generating... ${(elapsed / 1000).toFixed(0)}s / ${minWaitMs / 1000}s min`);
      }

      // Download control only after min wait (avoids grabbing stale assets)
      if (elapsed >= minWaitMs) {
        const downloadControls = page.locator(
          'button[aria-label*="Download" i], a[aria-label*="Download" i], button:has-text("Download"), a:has-text("Download")'
        );
        const dlCount = await downloadControls.count();
        if (dlCount > 0) {
          const btn = downloadControls.last();
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          try {
            const [download] = await Promise.all([
              page.waitForEvent("download", { timeout: 8000 }),
              btn.click({ delay: 40 }),
            ]);
            await download.saveAs(destPath);
            const meta = await sharp(destPath).metadata().catch(() => null);
            if (meta && Math.min(meta.width || 0, meta.height || 0) >= minPx) {
              log(`Downloaded via Download control -> ${destPath} (${meta.width}x${meta.height})`);
              return destPath;
            }
          } catch (err) {
            lastErr = err;
          }
        }
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Gemini did not produce a downloadable image within ${GENERATE_TIMEOUT_MS / 1000}s.${
      lastErr ? ` Last error: ${lastErr.message || lastErr}` : ""
    }`
  );
}

async function enhanceOneWithGemini(browserContext, localImagePath, rawOutPath) {
  const page = await browserContext.newPage();
  page.setDefaultTimeout(45_000);

  try {
    await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(1200);
    log(`Gemini URL: ${page.url()}`);

    if (!(await isLoggedIn(page))) {
      await saveDebug(page, "need-login");
      await waitForManualLogin(page);
      await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await sleep(1000);
    } else {
      log("Existing Gemini session detected.");
    }

    // Start a fresh chat when possible
    const newChat = page.getByRole("button", { name: /new chat/i }).first();
    if (await newChat.isVisible().catch(() => false)) {
      await newChat.click().catch(() => {});
      await sleep(600);
    }

    await preferProModel(page);
    await dismissBlockingUi(page);

    let attempt = 0;
    let lastError = null;
    while (attempt <= MAX_RETRIES) {
      attempt += 1;
      try {
        log(`Generation attempt ${attempt}/${MAX_RETRIES + 1}`);
        await uploadImage(page, localImagePath);
        await sleep(600);
        await sendPrompt(page, ENHANCEMENT_PROMPT);
        await waitAndDownloadGeneratedImage(page, browserContext, rawOutPath);
        return;
      } catch (err) {
        lastError = err;
        log(`Attempt ${attempt} failed: ${err.message || err}`);
        if (attempt <= MAX_RETRIES) {
          log("Retrying in a new turn...");
          await sleep(1500);
          await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
          await sleep(800);
        }
      }
    }
    throw lastError || new Error("Gemini generation failed");
  } finally {
    await page.close().catch(() => {});
  }
}

async function launchPersistentBrowser(profileDir = DIRS.profile, downloadsPath = DIRS.downloads) {
  ensureDirs();
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(downloadsPath, { recursive: true });
  // Prefer installed Google Chrome when present (more natural fingerprint).
  const useChromeChannel = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    || fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    || fs.existsSync("/usr/bin/google-chrome")
    || fs.existsSync("/usr/bin/google-chrome-stable");

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    slowMo: 150,
    acceptDownloads: true,
    viewport: { width: 1400, height: 900 },
    downloadsPath,
    channel: useChromeChannel ? "chrome" : undefined,
    permissions: ["clipboard-read", "clipboard-write"],
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-default-browser-check",
      "--no-first-run",
      "--start-maximized",
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://gemini.google.com",
  }).catch(() => {});

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = window.chrome || { runtime: {} };
  });

  return context;
}

export {
  DIRS,
  ROOT,
  ENHANCEMENT_PROMPT,
  ensureDirs,
  log,
  sleep,
  randomDelay,
  getSupabase,
  downloadFromSupabase,
  enhanceOneWithGemini,
  launchPersistentBrowser,
  compressToStagingWebp,
};

async function main() {
  ensureDirs();
  log("=== Gemini Product Enhance (generate.js) ===");
  log(`Bucket=${BUCKET_NAME} folder=${FOLDER_PATH} limit=${PROCESS_LIMIT}`);

  const supabase = getSupabase();
  const images = await listProductImages(supabase);
  if (!images.length) {
    throw new Error(`No images found in ${BUCKET_NAME}/${FOLDER_PATH}`);
  }

  log(`Found ${images.length} image(s). Processing first ${PROCESS_LIMIT}.`);
  let pool = images;
  if (ONLY_MATCH) {
    pool = images.filter((img) => img.path.toLowerCase().includes(ONLY_MATCH) || img.name.toLowerCase().includes(ONLY_MATCH));
    if (!pool.length) {
      throw new Error(`No images matched ONLY_MATCH=${ONLY_MATCH}`);
    }
    log(`ONLY_MATCH=${ONLY_MATCH} -> ${pool.length} match(es)`);
  }
  const selected = pool.slice(0, PROCESS_LIMIT);

  const context = await launchPersistentBrowser();
  try {
    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i];
      log(`\n--- [${i + 1}/${selected.length}] ${item.path} ---`);
      process.env.__CURRENT_OBJECT_PATH = item.path;

      const localIn = path.join(DIRS.work, `source-${path.basename(item.path)}`);
      const rawOut = path.join(DIRS.downloads, `gemini-raw-${Date.now()}-${path.parse(item.name).name}.png`);

      await downloadFromSupabase(supabase, item.path, localIn);
      log(`Source saved locally: ${localIn}`);

      await enhanceOneWithGemini(context, localIn, rawOut);
      const staged = await compressToStagingWebp(rawOut, item.name);

      // Persist mapping for upload
      const mapPath = path.join(DIRS.staging, `${path.parse(item.name).name}.meta.json`);
      fs.writeFileSync(
        mapPath,
        JSON.stringify(
          {
            stagingFile: path.basename(staged),
            originalObjectPath: item.path,
            originalName: item.name,
            bucket: BUCKET_NAME,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      log(`DONE staging: ${staged}`);
      log("Review this file visually. If approved, move it (and its .meta.json) into approved/ then run: node upload.js");

      if (i < selected.length - 1) {
        await randomDelay(10, 20);
      }
    }
  } finally {
    // Keep profile; close browser when finished
    await context.close().catch(() => {});
  }

  log("generate.js finished.");
}

const isCli =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isCli) {
  main().catch((err) => {
    console.error("\nFATAL:", err.message || err);
    process.exit(1);
  });
}
