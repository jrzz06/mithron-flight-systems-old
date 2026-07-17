#!/usr/bin/env node

import { ensureAgroneSourceImages } from "../lib/dev/ensure-agrone-assets.mjs";

const installed = ensureAgroneSourceImages();
console.log(`agrone source images installed: ${installed} new file(s)`);
