import { describe, expect, it } from "vitest";
import {
  decodeDescriptionEntities,
  isUnstructuredDescription,
  normalizeProductDescriptionHtml,
  parseProductDescriptionBlocks,
  structuredDescriptionBlocksToHtml
} from "@/lib/product-description-normalize";
import { getProductDescriptionHtml } from "@/lib/product-detail-content";
import type { Product } from "@/config/types";

const DGCA_BLOB =
  "DGCA Certification Details Certification Date: 15th January, 2025 Category: Agricultural Unmanned Aerial Vehicle (UAV) GST 5%Extra• Flight Controller 1• Hexa-copter• BLDC Motor (6. NoS)• Charger - 1• 21000 mAh Li-Ion Battery• Insurance• Transportation box Feature Specifications Drone Classification Medium UAV Maximum Endurance 19 Minutes Maximum Range 2 Km Maximum Flight Height 131.2 ft (40 meters) Operating Altitude Maximum Speed 10 m/s Battery Capacity 21,000 mAh All-Up Weight 28.700 kg Number of Motors 6 Payload Type Swappable Sprayer & Spreader Charger 1 Spreader Tank CAPACITY 8 Kg (ADDITIONAL SETUP) Navigation System Waypoint Capability Enabled Ground Control System Skydroid T12 Controller";

const AGRI_KISAN_BLOB =
  "8-Liter Agri Kisan Drone is a compact and efficient unmanned aerial system designed for precise agrochemical spraying across small to medium-sized farms. With an 8-liter payload capacity, it enables uniform application, optimized input usage, and reduced chemical wastage while ensuring operator safety. Its intelligent flight controls and stable performance help farmers improve crop health, increase productivity, and adopt sustainable, technology-driven farming practices.Agri Small Drone – 1 Unit16000Mah Battery Set – 1 SetDrone Battery Charger – 1 UnitTransmitter – 1 UnitToolkit with 10 Parts – 1 SetDrone Storage Box – 1 UnitBox Wheels – 1 SetUIN Number Plate Warranty Card";

const DASH_SPECS_BLOB =
  "Kg Flight Mode Options: Manual/Auto Category (As Per Dgca) - Medium Maximum Endurance (hr/m) - 22 minutes Battery Charging Time - 60-90 min Spray Width - 3 – 5 Metres Flight Mode Options - Manual / Semi-Autonomous / Autonomous Wind Resistance - Level 5 As Per Beaufort Scale Flight Speed - Upto 10 M/S (Recommended Upto 5 M/S) Frame Material - 3 K Carbon Fibre Other Features Radar Obstacle Avoidance Sensors, Live Video Feed Camera, Radio with in-built Screen & 4G SIM Slot";

const AVISPRAY_PACKAGE_BLOB =
  "Includes Basic AviSpray 16 Drone Kit (Includes 1 Battery Set 22000 Mah1 Transport Box With Easy Glide System1 Transmitter1 Android Phone With Charger1 Battery Charger1 Spare CW Propeller1 Spare CCW Propeller1 Toolkit1 User Manual1 Maintenance Logbook1 Battery Charger Tracking Logbook Plus: 1 extra battery, Shipping, Insurance, Medium Class Remote Pilot Training Certificate";

const A10E_BLOB =
  "A10E DRONE: • 1 Drone• 3 Set Propellers (6 Nos. )• 1 set Battery (2 nos. ) Qty. • 1 RTK Gnss Module BHUMI A10E Drone• 1 Set complete accessories required for flight• 1 Communication Air Module• 1 Tool Kit• 1 User Manual• 1 Transportation Box Payload• 1 10 Liter Pesticide Tank• 1 RGB Camera for Video FeedGround Control Station• 1 Ground Control Station with Joystick, Integrated displaySpares• 3 set Propeller (3CW;3 CCW) SoftwareSoftware: • 1 Perpetual Ground Control Software for Mission Planning, Live Feed, And Data Status installed on GCS TrainingTraining• Hands on Training will be Provided at your Location";

const demoProduct = (): Product => ({
  slug: "demo",
  productUrl: "/product/demo",
  name: "Demo",
  tagline: "",
  price: 1,
  category: "Agri Drones",
  interests: [],
  image: { src: "/demo.png", alt: "Demo" },
  hero: { src: "/demo.png", alt: "Demo" },
  gallery: [],
  variants: [],
  bundles: [],
  story: [],
  specs: {},
  anchors: []
});

describe("product description normalization", () => {
  it("decodes malformed entities and control characters", () => {
    expect(decodeDescriptionEntities("Battery&#009;30,000 mAh")).toBe("Battery\n30,000 mAh");
    expect(decodeDescriptionEntities("Range&#160;(LoS): 1 km")).toBe("Range (LoS): 1 km");
  });

  it("rejoins a bare spec label split from its value by a decoded tab entity", () => {
    const blocks = parseProductDescriptionBlocks("Battery&#009;30,000 mAh");
    expect(blocks).toEqual([{ type: "spec", label: "Battery", value: "30,000 mAh" }]);

    const html = getProductDescriptionHtml({
      ...demoProduct(),
      description: "Battery&#009;30,000 mAh"
    });
    expect(html).toContain("<strong>Battery:</strong> 30,000 mAh");
    expect(html).not.toMatch(/<p>Battery<\/p>/i);
  });

  it("still splits two complete label:value pairs joined by a tab entity", () => {
    const blocks = parseProductDescriptionBlocks("UAV Type: Hexacopter&#009;Endurance: 28 min");
    expect(blocks).toEqual([
      { type: "spec", label: "UAV Type", value: "Hexacopter" },
      { type: "spec", label: "Endurance", value: "28 min" }
    ]);
  });

  it("formats spec blobs into consistent key-value lines", () => {
    const html = normalizeProductDescriptionHtml(
      "Product Type: Hexacopter,Battery: 30,000 mAh,Flight Time: Up to 5 Tanks / 5 Acres,Spray Tank: 10 L"
    );
    expect(html).toContain("<strong>Product Type:</strong> Hexacopter");
    expect(html).toContain("<strong>Battery:</strong> 30,000 mAh");
    expect(html).toContain("<strong>Flight Time:</strong> Up to 5 Tanks / 5 Acres");
    expect(html).toContain("<strong>Spray Tank:</strong> 10 L");
  });

  it("formats section headers with bullet lists", () => {
    const html = normalizeProductDescriptionHtml(`
Sensors:
- Terrain Follower Radar
- Collision Avoidance Radar

Package Contents:
- Remote Controller
- Battery

Warranty:
- 5 Months
- No Physical Damage Coverage
    `);
    expect(html).toContain("<strong>Sensors:</strong>");
    expect(html).toContain("<li>Terrain Follower Radar</li>");
    expect(html).toMatch(/<strong>Package Contents:<\/strong>/i);
    expect(html).toContain("<li>Remote Controller</li>");
    expect(html).toContain("<strong>Warranty:</strong>");
    expect(html).toContain("<li>5 Months</li>");
  });

  it("removes duplicate paragraphs and preserves meaning", () => {
    const html = normalizeProductDescriptionHtml(
      "<p>Built for precision agriculture.</p><p>Built for precision agriculture.</p><p>Flight Time: 28 min</p>"
    );
    expect(html?.match(/Built for precision agriculture/g)?.length).toBe(1);
    expect(html).toContain("<strong>Flight Time:</strong> 28 min");
  });

  it("is idempotent for normalized output", () => {
    const first = normalizeProductDescriptionHtml("UAV Type: Hexacopter UAV Category: Small Endurance: 28 min");
    const second = normalizeProductDescriptionHtml(first ?? "");
    expect(first).toBe(second);
  });

  it("renders normalized descriptions on the product page without layout changes", () => {
    const html = getProductDescriptionHtml({
      ...demoProduct(),
      description: "UAV Type: Hexacopter&#009;Endurance: 28 min"
    });
    expect(html).toContain("<strong>UAV Type:</strong> Hexacopter");
    expect(html).toContain("<strong>Endurance:</strong> 28 min");
    expect(html).not.toContain("&#009;");
  });

  it("keeps intro paragraphs separate from specs", () => {
    const blocks = parseProductDescriptionBlocks(
      "Operator-ready field system.\n\nUAV Type: Hexacopter\nEndurance: 28 min"
    );
    expect(blocks[0]).toEqual({ type: "paragraph", text: "Operator-ready field system." });
    expect(blocks.some((block) => block.type === "spec" && block.label === "UAV Type")).toBe(true);
    expect(structuredDescriptionBlocksToHtml(blocks)).toContain("<p>Operator-ready field system.</p>");
  });

  it("structures DGCA certification blobs with bullets and specs", () => {
    const html = normalizeProductDescriptionHtml(DGCA_BLOB);
    expect(html).toMatch(/<strong>DGCA Certification/i);
    expect(html).toMatch(/<strong>Feature Specifications:<\/strong>/i);
    expect(html).toContain("<li>Flight Controller 1</li>");
    expect(html).toMatch(/<strong>Maximum Endurance:<\/strong>/i);
    expect(html).toMatch(/<strong>Ground Control System:<\/strong>/i);
    expect(isUnstructuredDescription(html ?? "", html ?? "")).toBe(false);
  });

  it("structures Agri Kisan prose plus glued package contents", () => {
    const html = normalizeProductDescriptionHtml(AGRI_KISAN_BLOB);
    expect(html).toContain("<p>8-Liter Agri Kisan Drone is a compact and efficient unmanned aerial system");
    expect(html).toMatch(/<strong>Package Contents:<\/strong>/i);
    expect(html).toContain("Agri Small Drone");
    expect(html).toMatch(/Battery Set/i);
    expect(html).toContain("Drone Battery Charger");
    expect(html).not.toContain("Unit16000Mah");
  });

  it("structures dash-separated specification blobs", () => {
    const html = normalizeProductDescriptionHtml(DASH_SPECS_BLOB);
    expect(html).toMatch(/Category \(As Per Dgca\)/i);
    expect(html).toMatch(/<strong>Maximum Endurance/i);
    expect(html).toMatch(/<strong>Battery Charging Time:<\/strong>/i);
    expect(html).toMatch(/<strong>Spray Width:<\/strong>/i);
    expect(html).toMatch(/<strong>Frame Material:<\/strong>/i);
    expect(html).toMatch(/Other Features/i);
    expect((html?.match(/<strong>/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("structures A10E inline bullet sections and dedupes repeated headers", () => {
    const html = normalizeProductDescriptionHtml(A10E_BLOB);
    expect(html).toMatch(/<strong>A10E Drone:<\/strong>/i);
    expect(html).toContain("<li>1 Drone</li>");
    expect(html).toMatch(/Ground Control Station/i);
    expect(html).toMatch(/<strong>Spares:<\/strong>/i);
    expect(html).toMatch(/Software/i);
    expect(html).toMatch(/Training/i);
    expect(html).not.toContain("SoftwareSoftware");
    expect(html).not.toContain("TrainingTraining");
    expect(html).not.toContain("FeedGround");
    expect(html).toContain("3CW; 3 CCW");
  });

  it("does not insert fake spec headers for quantity-prefixed package lists (Battery mismatch bug)", () => {
    const html = normalizeProductDescriptionHtml(AVISPRAY_PACKAGE_BLOB);
    expect((html?.match(/<strong>Battery/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect(html).not.toMatch(/<strong>Battery:<\/strong>\s*Set 22000/i);
  });

  it("re-normalizes a single messy paragraph blob on display", () => {
    const messyHtml = `<p>${DASH_SPECS_BLOB}</p>`;
    const html = getProductDescriptionHtml({ ...demoProduct(), description: messyHtml });
    expect(html).toMatch(/Category \(As Per Dgca\)/i);
    expect(html).toMatch(/<strong>Maximum Endurance/i);
    expect(html?.match(/<p>/g)?.length ?? 0).toBeGreaterThan(1);
  });
});
