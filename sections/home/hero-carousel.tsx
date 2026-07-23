"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "@/components/icons/storefront-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import type { HeroSlide } from "@/config/types";
import { resolveHomepageSlideNavbarInk } from "@/config/navbar-ink-registry";
import { resolveHeroCarouselSlides as pickHeroCarouselSlides } from "@/lib/media/resolve-hero-carousel-slides";
import { MithronPageHeroImage } from "@/components/media/mithron-page-hero-image";
import { resolveHeroSlideSrc } from "@/lib/media/resolve-storefront-src";
import { useCarouselSwipe } from "@/hooks/use-carousel-swipe";
import { useReducedMotionPreference } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { Heading } from "@/components/ui/heading";

const HERO_ADVANCE_MS = 5000;

function resolveHeroCarouselSlides(slides: HeroSlide[]) {
  return pickHeroCarouselSlides(slides);
}

type HeroInkTone = "light" | "dark" | "split";

type HeroImageComposition = {
  focalPoint: string;
  desktopObjectPosition: string;
  mobileObjectPosition: string;
  desktopTransform: string;
  mobileTransform: string;
  desktopFilter: string;
  mobileFilter: string;
};

const defaultHeroComposition: HeroImageComposition = {
  focalPoint: "center",
  desktopObjectPosition: "right center",
  mobileObjectPosition: "center center",
  desktopTransform: "translate3d(0, 0, 0) scale(1)",
  mobileTransform: "translate3d(0, 0, 0) scale(1)",
  desktopFilter: "none",
  mobileFilter: "none"
};

const heroImageComposition: Record<string, HeroImageComposition> = {
  "ag10-arrival": {
    focalPoint: "right-center drone over glacial terrain at sunrise",
    desktopObjectPosition: "72% 52%",
    mobileObjectPosition: "78% 47%",
    desktopTransform: "translate3d(0, 0, 0) scale(1.08)",
    mobileTransform: "translate3d(0, 0, 0) scale(1.1)",
    desktopFilter: "none",
    mobileFilter: "saturate(1.06) contrast(1.04)"
  },
  "mapping-flight": {
    focalPoint: "center caged drone over night sports court",
    desktopObjectPosition: "62% 58%",
    mobileObjectPosition: "66% 48%",
    desktopTransform: "translate3d(0, 0, 0) scale(1.08)",
    mobileTransform: "translate3d(0, 0, 0) scale(1.1)",
    desktopFilter: "none",
    mobileFilter: "saturate(1.05) contrast(1.03)"
  },
  "drone-ecosystem": {
    focalPoint: "upper-right medical delivery drone over coastal horizon",
    desktopObjectPosition: "90% 52%",
    mobileObjectPosition: "82% 42%",
    desktopTransform: "translate3d(0, 0, 0) scale(1.08)",
    mobileTransform: "translate3d(0, 0, 0) scale(1.1)",
    desktopFilter: "none",
    mobileFilter: "saturate(1.05) contrast(1.03)"
  }
};

// Ink tone for hero copy: "light" = white text, "dark" = dark text, "split" = dark title + white subtitle.
const heroTextInkBySlide: Record<string, HeroInkTone> = {
  "ag10-arrival": "dark",
  "mapping-flight": "light",
  "drone-ecosystem": "light"
};

const heroTextInkByIndex: HeroInkTone[] = ["dark", "light", "dark"];

function resolveHeroTextInk(slide: HeroSlide, slideIndex: number): HeroInkTone {
  const presetInk = heroTextInkBySlide[slide.id];
  if (presetInk) return presetInk;

  const indexInk = heroTextInkByIndex[slideIndex];
  if (indexInk) return indexInk;

  if (slide.composition?.textTone === "light" || slide.composition?.textTone === "dark" || slide.composition?.textTone === "split") {
    return slide.composition.textTone;
  }

  return slide.theme === "dark" ? "light" : "dark";
}

function getHeroImageComposition(slide: HeroSlide) {
  const preset = heroImageComposition[slide.id];
  const composition = slide.composition;

  return {
    focalPoint: preset?.focalPoint ?? slide.image.alt,
    desktopObjectPosition:
      preset?.desktopObjectPosition
      ?? composition?.mediaPosition
      ?? defaultHeroComposition.desktopObjectPosition,
    mobileObjectPosition:
      preset?.mobileObjectPosition
      ?? composition?.mobileMediaPosition
      ?? defaultHeroComposition.mobileObjectPosition,
    desktopTransform: preset?.desktopTransform ?? defaultHeroComposition.desktopTransform,
    mobileTransform: preset?.mobileTransform ?? defaultHeroComposition.mobileTransform,
    desktopFilter: preset?.desktopFilter ?? defaultHeroComposition.desktopFilter,
    mobileFilter: preset?.mobileFilter ?? defaultHeroComposition.mobileFilter
  };
}

function getHeroContentInk(slide: HeroSlide, slideIndex: number): HeroInkTone {
  return resolveHeroTextInk(slide, slideIndex);
}

function getHeroNavbarInk(slide: HeroSlide, slideIndex: number): HeroInkTone {
  const registryInk = resolveHomepageSlideNavbarInk(slide.id);
  if (registryInk) return registryInk;

  const ink = resolveHeroTextInk(slide, slideIndex);
  if (ink === "split") return "light";
  return ink;
}

function getSlideTone(contentInk: HeroInkTone) {
  if (contentInk === "split") {
    return {
      section: "bg-black text-white",
      text: "text-[#0a0d11]",
      body: "text-[rgba(255,255,255,.92)]",
      cta: "hero-banner-cta--light focus-visible:ring-white focus-visible:ring-offset-black",
      control: "border-[rgba(255,255,255,.28)] bg-[rgba(255,255,255,.16)] text-[#ffffff] hover:bg-[rgba(255,255,255,.24)] hover:border-[rgba(255,255,255,.40)]",
      dots: "bg-[rgba(255,255,255,.44)]",
      activeDot: "bg-[#ffffff]"
    };
  }

  if (contentInk === "light") {
    return {
      section: "bg-black text-white",
      text: "text-[#ffffff]",
      body: "text-[rgba(255,255,255,.82)]",
      cta: "hero-banner-cta--dark focus-visible:ring-white focus-visible:ring-offset-black",
      control: "border-[rgba(255,255,255,.28)] bg-[rgba(255,255,255,.16)] text-[#ffffff] hover:bg-[rgba(255,255,255,.24)] hover:border-[rgba(255,255,255,.40)]",
      dots: "bg-[rgba(255,255,255,.44)]",
      activeDot: "bg-[#ffffff]"
    };
  }

  return {
    section: "bg-[#f6f7f8] text-[#111113]",
    text: "text-[#111113]",
    body: "text-[rgba(0,0,0,.74)]",
    cta: "hero-banner-cta--light focus-visible:ring-black focus-visible:ring-offset-white",
    control: "border-[rgba(0,0,0,.16)] bg-[rgba(255,255,255,.68)] text-[#111113] hover:bg-[rgba(255,255,255,.86)] hover:border-[rgba(0,0,0,.24)]",
    dots: "bg-[rgba(0,0,0,.24)]",
    activeDot: "bg-[rgba(0,0,0,.72)]"
  };
}

export function HeroCarousel({
  slides = [],
  cmsSectionKey
}: {
  slides?: HeroSlide[];
  cmsSectionKey?: string;
}) {
  const safeSlides = resolveHeroCarouselSlides(slides);
  const [index, setIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const reducedMotion = useReducedMotionPreference();
  const advanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIndex = Math.min(index, Math.max(safeSlides.length - 1, 0));
  const slide = safeSlides[activeIndex];
  const contentInk = slide ? getHeroContentInk(slide, activeIndex) : "light";
  const navbarInk = slide ? getHeroNavbarInk(slide, activeIndex) : "light";
  const tone = getSlideTone(contentInk);

  const getSlideState = (itemIndex: number) => {
    if (itemIndex === activeIndex) return "active";
    if (itemIndex === (activeIndex - 1 + safeSlides.length) % safeSlides.length) return "previous";
    return "inactive";
  };

  const slideCount = safeSlides.length;

  const goToSlide = useCallback((nextIndex: number) => {
    if (!slideCount) return;
    setIndex((nextIndex + slideCount) % slideCount);
  }, [slideCount]);

  const heroSwipe = useCarouselSwipe({
    enabled: safeSlides.length > 1,
    onSwipeLeft: () => setIndex((current) => (current + 1) % slideCount),
    onSwipeRight: () => setIndex((current) => (current - 1 + slideCount) % slideCount),
    onInteractionStart: () => setIsHovered(true),
    onInteractionEnd: () => setIsHovered(false)
  });

  useEffect(() => {
    if (reducedMotion || safeSlides.length < 2 || isHovered) return;

    advanceTimerRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setIndex((current) => (current + 1) % safeSlides.length);
    }, HERO_ADVANCE_MS);

    return () => {
      if (advanceTimerRef.current) {
        clearInterval(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, [activeIndex, isHovered, reducedMotion, safeSlides.length]);

  if (!slide) {
    return (
      <section
        id="hero"
        data-testid="home-hero"
        data-cms-home-section={cmsSectionKey}
        data-cms-hero-empty-state
        data-navbar-ink="light"
        data-navbar-ink-surface=""
        className="grid min-h-[72svh] place-items-center bg-[#050505] px-6 text-center text-white"
      >
        <div className="max-w-xl">
          <Heading as="h1" variant="hero">
            Homepage banner unavailable
          </Heading>
          <p className="mt-4 text-sm leading-6 text-white/68">
            Published hero content is temporarily unavailable. Product browsing remains online.
          </p>
          <Link
            href="/products"
            className="type-button mt-7 inline-flex h-11 items-center rounded-full bg-white px-5 text-[#050505] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Explore products
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      id="hero"
      data-testid="home-hero"
      data-cms-home-section={cmsSectionKey}
      data-hero-system="mithron-native-fullscreen-carousel"
      data-active-hero-theme={slide.theme}
      data-hero-content-ink={contentInk}
      data-navbar-ink={navbarInk}
      data-navbar-ink-surface=""
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsHovered(false);
        }
      }}
      onTouchStart={heroSwipe.onTouchStart}
      onTouchEnd={heroSwipe.onTouchEnd}
      onTouchCancel={heroSwipe.onTouchCancel}
      onClickCapture={heroSwipe.onClickCapture}
      className="hero-premium-field relative isolate h-[min(72svh,520px)] min-h-[min(420px,72svh)] md:h-[80svh] md:min-h-[580px] w-full overflow-hidden bg-[#050505] touch-pan-y"
    >
      {safeSlides.map((item, itemIndex) => {
        const slideInk = getHeroContentInk(item, itemIndex);
        const overlayOpacity = slideInk === "light" || slideInk === "split" ? 0.36 : 0.22;
        return (
          <div
            key={item.id}
            data-testid={`hero-slide-${item.id}`}
            data-hero-slide-state={getSlideState(itemIndex)} // test-placeholder: data-hero-slide-state="active"
            data-hero-motion="static"
            className="absolute inset-0 hero-slide-frame"
            style={{ "--hero-slide-overlay-opacity": overlayOpacity } as CSSProperties}
            aria-hidden={itemIndex !== activeIndex}
          >
            {shouldMountHeroSlide(itemIndex, activeIndex, safeSlides.length) ? (
              <HeroBackdrop slide={item} reducedMotion={reducedMotion} />
            ) : null}
          </div>
        );
      })}

      <HeroControl
        label="Previous hero"
        side="left"
        className={tone.control}
        onClick={() => goToSlide(activeIndex - 1)}
      >
        <ChevronLeft className="size-5" />
      </HeroControl>

      <div className="hero-dji-layout pointer-events-none absolute inset-0 z-20">
        <div
          key={`${slide.id}-panel`}
          data-testid="hero-copy"
          className="hero-premium-copy hero-dji-copy-stack hero-dji-cinematic-copy pointer-events-auto"
        >
          <div className="hero-dji-content-unit">
            <div className="hero-dji-headline-row">
              <div className="hero-dji-headline-zone">
                <h1
                  key={`${slide.id}-title`}
                  className="hero-dji-title"
                >
                  {slide.title}
                </h1>
              </div>
            </div>
            <p
              key={`${slide.id}-subtitle`}
              className="hero-dji-subtitle"
            >
              {slide.subtitle}
            </p>
            <div className="hero-dji-cta-wrap">
              <HeroCta href={slide.href} label={slide.cta} className={tone.cta} />
            </div>
            <div data-testid="hero-pagination" className="hero-dji-pagination flex items-center gap-2">
              {safeSlides.map((item, itemIndex) => (
                <button
                  key={item.id}
                  data-testid={`hero-pagination-${item.id}`}
                  aria-label={`Go to hero slide ${itemIndex + 1}`}
                  aria-current={itemIndex === activeIndex ? "true" : "false"}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-3 transition-[background-color,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    itemIndex === activeIndex ? "opacity-100" : "opacity-80"
                  )}
                  onClick={() => goToSlide(itemIndex)}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "block h-1 rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      itemIndex === activeIndex ? cn("w-12", tone.activeDot) : cn("w-5", tone.dots)
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div data-testid="hero-product-stage" className="hero-dji-product-zone" aria-hidden="true" />
      </div>

      <HeroControl
        label="Next hero"
        side="right"
        className={tone.control}
        onClick={() => goToSlide(activeIndex + 1)}
      >
        <ChevronRight className="size-5" />
      </HeroControl>
    </section>
  );
}

function shouldMountHeroSlide(itemIndex: number, activeIndex: number, slideCount: number) {
  if (slideCount <= 1) return true;
  const previous = (activeIndex - 1 + slideCount) % slideCount;
  const next = (activeIndex + 1) % slideCount;
  return itemIndex === activeIndex || itemIndex === previous || itemIndex === next;
}

function HeroBackdrop({
  slide,
  reducedMotion
}: {
  slide: HeroSlide;
  reducedMotion: boolean;
}) {
  const composition = getHeroImageComposition(slide);
  const heroImageSrc = resolveHeroSlideSrc(slide.image.src, slide.id);
  const mobileOverrideSrc = slide.image.mobileOverride?.src
    ? resolveHeroSlideSrc(slide.image.mobileOverride.src, slide.id)
    : null;
  const posterSrc = resolveHeroSlideSrc(slide.poster?.src ?? slide.image.src, slide.id);
  const videoType = slide.video?.src?.endsWith(".webm")
    ? "video/webm"
    : slide.video?.src?.endsWith(".mov")
      ? "video/quicktime"
      : "video/mp4";
  const imageStyle = {
    "--hero-image-object-position": composition.desktopObjectPosition,
    "--hero-image-mobile-object-position": composition.mobileObjectPosition,
    "--hero-image-transform": composition.desktopTransform,
    "--hero-image-mobile-transform": composition.mobileTransform,
    "--hero-image-filter": composition.desktopFilter,
    "--hero-image-mobile-filter": composition.mobileFilter,
    "--hero-image-desktop-origin": composition.desktopObjectPosition,
    "--hero-image-mobile-origin": composition.mobileObjectPosition
  } as CSSProperties;
  const heroImageSizes = "(max-width: 767px) 750px, (max-width: 1279px) 1024px, 1920px";
  const heroImageClassName =
    "[filter:var(--hero-image-mobile-filter)] [object-position:var(--hero-image-mobile-object-position)] [transform:var(--hero-image-mobile-transform)] [transform-origin:var(--hero-image-mobile-origin)] md:[filter:var(--hero-image-filter)] md:[object-position:var(--hero-image-object-position)] md:[transform:var(--hero-image-transform)] md:[transform-origin:var(--hero-image-desktop-origin)]";

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Link
        href={slide.href}
        target={slide.href.startsWith("http") ? "_blank" : undefined}
        rel={slide.href.startsWith("http") ? "noopener noreferrer" : undefined}
        aria-label={`Explore ${slide.title}`}
        className="hero-banner-product-link block size-full outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface-page)]"
      >
        <div data-testid="hero-product-image" className="hero-banner-product-image hero-banner-media-bleed absolute inset-0">
          {slide.video?.src && !reducedMotion ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={posterSrc}
              aria-label={slide.video.alt || slide.image.alt}
              className="absolute inset-0 h-full w-full object-cover [filter:var(--hero-image-mobile-filter)] [object-position:var(--hero-image-mobile-object-position)] [transform:var(--hero-image-mobile-transform)] [transform-origin:var(--hero-image-mobile-origin)] md:[filter:var(--hero-image-filter)] md:[object-position:var(--hero-image-object-position)] md:[transform:var(--hero-image-transform)] md:[transform-origin:var(--hero-image-desktop-origin)]"
              style={imageStyle}
            >
              <source src={slide.video.src} type={videoType} />
            </video>
          ) : (
            <>
              <MithronPageHeroImage
                src={heroImageSrc}
                alt={slide.image.alt}
                fill
                priority={Boolean(slide.image.priority)}
                responsive={slide.image.responsive}
                sizes={heroImageSizes}
                className={`${heroImageClassName}${mobileOverrideSrc ? " hidden md:block" : ""}`}
                style={imageStyle}
              />
              {mobileOverrideSrc ? (
                <MithronPageHeroImage
                  src={mobileOverrideSrc}
                  alt={slide.image.mobileOverride?.alt || slide.image.alt}
                  fill
                  priority={Boolean(slide.image.priority)}
                  sizes="750px"
                  className={`${heroImageClassName} md:hidden`}
                  style={imageStyle}
                />
              ) : null}
            </>
          )}
        </div>
      </Link>
    </div>
  );
}

function HeroControl({
  label,
  side,
  className,
  onClick,
  children
}: {
  label: string;
  side: "left" | "right";
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "hero-carousel-control absolute z-30 hidden size-11 place-items-center rounded-full border opacity-70 transition-[opacity,background-color,border-color,color] duration-300 ease-[var(--ease-cinematic)] hover:opacity-100 md:grid",
        side === "left" ? "hero-carousel-control--left" : "hero-carousel-control--right",
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function HeroCta({ href, label, className }: { href: string; label: string; className: string }) {
  const external = href.startsWith("http");

  return (
    <Link
      data-testid="hero-primary-cta"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "hero-banner-cta hero-dji-cta inline-flex items-center justify-center rounded-full outline-none transition-[background,color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-cinematic)] focus-visible:ring-2 focus-visible:ring-offset-2",
        className
      )}
    >
      {label}
    </Link>
  );
}
