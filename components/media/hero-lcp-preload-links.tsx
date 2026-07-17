import type { LinkHTMLAttributes } from "react";
import type { HeroSlide } from "@/config/types";
import { getHeroLcpPreloadLinks } from "@/lib/media/hero-lcp-preload";

export function HeroLcpPreloadLinks({ slides }: { slides: HeroSlide[] }) {
  const links = getHeroLcpPreloadLinks(slides);

  return (
    <>
      {links.map((link) => (
        <link
          key={link.href}
          rel="preload"
          as="image"
          href={link.href}
          {...(link.type ? { type: link.type } : {})}
          {...(link.imageSrcSet ? { imageSrcSet: link.imageSrcSet } : {})}
          {...(link.imageSizes ? { imageSizes: link.imageSizes } : {})}
          {...({ fetchPriority: "high" } as LinkHTMLAttributes<HTMLLinkElement>)}
        />
      ))}
    </>
  );
}
