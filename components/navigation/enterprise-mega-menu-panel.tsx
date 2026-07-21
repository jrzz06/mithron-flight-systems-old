"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/icons/storefront-icons";
import { MithronCardImage } from "@/components/media/mithron-card-image";
import { MithronThumbImage } from "@/components/media/mithron-thumb-image";
import { EditorRenderedHtml } from "@/components/editor/editor-rendered-html";
import type { EnterpriseMenuOption, FeaturedMenuCard, MegaMenuConfig } from "@/lib/nav-menu-types";

function getFeaturedCard(menu: MegaMenuConfig, featureKey: string | undefined) {
  return menu.featured.find((card) => card.key === featureKey) ?? menu.featured.find((card) => card.key === menu.defaultFeatureKey) ?? menu.featured[0];
}

export function EnterpriseMegaMenuPanel({
  menus,
  activeCategoryKey,
  open,
  featuredKey,
  onCategoryIntent,
  onFeatureIntent,
  onRouteIntent,
  onClose
}: {
  menus: MegaMenuConfig[];
  activeCategoryKey: string;
  open: boolean;
  featuredKey?: string;
  onCategoryIntent: (categoryKey: string) => void;
  onFeatureIntent: (featureKey: string | undefined) => void;
  onRouteIntent: (href: string) => void;
  onClose: () => void;
}) {
  const activeMenu = menus.find((menu) => menu.key === activeCategoryKey) ?? menus[0];
  if (!activeMenu) return null;

  const feature = getFeaturedCard(activeMenu, featuredKey);
  if (!feature) return null;

  return (
    <div
      id="enterprise-mega-menu"
      role="region"
      aria-label="Mithron product mega menu"
      aria-hidden={!open}
      className={`enterprise-mega-menu-shell ${open ? "is-open" : ""}`}
      onPointerEnter={() => onCategoryIntent(activeMenu.key)}
    >
      <div className="enterprise-mega-menu" data-menu-kind="mega">
        <aside className="enterprise-mega-menu__categories" aria-label="Product categories">
          <p className="enterprise-mega-menu__eyebrow">Categories</p>
          <div className="enterprise-mega-menu__category-list">
            {menus.map((menu) => {
              const isActive = menu.key === activeMenu.key;
              return (
                <Link
                  key={menu.key}
                  href={menu.href}
                  prefetch={false}
                  tabIndex={open ? undefined : -1}
                  className={`enterprise-mega-menu__category${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  onFocus={() => {
                    onCategoryIntent(menu.key);
                    onRouteIntent(menu.href);
                  }}
                  onPointerEnter={() => {
                    onCategoryIntent(menu.key);
                    onRouteIntent(menu.href);
                  }}
                  onClick={onClose}
                >
                  <span className="enterprise-mega-menu__category-copy">
                    <span className="enterprise-mega-menu__category-label">{menu.label}</span>
                    {typeof menu.productCount === "number" ? (
                      <span className="enterprise-mega-menu__category-count">{menu.productCount}</span>
                    ) : null}
                  </span>
                  <ArrowRight className="enterprise-mega-menu__category-arrow size-3.5" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </aside>

        <div className="enterprise-mega-menu__products" aria-label={`${activeMenu.label} products`}>
          <p className="enterprise-mega-menu__eyebrow">{activeMenu.eyebrow}</p>
          <h2 className="enterprise-mega-menu__products-title">{activeMenu.columnOneTitle}</h2>
          <div className="enterprise-mega-menu__links">
            {activeMenu.columnOne.map((item) => (
              <EnterpriseMenuLink
                key={`${activeMenu.key}-${item.label}`}
                item={item}
                interactive={open}
                activeFeatureKey={feature.key}
                onRouteIntent={onRouteIntent}
                onFeatureIntent={onFeatureIntent}
                onClose={onClose}
              />
            ))}
          </div>
          <Link
            href={activeMenu.href}
            prefetch={false}
            tabIndex={open ? undefined : -1}
            className="enterprise-mega-menu__view-all"
            onFocus={() => onRouteIntent(activeMenu.href)}
            onPointerEnter={() => onRouteIntent(activeMenu.href)}
            onClick={onClose}
          >
            View all {activeMenu.label}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="enterprise-mega-menu__preview" aria-label="Product preview">
          <EnterpriseFeaturedCard
            card={feature}
            variant="preview"
            interactive={open}
            onRouteIntent={onRouteIntent}
            onClose={onClose}
          />
        </div>
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
            sizes={isPreview ? "(max-width: 1200px) 36vw, 420px" : "(max-width: 1200px) 30vw, 320px"}
            className="object-contain"
            priority={interactive}
          />
        </div>
        {isPreview ? (
          <div className="enterprise-feature-card__info">
            <h3>{card.name}</h3>
            {card.eyebrow ? <p className="enterprise-feature-card__meta">{card.eyebrow}</p> : null}
            {card.price ? <p className="enterprise-feature-card__price">{card.price}</p> : null}
            <Link
              href={card.href}
              prefetch={false}
              tabIndex={interactive ? undefined : -1}
              className="enterprise-mega-menu__preview-cta"
              onFocus={() => onRouteIntent(card.href)}
              onPointerEnter={() => onRouteIntent(card.href)}
              onClick={onClose}
            >
              {ctaLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="enterprise-feature-card__body">
            <p className="enterprise-mega-menu__eyebrow">{card.eyebrow}</p>
            <h3>{card.name}</h3>
            <EditorRenderedHtml html={card.body} className="enterprise-feature-card__description" />
            {card.price ? <p className="enterprise-feature-card__price">{card.price}</p> : null}
            <dl className="enterprise-feature-card__specs">
              {card.specs.map((spec) => (
                <div key={`${card.key}-${spec.label}`}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
            <Link
              href={card.href}
              prefetch={false}
              tabIndex={interactive ? undefined : -1}
              className="enterprise-feature-card__cta"
              onFocus={() => onRouteIntent(card.href)}
              onPointerEnter={() => onRouteIntent(card.href)}
              onClick={onClose}
            >
              {ctaLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        )}
        <span className="sr-only">{card.imageAlt}</span>
      </div>
    </div>
  );
}
