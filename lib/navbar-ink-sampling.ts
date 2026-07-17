import {
  FLUSH_HERO_LIGHT_NAV_ROUTES,
  normalizeStorefrontPath,
  resolvePathNavbarTone,
  type NavbarInkTone
} from "@/lib/navbar-ink-resolver";

export type { NavbarInkTone } from "@/config/navbar-ink-registry";
export { FLUSH_HERO_LIGHT_NAV_ROUTES, normalizeStorefrontPath } from "@/config/navbar-ink-registry";

const NAVBAR_SAMPLE_X_RATIOS = [0.18, 0.5, 0.82] as const;

/** SSR-safe navbar ink before client-side hero surfaces mount. */
export function resolveInitialNavbarTone(pathname: string | null): NavbarInkTone {
  return resolvePathNavbarTone(pathname);
}

const LUMINANCE_LIGHT_THRESHOLD = 0.58;

function luminanceFromRgb(r: number, g: number, b: number) {
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

export function inkFromLuminance(luminance: number): NavbarInkTone {
  return luminance >= LUMINANCE_LIGHT_THRESHOLD ? "dark" : "light";
}

export function inkFromLuminanceSamples(samples: number[]): NavbarInkTone | null {
  if (samples.length === 0) return null;
  const maxLuminance = Math.max(...samples);
  return inkFromLuminance(maxLuminance);
}

export function inkFromHexColor(hex: string | null | undefined): NavbarInkTone | null {
  if (!hex) return null;
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return inkFromLuminance(luminanceFromRgb(r, g, b));
}

export function resolveNavbarInkFromShowcase(
  showcase: { navbarInk?: NavbarInkTone },
  dominantColor?: string | null
): NavbarInkTone {
  return showcase.navbarInk ?? inkFromHexColor(dominantColor) ?? "light";
}

export function resolveNavbarSampleXsFromRect(left: number, width: number) {
  return NAVBAR_SAMPLE_X_RATIOS.map((ratio) => Math.round(left + width * ratio));
}

export function getNavbarSampleXs() {
  const bar = document.querySelector(".TOP_NAVBAR .adaptive-navbar__bar");
  const barRect = bar?.getBoundingClientRect();

  if (barRect && barRect.width > 0) {
    return resolveNavbarSampleXsFromRect(barRect.left, barRect.width);
  }

  return resolveNavbarSampleXsFromRect(0, window.innerWidth);
}

export function getNavbarSampleY() {
  const navRoot = document.querySelector(".TOP_NAVBAR");
  const bar = navRoot?.querySelector(".adaptive-navbar__bar");
  const barRect = bar?.getBoundingClientRect();

  if (barRect && barRect.height > 0) {
    return Math.min(Math.max(barRect.top + barRect.height * 0.52, 16), window.innerHeight - 1);
  }

  const navRect = navRoot?.getBoundingClientRect();
  return Math.min(Math.max((navRect?.bottom ?? 76) - 24, 16), window.innerHeight - 1);
}

function samplePixels(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let total = 0;
  let count = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    total += luminanceFromRgb(pixels[index], pixels[index + 1], pixels[index + 2]);
    count += 1;
  }

  return count > 0 ? total / count : null;
}

function sampleImageAtViewport(image: HTMLImageElement, sampleX: number, sampleY: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;

  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || sampleY < rect.top || sampleY > rect.bottom) return null;
  if (sampleX < rect.left || sampleX > rect.right) return null;

  const sampleWidth = Math.min(48, image.naturalWidth);
  const sampleHeight = Math.min(32, image.naturalHeight);
  const relativeX = (sampleX - rect.left) / rect.width;
  const relativeY = (sampleY - rect.top) / rect.height;
  const sourceX = Math.max(
    0,
    Math.min(Math.round(relativeX * image.naturalWidth - sampleWidth / 2), image.naturalWidth - sampleWidth)
  );
  const sourceY = Math.max(
    0,
    Math.min(Math.round(relativeY * image.naturalHeight - sampleHeight / 2), image.naturalHeight - sampleHeight)
  );

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  try {
    context.drawImage(image, sourceX, sourceY, sampleWidth, sampleHeight, 0, 0, sampleWidth, sampleHeight);
    return samplePixels(context, sampleWidth, sampleHeight);
  } catch {
    return null;
  }
}

function sampleVideoAtViewport(video: HTMLVideoElement, sampleX: number, sampleY: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || video.videoWidth <= 0 || video.videoHeight <= 0 || video.readyState < 2) return null;

  const rect = video.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || sampleY < rect.top || sampleY > rect.bottom) return null;
  if (sampleX < rect.left || sampleX > rect.right) return null;

  const sampleWidth = Math.min(48, video.videoWidth);
  const sampleHeight = Math.min(32, video.videoHeight);
  const relativeX = (sampleX - rect.left) / rect.width;
  const relativeY = (sampleY - rect.top) / rect.height;
  const sourceX = Math.max(
    0,
    Math.min(Math.round(relativeX * video.videoWidth - sampleWidth / 2), video.videoWidth - sampleWidth)
  );
  const sourceY = Math.max(
    0,
    Math.min(Math.round(relativeY * video.videoHeight - sampleHeight / 2), video.videoHeight - sampleHeight)
  );

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  try {
    context.drawImage(video, sourceX, sourceY, sampleWidth, sampleHeight, 0, 0, sampleWidth, sampleHeight);
    return samplePixels(context, sampleWidth, sampleHeight);
  } catch {
    return null;
  }
}

export function isNavbarWithinSection(section: Element, sampleY: number) {
  const rect = section.getBoundingClientRect();
  return rect.top <= sampleY && rect.bottom > rect.top;
}

function effectiveSampleYForMedia(mediaRect: DOMRect, sampleY: number) {
  if (sampleY < mediaRect.top) {
    return mediaRect.top + Math.min(16, Math.max(4, mediaRect.height * 0.08));
  }

  if (sampleY > mediaRect.bottom) {
    return mediaRect.bottom - Math.min(16, Math.max(4, mediaRect.height * 0.08));
  }

  return sampleY;
}

function luminanceFromMediaElementAtViewport(
  element: HTMLImageElement | HTMLVideoElement,
  sampleX: number,
  sampleY: number
) {
  const rect = element.getBoundingClientRect();
  const effectiveSampleY = effectiveSampleYForMedia(rect, sampleY);
  const clampedSampleX = Math.min(Math.max(sampleX, rect.left), rect.right);

  return element instanceof HTMLVideoElement
    ? sampleVideoAtViewport(element, clampedSampleX, effectiveSampleY)
    : sampleImageAtViewport(element, clampedSampleX, effectiveSampleY);
}

function luminanceSamplesFromMediaElement(
  element: HTMLImageElement | HTMLVideoElement,
  sampleXs: number[],
  sampleY: number
) {
  const samples: number[] = [];

  for (const sampleX of sampleXs) {
    const luminance = luminanceFromMediaElementAtViewport(element, sampleX, sampleY);
    if (luminance !== null) samples.push(luminance);
  }

  return samples;
}

function toneFromMediaElement(
  element: HTMLImageElement | HTMLVideoElement,
  sampleXs: number[],
  sampleY: number
): NavbarInkTone | null {
  return inkFromLuminanceSamples(luminanceSamplesFromMediaElement(element, sampleXs, sampleY));
}

function toneFromCatalogHeroSampling(sampleXs: number[], sampleY: number): NavbarInkTone | null {
  const catalogSection = document.querySelector(".catalog-hero-section--showcase");
  const catalogImage = document.querySelector<HTMLImageElement>(
    ".catalog-hero-section--showcase .catalog-hero-image-section__asset"
  );

  if (!catalogSection || !catalogImage || !isNavbarWithinSection(catalogSection, sampleY)) {
    return null;
  }

  const sampledTone = toneFromMediaElement(catalogImage, sampleXs, sampleY);
  if (sampledTone) return sampledTone;

  return inkFromHexColor(catalogSection.getAttribute("data-hero-dominant-color"));
}

function toneFromHomeHeroSampling(sampleXs: number[], sampleY: number): NavbarInkTone | null {
  const activeHomeSlide = document.querySelector('#hero [data-hero-slide-state="active"]');
  const homeHero = document.querySelector("#hero");

  if (!activeHomeSlide || !homeHero || !isNavbarWithinSection(homeHero, sampleY)) {
    return null;
  }

  const video = activeHomeSlide.querySelector("video");
  if (video instanceof HTMLVideoElement) {
    const tone = toneFromMediaElement(video, sampleXs, sampleY);
    if (tone) return tone;
  }

  const image = activeHomeSlide.querySelector("img");
  if (image instanceof HTMLImageElement) {
    const tone = toneFromMediaElement(image, sampleXs, sampleY);
    if (tone) return tone;
  }

  return toneFromSurfaceElement(homeHero);
}

function toneFromSurfaceElement(surface: Element): NavbarInkTone | null {
  const navbarInk = surface.getAttribute("data-navbar-ink");
  if (navbarInk === "light" || navbarInk === "dark") return navbarInk;

  const backgroundTone = surface.getAttribute("data-navbar-tone");
  if (backgroundTone === "dark") return "light";
  if (backgroundTone === "light") return "dark";

  return null;
}

export function toneFromHeroMediaSampling(sampleY = getNavbarSampleY()): NavbarInkTone | null {
  const sampleXs = getNavbarSampleXs();

  const catalogTone = toneFromCatalogHeroSampling(sampleXs, sampleY);
  if (catalogTone) return catalogTone;

  const homeTone = toneFromHomeHeroSampling(sampleXs, sampleY);
  if (homeTone) return homeTone;

  const shelfHero = document.querySelector(".productShelfHero");
  const shelfImage = document.querySelector<HTMLImageElement>(".productShelfHero img");
  if (shelfHero && shelfImage && isNavbarWithinSection(shelfHero, sampleY)) {
    const tone = toneFromMediaElement(shelfImage, sampleXs, sampleY);
    if (tone) return tone;
  }

  const loginHero = document.querySelector("[data-login-hero-surface] .heroImage");
  const loginSurface = document.querySelector("[data-login-hero-surface]");
  if (loginHero instanceof HTMLImageElement && loginSurface && isNavbarWithinSection(loginSurface, sampleY)) {
    const tone = toneFromMediaElement(loginHero, sampleXs, sampleY);
    if (tone) return tone;
  }

  return null;
}
