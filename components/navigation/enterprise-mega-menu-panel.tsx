"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { EditorRenderedHtml } from "@/components/editor/editor-rendered-html";
import type { EnterpriseMenuConfig, EnterpriseMenuOption, FeaturedMenuCard, MegaMenuConfig } from "@/lib/nav-menu-types";

function getFeaturedCard(menu: MegaMenuConfig, featureKey: string | undefined) {
  return menu.featured.find((card) => card.key === featureKey) ?? menu.featured.find((card) => card.key === menu.defaultFeatureKey) ?? menu.featured[0];
}

export function EnterpriseMegaMenuPanel({
  menu,
  open,
  featuredKey,
  onFeatureIntent,
  onRouteIntent,
  onClose
}: {
  menu: EnterpriseMenuConfig;
  open: boolean;
  featuredKey?: string;
  onFeatureIntent: (featureKey: string | undefined) => void;
  onRouteIntent: (href: string) => void;
  onClose: () => void;
}) {
  if (menu.type === "compact") {
    return (
      <div
        id={`enterprise-menu-${menu.key}`}
        role="region"
        aria-label={`${menu.label} dropdown`}
        aria-hidden={!open}
        className={`enterprise-mega-menu-shell enterprise-mega-menu-shell--compact ${open ? "is-open" : ""}`}
      >
        <div className="enterprise-mega-menu enterprise-mega-menu--compact">
          <p className="enterprise-mega-menu__eyebrow">{menu.eyebrow}</p>
          <div className="enterprise-compact-menu__grid">
            {menu.items.map((item) => (
              <EnterpriseMenuLink
                key={item.label}
                item={item}
                interactive={open}
                onRouteIntent={onRouteIntent}
                onFeatureIntent={onFeatureIntent}
                onClose={onClose}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (menu.type === "franchise") {
    return (
      <div
        id={`enterprise-menu-${menu.key}`}
        role="region"
        aria-label={`${menu.label} dropdown`}
        aria-hidden={!open}
        className={`enterprise-mega-menu-shell enterprise-mega-menu-shell--franchise ${open ? "is-open" : ""}`}
      >
        <div className="enterprise-mega-menu enterprise-mega-menu--franchise">
          <div className="enterprise-franchise-menu__copy">
            <p className="enterprise-mega-menu__eyebrow">{menu.eyebrow}</p>
            <h2>{menu.headline}</h2>
            <EditorRenderedHtml html={menu.body} className="enterprise-franchise-menu__body" />
            <div className="enterprise-franchise-menu__links">
              {menu.items.map((item) => (
                <EnterpriseMenuLink
                  key={item.label}
                  item={item}
                  interactive={open}
                  onRouteIntent={onRouteIntent}
                  onFeatureIntent={onFeatureIntent}
                  onClose={onClose}
                />
              ))}
            </div>
          </div>
          <EnterpriseFeaturedCard card={menu.card} interactive={open} onRouteIntent={onRouteIntent} onClose={onClose} />
        </div>
      </div>
    );
  }

  const feature = getFeaturedCard(menu, featuredKey);
  if (!feature) return null;

  return (
    <div
      id={`enterprise-menu-${menu.key}`}
      role="region"
      aria-label={`${menu.label} mega menu`}
      aria-hidden={!open}
      className={`enterprise-mega-menu-shell ${open ? "is-open" : ""}`}
    >
      <div className="enterprise-mega-menu" data-menu-kind="mega">
        <div className="enterprise-mega-menu__catalog">
          <div className="enterprise-mega-menu__column">
            <p className="enterprise-mega-menu__eyebrow">{menu.eyebrow}</p>
            <h2>{menu.columnOneTitle}</h2>
            <div className="enterprise-mega-menu__links">
              {menu.columnOne.map((item) => (
                <EnterpriseMenuLink
                  key={item.label}
                  item={item}
                  interactive={open}
                  activeFeatureKey={feature.key}
                  onRouteIntent={onRouteIntent}
                  onFeatureIntent={onFeatureIntent}
                  onClose={onClose}
                />
              ))}
            </div>
          </div>

          <div className="enterprise-mega-menu__column">
            <h2>{menu.columnTwoTitle}</h2>
            <div className="enterprise-mega-menu__links">
              {menu.columnTwo.map((item) => (
                <EnterpriseMenuLink
                  key={item.label}
                  item={item}
                  interactive={open}
                  activeFeatureKey={feature.key}
                  onRouteIntent={onRouteIntent}
                  onFeatureIntent={onFeatureIntent}
                  onClose={onClose}
                />
              ))}
            </div>
          </div>
        </div>

        <EnterpriseFeaturedCard
          card={feature}
          variant="preview"
          interactive={open}
          onRouteIntent={onRouteIntent}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

function EnterpriseMenuThumb({ src, eager }: { src: string; eager: boolean }) {
  return (
    <span className="enterprise-mega-menu__link-thumb-wrap" aria-hidden="true">
      <MithronThumbImage
        src={src}
        alt=""
        width={48}
        height={48}
        sizes="48px"
        fill={false}
        loading={eager ? "eager" : "lazy"}
        priority={eager}
        wrapperClassName="enterprise-mega-menu__link-thumb-frame"
        className="enterprise-mega-menu__link-thumb"
      />
    </span>
  );
}

function EnterpriseMenuLink({
  item,
  interactive,
  activeFeatureKey,
  onFeatureIntent,
  onRouteIntent,
  onClose
}: {
  item: EnterpriseMenuOption;
  interactive: boolean;
  activeFeatureKey?: string;
  onFeatureIntent: (featureKey: string | undefined) => void;
  onRouteIntent: (href: string) => void;
  onClose: () => void;
}) {
  const isActive = Boolean(activeFeatureKey && item.featureKey === activeFeatureKey);

  return (
    <Link
      href={item.href}
      prefetch={false}
      tabIndex={interactive ? undefined : -1}
      className={`enterprise-mega-menu__link${isActive ? " is-active" : ""}`}
      aria-current={isActive ? "true" : undefined}
      onFocus={() => {
        onFeatureIntent(item.featureKey);
        onRouteIntent(item.href);
      }}
      onPointerEnter={() => {
        onFeatureIntent(item.featureKey);
        onRouteIntent(item.href);
      }}
      onClick={onClose}
    >
      <span className="enterprise-mega-menu__link-content">
        {item.thumbnail ? <EnterpriseMenuThumb src={item.thumbnail} eager={interactive} /> : null}
        <span className="enterprise-mega-menu__link-label">{item.label}</span>
      </span>
      <ArrowRight className="enterprise-mega-menu__link-arrow size-3.5" aria-hidden="true" />
    </Link>
  );
}

function EnterpriseFeaturedCard({
  card,
  variant = "full",
  interactive,
  onRouteIntent,
  onClose
}: {
  card: FeaturedMenuCard;
  variant?: "preview" | "full";
  interactive: boolean;
  onRouteIntent: (href: string) => void;
  onClose: () => void;
}) {
  const isPreview = variant === "preview";
  const ctaLabel = isPreview ? "View Product" : card.ctaLabel;

  return (
    <div className={`enterprise-feature-card${isPreview ? " enterprise-feature-card--preview" : ""}`}>
      <div key={card.key} className="enterprise-feature-card__anim">
        <div className="enterprise-feature-card__media" aria-hidden="true">
          <MithronCardImage
            src={card.image}
            alt=""
            fill
            sizes={isPreview ? "(max-width: 1200px) 28vw, 300px" : "(max-width: 1200px) 30vw, 320px"}
            className="object-contain"
            priority={interactive}
          />
        </div>
        <div className="enterprise-feature-card__body">
          {!isPreview ? <p className="enterprise-mega-menu__eyebrow">{card.eyebrow}</p> : null}
          <h3>{card.name}</h3>
          <EditorRenderedHtml html={card.body} className="enterprise-feature-card__description" />
          {card.price ? (
            <p className="enterprise-feature-card__price">
              {isPreview ? `From ${card.price}` : card.price}
            </p>
          ) : null}
          {!isPreview ? (
            <dl className="enterprise-feature-card__specs">
              {card.specs.map((spec) => (
                <div key={`${card.key}-${spec.label}`}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <Link
            href={card.href}
            prefetch={false}
            tabIndex={interactive ? undefined : -1}
            className={isPreview ? "enterprise-mega-menu__preview-cta" : "enterprise-feature-card__cta"}
            onFocus={() => onRouteIntent(card.href)}
            onPointerEnter={() => onRouteIntent(card.href)}
            onClick={onClose}
          >
            {ctaLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <span className="sr-only">{card.imageAlt}</span>
      </div>
    </div>
  );
}
