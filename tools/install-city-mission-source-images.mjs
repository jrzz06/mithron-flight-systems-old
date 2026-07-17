#!/usr/bin/env node

import { ensureCityMissionSourceImages } from "../lib/dev/ensure-city-mission-assets.mjs";

const installed = ensureCityMissionSourceImages();
console.log(`city mission source images installed: ${installed} new file(s)`);
