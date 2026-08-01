"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { resolveLoginHeroTier, type LoginHeroTier } from "@/lib/login-hero-tier";
import styles from "./login.module.css";

/** Same-origin CDN proxy — Next image optimizer cannot reliably fetch Supabase directly (timeouts → blank bg). */
const LOGIN_BG_SRC =
  "/cdn-media/storage/v1/object/public/mithron-story/storefront/shell/login-bg.webp";

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
        alt=""
        fill
        sizes="100vw"
        quality={92}
        decoding="async"
        priority={priority}
        className={styles.heroImage}
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
