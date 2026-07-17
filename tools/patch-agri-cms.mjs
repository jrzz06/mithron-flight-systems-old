#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

const agriMission = {
  eyebrow: "Solutions for Growth",
  title: "Agri Community World",
  body: "Register, book, and finance drones across India's AGRONE network.",
  href: "/agriculture",
  cta: "Explore Agri Drones",
  mediaNote: "",
  tiles: [
    {
      label: "Drone Owner Registration",
      body: "Register your drone on the AGRONE network.",
      operator: "AGRONE Network",
      model: "DRONE OWNER NETWORK",
      location: "Pan-India onboarding",
      imageSrc: "/media/mithron/mission/agrone/agrone-drone-owner-registration.png",
      imageAlt: "AGRONE drone owner registration",
      href: "https://drone.mithronsmart.com/droneowner_reg"
    },
    {
      label: "Pilot Registration",
      body: "Join certified pilots and receive AGRONE missions.",
      operator: "AGRONE Network",
      model: "AGRONE PILOT NETWORK",
      location: "Pilot onboarding",
      imageSrc: "/media/mithron/mission/agrone/agrone-pilot-registration.png",
      imageAlt: "AGRONE pilot registration",
      href: "https://drone.mithronsmart.com/register"
    },
    {
      label: "Farmer Drone Booking",
      body: "Book spraying and crop monitoring across India.",
      operator: "AGRONE Network",
      model: "NATIONWIDE BOOKING",
      location: "Service booking desk",
      imageSrc: "/media/mithron/mission/agrone/all-india-drone-farmer.png",
      imageAlt: "All India farmer drone booking",
      href: ""
    },
    {
      label: "Smart Farmer Registration",
      body: "Access AGRONE services and on-demand drone support.",
      operator: "AGRONE Network",
      model: "SMART FARMER PROGRAM",
      location: "Farmer onboarding",
      imageSrc: "/media/mithron/mission/agrone/smart-farmer-register.png",
      imageAlt: "Smart farmer registration",
      href: "https://drone.mithronsmart.com/farmer"
    },
    {
      label: "Drone Loan and EMI",
      body: "Check eligibility and compare financing plans.",
      operator: "AGRONE Network",
      model: "FINANCING SUPPORT",
      location: "Loan eligibility check",
      imageSrc: "/media/mithron/mission/agrone/agri-drone-loan.png",
      imageAlt: "Agri drone loan and EMI check",
      href: ""
    }
  ]
};

const cityMission = {
  eyebrow: "Solutions for Future Cities",
  title: "City Drone World",
  body: "Urban platforms for rentals, training, care, and technician support.",
  href: "/surveillance",
  cta: "Explore City Drones",
  mediaNote: "",
  tiles: [
    {
      label: "Dronelancer Model",
      body: "Pilot marketplace for on-demand city jobs.",
      operator: "Mithron City Network",
      model: "DRONELANCER MODEL",
      location: "Pilot network grid",
      imageSrc: "/media/mithron/mission/city/dronelancer-model.png",
      imageAlt: "Dronelancer Model",
      href: ""
    },
    {
      label: "Drone Rental App",
      body: "Book rentals and track project earnings.",
      operator: "Mithron City Network",
      model: "RENTAL SERVICES APP",
      location: "Urban booking console",
      imageSrc: "/media/mithron/mission/city/city-drone-rental-services-app.png",
      imageAlt: "City Drone Rental Services App",
      href: ""
    },
    {
      label: "Drone Academic",
      body: "Pilot training and certified urban flight programs.",
      operator: "Mithron Academy Network",
      model: "ALL DRONE ACADAMIC",
      location: "Training and simulation hub",
      imageSrc: "/media/mithron/mission/city/all-drone-acadamic.png",
      imageAlt: "All Drone Acadamic",
      href: ""
    },
    {
      label: "FranchiseCare Center",
      body: "Local repair, spares, and maintenance support.",
      operator: "Mithron Service Network",
      model: "FRANCHISECARE CENTER",
      location: "City care workshop",
      imageSrc: "/media/mithron/mission/city/drone-franchisecare-center.png",
      imageAlt: "Drone FranchiseCare Center",
      href: ""
    },
    {
      label: "Technician Network",
      body: "Field diagnostics and maintenance coordination.",
      operator: "Mithron Service Network",
      model: "TECHNICIAN AGGREGATION",
      location: "Field support network",
      imageSrc: "/media/mithron/mission/city/drone-technician-aggregation.png",
      imageAlt: "Drone Technician Aggregation",
      href: ""
    }
  ]
};

async function main() {
  loadProjectEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("admin_settings").select("payload").eq("id", "global").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.payload) throw new Error("admin_settings global row is missing.");

  const payload = structuredClone(data.payload);
  payload.homepage ??= {};
  payload.homepage.missions ??= {};
  payload.homepage.missions.agri = agriMission;
  payload.homepage.missions.city = cityMission;

  const { error: updateError } = await supabase
    .from("admin_settings")
    .upsert({ id: "global", payload, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (updateError) throw new Error(updateError.message);
  console.log(
    JSON.stringify(
      {
        updated: ["homepage.missions.agri", "homepage.missions.city"],
        agriLinkedTiles: agriMission.tiles.filter((tile) => tile.href).map((tile) => tile.label),
        cityShowcaseOnly: true
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
