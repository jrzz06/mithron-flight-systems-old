#!/usr/bin/env node

import { ensureCatalogShowcaseAssets } from "../lib/dev/ensure-catalog-showcase-assets.mjs";

const installed = ensureCatalogShowcaseAssets({ force: true });
console.log(`catalog showcase images installed: ${installed} file(s)`);
