import { expect, type APIRequestContext, type Page } from "@playwright/test";

export function parseSitemapUrls(xml: string) {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((match) => match[1]?.trim() ?? "").filter(Boolean);
}

export async function fetchSitemapUrls(request: APIRequestContext, baseURL: string) {
  const response = await request.get(`${baseURL}/sitemap.xml`);
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  return parseSitemapUrls(xml);
}

export async function fetchRobotsText(request: APIRequestContext, baseURL: string) {
  const response = await request.get(`${baseURL}/robots.txt`);
  expect(response.ok()).toBeTruthy();
  return response.text();
}

function collectJsonLdTypes(value: unknown, types: Set<string>) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdTypes(item, types);
    return;
  }

  const record = value as Record<string, unknown>;
  const typeValue = record["@type"];
  if (typeof typeValue === "string") {
    types.add(typeValue);
  } else if (Array.isArray(typeValue)) {
    for (const entry of typeValue) {
      if (typeof entry === "string") types.add(entry);
    }
  }

  if (record["@graph"]) {
    collectJsonLdTypes(record["@graph"], types);
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      collectJsonLdTypes(nested, types);
    }
  }
}

export async function readPageSeo(page: Page) {
  return page.evaluate(() => {
    const title = document.title;
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => node.textContent ?? "");
    return { title, description, canonical, jsonLd };
  });
}

export function jsonLdIncludesType(jsonLdBlocks: string[], type: string) {
  const types = new Set<string>();

  for (const block of jsonLdBlocks) {
    try {
      collectJsonLdTypes(JSON.parse(block), types);
    } catch {
      if (block.includes(`"@type":"${type}"`) || block.includes(`"@type": "${type}"`)) {
        types.add(type);
      }
    }
  }

  return types.has(type);
}

export function sitemapIncludesPath(urls: string[], pathFragment: string) {
  return urls.some((url) => {
    try {
      return new URL(url).pathname.includes(pathFragment);
    } catch {
      return url.includes(pathFragment);
    }
  });
}

export function sitemapExcludesPath(urls: string[], pathFragment: string) {
  return !urls.some((url) => {
    try {
      return new URL(url).pathname.includes(pathFragment);
    } catch {
      return url.includes(pathFragment);
    }
  });
}
