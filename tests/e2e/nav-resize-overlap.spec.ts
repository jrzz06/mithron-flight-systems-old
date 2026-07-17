import { expect, test, type Page } from "@playwright/test";

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

function boxesOverlap(a: Box, b: Box): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

async function visibleNavControlBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".nav-desktop-links .adaptive-navbar__link-wrap"))
      .filter((node) => {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      })
  );
}

async function shelfCardBoxes(page: Page, shelfId: string): Promise<Box[]> {
  return page.evaluate((id) => {
    const shelf = document.querySelector<HTMLElement>(`[data-shelf-id='${id}']`);
    if (!shelf) return [];

    return Array.from(
      shelf.querySelectorAll<HTMLElement>("[data-testid='home-product-card'], [data-testid='home-product-view-all-card']")
    )
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      });
  }, shelfId);
}

function assertNoOverlaps(boxes: Box[], label: string) {
  for (let index = 0; index < boxes.length; index += 1) {
    for (let other = index + 1; other < boxes.length; other += 1) {
      expect(boxesOverlap(boxes[index], boxes[other]), `${label} overlap at ${index}/${other}`).toBe(false);
    }
  }
}

test.describe("resize overlap guards", () => {
  test("desktop nav shows all links without overlap at 1280px and above", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");

    const desktopWidths = [1280, 1366, 1440];

    for (const width of desktopWidths) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);

      const navMode = await page.evaluate(() => {
        const desktopLinks = document.querySelector(".nav-desktop-links");
        const hamburger = document.querySelector(".nav-hamburger");
        const moreMenu = document.querySelector(".nav-more-menu");
        const desktopStyle = desktopLinks ? getComputedStyle(desktopLinks) : null;
        const hamburgerStyle = hamburger ? getComputedStyle(hamburger) : null;
        return {
          desktopVisible: desktopStyle?.display !== "none",
          hamburgerVisible: hamburgerStyle?.display !== "none",
          moreMenuCount: moreMenu ? 1 : 0,
          linkCount: desktopLinks?.querySelectorAll(".adaptive-navbar__link-wrap").length ?? 0
        };
      });

      expect(navMode.desktopVisible, `desktop links at ${width}px`).toBe(true);
      expect(navMode.hamburgerVisible, `hamburger hidden at ${width}px`).toBe(false);
      expect(navMode.moreMenuCount, `no More menu at ${width}px`).toBe(0);
      expect(navMode.linkCount, `all nav links at ${width}px`).toBeGreaterThanOrEqual(7);

      const navBoxes = await visibleNavControlBoxes(page);
      expect(navBoxes.length, `visible nav controls at ${width}px`).toBeGreaterThanOrEqual(7);
      assertNoOverlaps(navBoxes, `nav@${width}px`);

      const clippedLabels = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".nav-desktop-links .adaptive-navbar__label"))
          .filter((node) => {
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden") return false;
            return node.scrollWidth > node.clientWidth + 1;
          })
          .map((node) => node.textContent?.trim() ?? "")
      );

      expect(clippedLabels, `clipped nav labels at ${width}px`).toEqual([]);
    }
  });

  test("compact nav uses hamburger below 1280px", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");

    for (const width of [1024, 1180]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);

      const navMode = await page.evaluate(() => {
        const desktopLinks = document.querySelector(".nav-desktop-links");
        const hamburger = document.querySelector(".nav-hamburger");
        const desktopStyle = desktopLinks ? getComputedStyle(desktopLinks) : null;
        const hamburgerStyle = hamburger ? getComputedStyle(hamburger) : null;
        return {
          desktopVisible: desktopStyle?.display !== "none",
          hamburgerVisible: hamburgerStyle?.display !== "none"
        };
      });

      expect(navMode.desktopVisible, `desktop links hidden at ${width}px`).toBe(false);
      expect(navMode.hamburgerVisible, `hamburger at ${width}px`).toBe(true);
    }
  });

  test("home shelf cards do not overlap while resizing", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");

    const widths = [1024, 1180, 1280, 1366];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("[data-shelf-id='drone-world-shelf']").scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);

      const shelfBoxes = await shelfCardBoxes(page, "drone-world-shelf");
      expect(shelfBoxes.length, `shelf cards at ${width}px`).toBeGreaterThan(0);
      assertNoOverlaps(shelfBoxes, `shelf@${width}px`);
    }
  });
});
