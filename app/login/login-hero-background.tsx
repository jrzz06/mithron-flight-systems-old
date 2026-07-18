"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { resolveLoginHeroTier, type LoginHeroTier } from "@/lib/login-hero-tier";
import styles from "./login.module.css";

/** Supabase CDN master — delivered capped at 1920px via Next image optimizer. */
const LOGIN_BG_SRC =
  "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-story/storefront/shell/login-bg.webp";

const LOGIN_HERO_WIDTH = 1920;
const LOGIN_HERO_HEIGHT = 1080;
const SUBJECT_FOCUS = "36% 46%";

function subscribeToLoginHeroTier() {
  return () => undefined;
}

function getLoginHeroTierSnapshot(): LoginHeroTier {
  return resolveLoginHeroTier();
}

function getLoginHeroTierServerSnapshot(): LoginHeroTier {
  return "lite";
}

type LoginHeroBackgroundProps = {
  priority?: boolean;
};

export function LoginHeroBackground({ priority = true }: LoginHeroBackgroundProps) {
  const tier = useSyncExternalStore(subscribeToLoginHeroTier, getLoginHeroTierSnapshot, getLoginHeroTierServerSnapshot);

  const showSkyMotion = tier !== "lite";
  const showNearLayer = tier === "premium";

  return (
    <div className={styles.heroLayer} data-hero-tier={tier} aria-hidden="true">
      <Image
        src={LOGIN_BG_SRC}
        width={LOGIN_HERO_WIDTH}
        height={LOGIN_HERO_HEIGHT}
        alt=""
        className={styles.heroImage}
        sizes="(max-width: 1280px) 100vw, 1920px"
        quality={92}
        decoding="async"
        priority={priority}
        style={{ objectPosition: SUBJECT_FOCUS }}
      />

      {showSkyMotion ? (
        <div className={styles.heroSkyBlur} aria-hidden="true">
          <div className={`${styles.heroSkyDrift} ${styles.heroSkyDriftFar}`}>
            <div className={styles.heroImageSky} />
          </div>
          {showNearLayer ? (
            <div className={`${styles.heroSkyDrift} ${styles.heroSkyDriftNear}`}>
              <div className={`${styles.heroImageSky} ${styles.heroImageSkyNear}`} />
            </div>
          ) : null}
          {showNearLayer ? <div className={styles.heroSkyHaze} /> : null}
        </div>
      ) : null}

      <div className={styles.heroSubjectLift} />
      <div className={styles.heroScrim} />
      <div className={styles.heroVignette} />
    </div>
  );
}
