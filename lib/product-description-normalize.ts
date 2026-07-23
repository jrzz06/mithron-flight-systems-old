const LIST_SECTION_HEADERS =
  /^(sensors|package contents|contents included|contents|included items|included|what'?s in the box|in the box|warranty|notes|features|accessories|items included|box contents|dgca certification(?: details)?|feature specifications|ground control station|payload|spares|software|training|certification(?: details)?)$/i;

const SECTION_HEADER_NAMES = [
  "DGCA Certification Details",
  "Feature Specifications",
  "Ground Control Station",
  "Package Contents",
  "Contents Included",
  "What's In The Box",
  "In The Box",
  "Box Contents",
  "Included Items",
  "Items Included",
  "Sensors",
  "Warranty",
  "Accessories"
];

const MIDLINE_SECTION_HEADERS = [
  "Feature Specifications",
  "Ground Control Station",
  "DGCA Certification Details",
  "DGCA Certification",
  "Package Contents"
];

const KNOWN_SPEC_LABELS = [
  "Category (As Per Dgca)",
  "Category (As Per DGCA)",
  "Maximum Endurance (hr/m)",
  "Maximum Endurance",
  "Battery Charging Time",
  "Spray Width",
  "Flight Mode Options",
  "Wind Resistance",
  "Flight Speed",
  "Frame Material",
  "Other Features",
  "Drone Classification",
  "Maximum Range",
  "Maximum Flight Height",
  "Operating Altitude",
  "Maximum Speed",
  "Battery Capacity",
  "All-Up Weight",
  "Number of Motors",
  "Payload Type",
  "Navigation System",
  "Ground Control System",
  "Certification Date",
  "Spreader Tank Capacity",
  "Spreader Tank CAPACITY",
  "UAV Type",
  "UAV Category",
  "Endurance",
  "Range (LoS)",
  "Range",
  "Payload",
  "Battery",
  "Flight Time",
  "Weight",
  "Dimensions",
  "Product Type",
  "Spray Tank",
  "Flight Mode Options",
  "Wind Resistance",
  "Flight Speed"
];

const DASH_SPEC_LABEL_PATTERN =
  /^(?:Category|Maximum|Minimum|Flight|Battery|Spray|Wind|Frame|Operating|Navigation|Ground|Drone|All-Up|Payload|Spreader|Charger|Number|UAV|GST|Range|Endurance|Weight|Speed|Material|Other|Certification|Feature|Tank|Capacity|Classification|Resistance|Mode|Options|Type|System|Control|Date|Insurance|Transportation|Hexa-copter|BLDC|Motor|Controller|Altitude|Height|Width|Charging|Time|Product|Spray Width|Flight Mode Options|Battery Charging Time|Frame Material|Other Features)(?:\s+\([^)]+\))?(?:\s+[A-Za-z][A-Za-z0-9\s\-/()]*)?$/i;

const SPEC_TOKEN_PATTERN =
  /(?:UAV Type|UAV Category|Endurance|Range|Maximum|Operating|Wind Resistance|All-Up-Weight|Payload|Battery|Flight Time|Category|Spray Width|Flight Mode|Frame Material|DGCA|Certification|Feature Specifications)/i;

const INVALID_SYMBOLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g;

type DescriptionBlock =
  | { type: "paragraph"; text: string }
  | { type: "spec"; label: string; value: string }
  | { type: "section"; label: string; items: string[] };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decodeDescriptionEntities(value: string) {
  let text = String(value ?? "");
  text = text.replace(/&#(\d+);/g, (_match, digits: string) => {
    const code = Number(digits);
    if (code === 9 || code === 10 || code === 13) return "\n";
    if (code === 160 || code === 8239) return " ";
    if (code < 32) return "";
    return String.fromCharCode(code);
  });
  text = text.replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
    const code = parseInt(hex, 16);
    if (code === 9 || code === 10 || code === 13) return "\n";
    if (code === 160 || code === 8239) return " ";
    if (code < 32) return "";
    return String.fromCharCode(code);
  });
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function polishSpacing(value: string) {
  return value
    .replace(INVALID_SYMBOLS, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([^\s\d])/g, "$1 $2")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function polishLabel(label: string) {
  const trimmed = polishSpacing(label).replace(/:$/, "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return word;
      if (index === 0 && /\d/.test(word) && /^[A-Z0-9]+$/i.test(word)) return word.toUpperCase();
      if (/^[A-Z0-9]/.test(word) && word.length <= 4) return word;
      if (index > 0 && /^(mAh|GHz|km|kg|GB|MHz|LoS|UAV|GST|RC|FPV|DGCA|BLDC|RTK|GNSS|CCW|CW)$/i.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function polishParagraph(text: string) {
  const cleaned = polishSpacing(text);
  if (!cleaned) return "";
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : sentence;
}

function descriptionPlainText(value: string) {
  return decodeDescriptionEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeRepeatedHeaders(text: string) {
  let result = text;
  for (const header of SECTION_HEADER_NAMES) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(${escaped})\\1`, "gi"), "$1");
  }
  return result;
}

function repairGluedTokens(text: string) {
  let result = dedupeRepeatedHeaders(text);
  result = result.replace(/Unit(\d)/gi, "Unit $1");
  result = result.replace(/Set([A-Z])/g, "Set $1");
  result = result.replace(/FeedGround Control Station/gi, "Feed\nGround Control Station");
  result = result.replace(/FeedGround/gi, "Feed\nGround");
  result = result.replace(/displaySpares/gi, "display\nSpares");
  result = result.replace(/Box([A-Z])/g, "Box $1");
  result = result.replace(/Plate([A-Z])/g, "Plate $1");
  result = result.replace(/Unit(\d+Mah)/gi, "Unit $1");
  result = result.replace(/(\d)(mAh|Mah)/gi, (match, digits: string, unit: string, offset: number, source: string) => {
    const before = source.slice(Math.max(0, offset - 6), offset);
    if (/Unit\s*$/i.test(before)) return match;
    // Keep capacity glued to the battery package line (e.g. "16000Mah Battery Set").
    const after = source.slice(offset + match.length, offset + match.length + 16);
    if (/^\s*Battery/i.test(after)) return match;
    return `${digits} ${unit}`;
  });
  result = result.replace(/;\s*(\d)/g, "; $1");
  result = result.replace(/(\d+)\s+(mAh|Mah)\s+(Battery Set)/gi, "$1$2 $3");
  result = result.replace(/(\d+Mah)\s+(Battery Set)/gi, "$1 $2");
  result = result.replace(/SoftwareSoftware:?/gi, "Software:");
  result = result.replace(/TrainingTraining:?/gi, "Training:");
  return result;
}

function isProseLine(line: string) {
  return line.length > 100 && /designed for|enables|helps|farmers|farms|practices|operator|unmanned aerial system|technology-driven/i.test(line);
}

function preprocessSpecLine(line: string) {
  if (isProseLine(line)) return line;
  if (/^\s*-\s+/.test(line)) return line;
  let result = normalizeDashSeparators(line);
  const structuredTokens = (result.match(/:\s*/g) ?? []).length + countDashSpecs(result);
  if (structuredTokens >= 2) {
    return result.replace(/(Frame Material:\s*.+?)\s+(Other Features)/i, "$1\n$2:");
  }
  if (result.length > 80 && SPEC_TOKEN_PATTERN.test(result)) {
    result = insertKnownSpecBoundaries(result);
  }
  result = result.replace(/(Frame Material:\s*.+?)\s+(Other Features)/i, "$1\n$2:");
  return result;
}

function normalizeDashSeparators(text: string) {
  let result = text;
  const sorted = [...KNOWN_SPEC_LABELS].sort((left, right) => right.length - left.length);
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const label of sorted) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const next = result.replace(new RegExp(`(${escaped})\\s+[-–]\\s+`, "gi"), "$1: ");
      if (next !== result) changed = true;
      result = next;
    }
    const generic = result.replace(
      /([A-Za-z][A-Za-z0-9\s()/]{2,55}?)\s+[-–]\s+/g,
      (match, label: string) => (looksLikeDashSpecLabel(label) ? `${label}: ` : match)
    );
    if (generic !== result) changed = true;
    result = generic;
    if (!changed) break;
  }
  return result;
}

function insertKnownSpecBoundaries(text: string) {
  let result = text;
  const sorted = [...KNOWN_SPEC_LABELS].sort((left, right) => right.length - left.length);
  for (const label of sorted) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`(^|[^\\n:]{0,4})(${escaped})(?=\\s+(?![:(])(?:[^:\\n]|\\([^)]+\\))+)`, "gi"),
      (match, prefix: string, matchedLabel: string) => {
        // A bare quantity digit right before the label (e.g. "1 Battery Set", "...Mah1
        // Transport Box...1 Battery Charger1...") means this is a package/contents list
        // item, not a genuine new spec label - skip to avoid inserting a fake header.
        if (/\d\s*$/.test(prefix)) return match;
        return `${prefix}\n${matchedLabel}:`;
      }
    );
  }
  return result;
}

function splitInlineBullets(text: string) {
  return text
    .replace(/([^\n])\s*•\s*/g, "$1\n• ")
    .replace(/^\s*•\s*/gm, "- ");
}

function splitSectionHeaders(text: string) {
  let result = text;
  const lineStartHeaders = [...SECTION_HEADER_NAMES].sort((left, right) => right.length - left.length);
  for (const header of lineStartHeaders) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(^|\\n)\\s*(${escaped})(?!\\s*:)`, "gim"), "$1$2:");
  }

  const midlineHeaders = [...MIDLINE_SECTION_HEADERS].sort((left, right) => right.length - left.length);
  for (const header of midlineHeaders) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`([•]\\s*|\\s{2,})(${escaped})(?=\\s*[:\\-–]|\\s+[•-])`, "gi"),
      "$1\n$2"
    );
    result = result.replace(
      new RegExp(`([.!?]\\s+)(${escaped})(?=\\s*[:\\-–]|\\s+[A-Z])`, "gi"),
      "$1\n$2"
    );
  }

  for (const header of ["Payload", "Spares", "Software", "Training"]) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(^|\\n)\\s*(${escaped})(?!\\s*:)`, "gim"), "$1$2:");
    result = result.replace(new RegExp(`([•]\\s*)(${escaped})(?=\\s*[:\\-–]|\\s+[•-])`, "gi"), "$1\n$2:");
  }

  return result;
}

function isPackageQuantityItem(text: string) {
  return /(?:\d+\s*(?:mAh|Mah)\s+)?[A-Za-z].*\s*[–-]\s*\d+\s*(?:Unit|Set|Parts?)\b/i.test(text);
}

function splitPackageRunOns(text: string) {
  let result = text.replace(
    /DGCA Certification Details\s+Certification Date/i,
    "DGCA Certification Details:\nCertification Date"
  );
  // Insert the section header without a bullet — packing bulletizes once below.
  result = result.replace(/([.!?])\s*(Agri Small Drone)/i, "$1\n\nPackage Contents:\n$2");
  result = result.replace(
    /(Agri Small Drone\s*[–-]\s*1 Unit)\s*(\d+Mah)/i,
    "$1 $2"
  );
  result = result.replace(
    /(\d+Mah Battery Set\s*[–-]\s*1 Set)(Drone)/i,
    "$1 $2"
  );
  result = result.replace(/(Unit)(Transmitter)/i, "$1 $2");
  result = result.replace(/(Unit)(Toolkit)/i, "$1 $2");
  result = result.replace(/(Set)(Drone Storage Box)/i, "$1 $2");
  result = result.replace(/(Unit)(Box Wheels)/i, "$1 $2");
  result = result.replace(/(Set)(UIN Number Plate)/i, "$1 $2");

  const packageMarker = /Package Contents:\s*/i;
  const markerIndex = result.search(packageMarker);
  if (markerIndex >= 0) {
    const prefix = result.slice(0, markerIndex);
    const suffix = result.slice(markerIndex).replace(
      packageMarker,
      "Package Contents:\n"
    );
    // Optional leading capacity (16000Mah) stays on the battery line; bulletize once.
    // {0,8} allows single-word items like "Transmitter – 1 Unit".
    const packed = suffix.replace(
      /((?:\d+\s*(?:mAh|Mah)\s+)?(?:[A-Z][a-z]+(?:\s+[A-Za-z0-9]+){0,8}))\s*[–-]\s*(\d+\s*(?:Unit|Set|Parts?))/g,
      "\n- $1 – $2"
    );
    result = `${prefix}${packed}`;
  }

  result = result.replace(
    /(Box Wheels\s*[–-]\s*1 Set)\s+(UIN Number Plate)\s+(Warranty Card)/i,
    "$1\n- $2\n- $3"
  );

  return result;
}

function joinBrokenParentheses(text: string) {
  const lines = text.split(/\r?\n/);
  const joined: string[] = [];
  for (const line of lines) {
    const previous = joined[joined.length - 1];
    if (previous && /\([^)]*$/.test(previous) && /^[^(\n]*\)/.test(line)) {
      joined[joined.length - 1] = `${previous} ${line}`;
      continue;
    }
    joined.push(line);
  }
  return joined.join("\n");
}

export function preprocessDescriptionText(raw: string) {
  const decoded = decodeDescriptionEntities(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");

  let text = polishSpacing(decoded);
  text = text.replace(
    /DGCA Certification Details\s+Certification Date/i,
    "DGCA Certification Details:\nCertification Date"
  );
  text = repairGluedTokens(text);
  text = splitInlineBullets(text);
  text = splitSectionHeaders(text);
  text = splitPackageRunOns(text);
  text = joinBrokenParentheses(text);
  text = text.replace(/(Transportation box)\s+(Feature Specifications)/gi, "$1\n$2:");
  text = text
    .split(/\r?\n/)
    .map((line) => preprocessSpecLine(polishSpacing(line)))
    .join("\n");
  return text;
}

function isBareKnownSpecLabelLine(line: string) {
  const trimmed = line.trim().replace(/:$/, "").trim();
  if (!trimmed || trimmed.length > 40) return false;
  return KNOWN_SPEC_LABELS.some((label) => label.toLowerCase() === trimmed.toLowerCase());
}

function startsWithKnownSpecLabel(line: string) {
  const trimmed = line.trim();
  const sorted = [...KNOWN_SPEC_LABELS].sort((left, right) => right.length - left.length);
  return sorted.some((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}\\s*:`, "i").test(trimmed);
  });
}

// A tab/newline entity (`&#009;`) in raw Wix content sometimes separates a bare
// spec label from its bare value (e.g. "Battery" \n "30,000 mAh") instead of two
// complete "Label: Value" lines. Left alone this renders as two disconnected
// blocks ("half text in one row, half in the next"). Rejoin that specific shape
// back into a single "Label: Value" line; lines that already carry their own
// colon (the normal multi-spec-per-tab case) are left untouched.
function rejoinSplitLabelValueLines(lines: string[]) {
  const result: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const current = lines[index] ?? "";
    const next = lines[index + 1];
    if (
      next !== undefined &&
      isBareKnownSpecLabelLine(current) &&
      !next.includes(":") &&
      next.trim().length > 0 &&
      next.trim().length <= 60 &&
      !startsWithKnownSpecLabel(next)
    ) {
      result.push(`${current.replace(/:$/, "").trim()}: ${next.trim()}`);
      index += 2;
      continue;
    }
    result.push(current);
    index += 1;
  }
  return result;
}

function htmlToPlainLines(html: string) {
  const preprocessed = preprocessDescriptionText(html);
  const lines = preprocessed
    .split(/\r?\n/)
    .map((line) => polishSpacing(decodeDescriptionEntities(line)))
    .filter(Boolean);
  return rejoinSplitLabelValueLines(lines);
}

function splitCommaSeparatedSpecs(line: string) {
  const parts = line
    .split(/,(?=[A-Za-z][A-Za-z0-9\s\-/()]{0,48}:)/)
    .map((part) => polishSpacing(part))
    .filter(Boolean);
  return parts.length >= 2 ? parts : [line];
}

function looksLikeDashSpecLabel(label: string) {
  const trimmed = polishSpacing(label).replace(/:$/, "");
  if (!trimmed || trimmed.length > 64) return false;
  if (LIST_SECTION_HEADERS.test(trimmed)) return true;
  if (DASH_SPEC_LABEL_PATTERN.test(trimmed)) return true;
  if (/^[A-Z][A-Za-z0-9\s\-/()]{1,48}$/.test(trimmed) && /\b(?:Maximum|Minimum|Category|Endurance|Range|Battery|Flight|Wind|Frame|Payload|Weight|Speed|Capacity|Classification|Mode|Options|Material|Features|System|Charging|Spray|Operating|Navigation|Control|Type|Number|Tank|Charger|Insurance|Transportation|Certification|Date|GST|Motor|Controller|Altitude|Height|Width|Time|Drone|Ground|Spreader|Hexa|BLDC)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function splitDashSpecs(line: string) {
  const pattern = /([A-Za-z][^\n–-]{1,55}?)\s+[-–]\s+/g;
  const matches = [...line.matchAll(pattern)];
  const valid = matches.filter((match) => looksLikeDashSpecLabel(polishSpacing(match[1] ?? "")));

  if (valid.length === 1) {
    const match = valid[0];
    if (!match) return [line];
    const valueStart = (match.index ?? 0) + match[0].length;
    const value = polishSpacing(line.slice(valueStart));
    return value ? [`${polishSpacing(match[1] ?? "")}: ${value}`] : [line];
  }

  if (valid.length < 2) return [line];

  const parts: string[] = [];
  for (let index = 0; index < valid.length; index += 1) {
    const match = valid[index];
    if (!match) continue;
    const valueStart = (match.index ?? 0) + match[0].length;
    const valueEnd = index + 1 < valid.length ? (valid[index + 1]?.index ?? line.length) : line.length;
    const value = polishSpacing(line.slice(valueStart, valueEnd));
    if (value) parts.push(`${polishSpacing(match[1] ?? "")}: ${value}`);
  }

  const prefix = polishSpacing(line.slice(0, valid[0]?.index ?? 0));
  if (prefix) return [prefix, ...parts];
  return parts.length >= 2 ? parts : [line];
}

function splitKnownColonSpecs(line: string) {
  const sorted = [...KNOWN_SPEC_LABELS].sort((left, right) => right.length - left.length);
  const matches: Array<{ index: number; label: string; valueStart: number }> = [];

  for (const label of sorted) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s)(${escaped}):\\s*`, "gi");
    for (const match of line.matchAll(pattern)) {
      if (!match[1]) continue;
      matches.push({
        index: match.index ?? 0,
        label: polishSpacing(match[1]),
        valueStart: (match.index ?? 0) + match[0].length
      });
    }
  }

  if (matches.length < 2) return null;

  const ordered = [...matches].sort((left, right) => left.index - right.index);
  const nonOverlapping = ordered.filter((match, index) => index === 0 || match.index >= ordered[index - 1]!.valueStart);

  if (nonOverlapping.length < 2) return null;

  const parts: string[] = [];
  const prefix = polishSpacing(line.slice(0, nonOverlapping[0]!.index));
  if (prefix && !/^[\s:,-]+$/.test(prefix)) parts.push(prefix);

  for (let index = 0; index < nonOverlapping.length; index += 1) {
    const current = nonOverlapping[index]!;
    const valueEnd = index + 1 < nonOverlapping.length ? nonOverlapping[index + 1]!.index : line.length;
    const value = polishSpacing(line.slice(current.valueStart, valueEnd));
    if (value) parts.push(`${current.label}: ${value}`);
  }

  return parts.length >= (prefix ? 1 : 2) ? parts : null;
}

function splitInlineSpecs(line: string) {
  if (/^\s*-\s+/.test(line)) return [line];

  const knownColon = splitKnownColonSpecs(line);
  if (knownColon) return knownColon;

  const dashSplit = splitDashSpecs(line);
  if (dashSplit.length >= 2) return dashSplit;

  const pattern = /([A-Za-z][A-Za-z0-9\s\-/()]{0,48}):\s*/g;
  const matches = [...line.matchAll(pattern)];
  if (matches.length >= 2) {
    const parts: string[] = [];
    for (let index = 0; index < matches.length; index += 1) {
      const label = matches[index]?.[1]?.trim();
      if (!label) continue;
      const valueStart = (matches[index]?.index ?? 0) + (matches[index]?.[0]?.length ?? 0);
      const valueEnd = index + 1 < matches.length ? (matches[index + 1]?.index ?? line.length) : line.length;
      const value = polishSpacing(line.slice(valueStart, valueEnd)).replace(/,\s*$/, "");
      if (value) parts.push(`${label}: ${value}`);
    }
    if (parts.length >= 2) return parts;
  }

  const commaSplit = splitCommaSeparatedSpecs(line);
  if (commaSplit.length >= 2) return commaSplit;

  return [line];
}

function parseCommaSeparatedValues(value: string) {
  if (!value.includes(",")) return null;
  const pieces = value
    .split(/,(?![^()]*\))/)
    .map((part) => polishSpacing(part))
    .filter(Boolean);
  if (pieces.length < 2) return null;
  if (pieces.some((part) => /:\s*/.test(part))) return null;
  return pieces;
}

function parseDashSpecLine(line: string): DescriptionBlock[] | null {
  const dashMatch = line.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (!dashMatch?.[1] || !dashMatch[2]) return null;
  const label = polishLabel(dashMatch[1]);
  let value = polishSpacing(dashMatch[2]);
  if (!looksLikeDashSpecLabel(label) || !value) return null;
  if (!value && LIST_SECTION_HEADERS.test(label)) {
    return [{ type: "section", label, items: [] }];
  }

  // Title-like dash lines often glue a short value onto the intro paragraph
  // (e.g. "Agri Kisan Drone - Small (Exclusive of GST) 8-Liter Agri Kisan...").
  if (value.length > 120 && isProseLine(value)) {
    const proseStart = value.search(/\b\d+-Liter\b|\b(?:The|This|Our)\s+[A-Z]/);
    if (proseStart > 0 && proseStart <= 64) {
      const shortValue = polishSpacing(value.slice(0, proseStart));
      const prose = polishParagraph(value.slice(proseStart));
      const blocks: DescriptionBlock[] = [];
      if (shortValue) blocks.push({ type: "spec", label, value: shortValue });
      if (prose) blocks.push({ type: "paragraph", text: prose });
      return blocks.length ? blocks : null;
    }
  }

  return [{ type: "spec", label, value }];
}

function parseLine(line: string): DescriptionBlock[] {
  const bulletMatch = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/);
  if (bulletMatch?.[1]) {
    const previousSection = polishSpacing(bulletMatch[1]);
    return [{ type: "section", label: "Notes", items: [previousSection] }];
  }

  const colonIndex = line.indexOf(":");
  if (colonIndex > 0) {
    const label = polishLabel(line.slice(0, colonIndex));
    const value = polishSpacing(line.slice(colonIndex + 1));
    if (!value && LIST_SECTION_HEADERS.test(label)) {
      return [{ type: "section", label, items: [] }];
    }
    if (value) {
      const commaList = parseCommaSeparatedValues(value);
      if (commaList && LIST_SECTION_HEADERS.test(label)) {
        return [{ type: "section", label, items: commaList }];
      }
      if (commaList && label.toLowerCase() === "sensors") {
        return [{ type: "section", label: "Sensors", items: commaList }];
      }
      if (LIST_SECTION_HEADERS.test(label) && value.includes("•")) {
        const items = value.split(/\s*•\s*/).map((item) => polishSpacing(item)).filter(Boolean);
        if (items.length >= 2) return [{ type: "section", label, items }];
      }
      return [{ type: "spec", label, value }];
    }
    if (label) {
      return [{ type: "section", label, items: [] }];
    }
  }

  const dashSpec = parseDashSpecLine(line);
  if (dashSpec) return dashSpec;

  const paragraph = polishParagraph(line);
  return paragraph ? [{ type: "paragraph", text: paragraph }] : [];
}

function mergeBlocks(blocks: DescriptionBlock[]) {
  const merged: DescriptionBlock[] = [];

  for (const block of blocks) {
    const previous = merged[merged.length - 1];

    if (block.type === "section" && block.label === "Notes" && previous?.type === "section") {
      previous.items.push(...block.items);
      continue;
    }

    if (block.type === "section" && previous?.type === "section" && previous.label === block.label) {
      previous.items.push(...block.items);
      continue;
    }

    if (block.type === "section" && previous?.type === "section" && previous.items.length === 0) {
      previous.items.push(...block.items);
      if (block.label && !previous.label) previous.label = block.label;
      continue;
    }

    if (block.type === "section" && block.items.length === 1 && previous?.type === "section" && previous.items.length > 0) {
      previous.items.push(...block.items);
      continue;
    }

    if (block.type === "section" && block.items.length === 1 && previous?.type === "paragraph") {
      const prose = previous.text;
      if (prose.length >= 80 && /designed for|enables|helps|farm|operator|system/i.test(prose)) {
        merged.push({ type: "section", label: "Package Contents", items: block.items });
        continue;
      }
    }

    merged.push(block);
  }

  return merged;
}

function dedupeBlocks(blocks: DescriptionBlock[]) {
  const seenSpecs = new Set<string>();
  const seenParagraphs = new Set<string>();
  const seenSectionItems = new Set<string>();
  const output: DescriptionBlock[] = [];

  for (const block of blocks) {
    if (block.type === "spec") {
      const key = `${block.label.toLowerCase()}::${block.value.toLowerCase()}`;
      if (seenSpecs.has(key)) continue;
      seenSpecs.add(key);
      output.push(block);
      continue;
    }

    if (block.type === "paragraph") {
      const key = block.text.toLowerCase();
      if (seenParagraphs.has(key)) continue;
      seenParagraphs.add(key);
      output.push(block);
      continue;
    }

    const items = block.items.filter((item) => {
      const key = `${block.label.toLowerCase()}::${item.toLowerCase()}`;
      if (seenSectionItems.has(key)) return false;
      seenSectionItems.add(key);
      return true;
    });
    if (!items.length && block.label.toLowerCase() === "notes") continue;
    if (!items.length && !block.label) continue;
    output.push({ ...block, items });
  }

  return output;
}

function countInlineBullets(text: string) {
  return (text.match(/•/g) ?? []).length;
}

function countDashSpecs(text: string) {
  return (text.match(/\b[A-Za-z][^\n–-]{0,48}\s+[-–]\s+/g) ?? []).length;
}

function countStrongBlocks(html: string) {
  return (html.match(/<strong>/gi) ?? []).length;
}

function hasGluedWordPatterns(text: string) {
  return /[a-z][A-Z]/.test(text)
    || /\d[A-Za-z]{2,}/.test(text)
    || /(Unit|Set|Feed|display|Software|Training)([A-Z])/i.test(text)
    || SECTION_HEADER_NAMES.some((header) => {
      const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`${escaped}${escaped}`, "i").test(text);
    });
}

function countSpecLikeTokens(text: string) {
  const colonMatches = text.match(/[A-Za-z][A-Za-z0-9\s\-/()]{0,48}:\s*/g) ?? [];
  const dashMatches = text.match(/\b[A-Za-z][^\n–-]{0,48}\s+[-–]\s+/g) ?? [];
  return colonMatches.length + dashMatches.length;
}

export function isUnstructuredDescription(plain: string, html?: string) {
  const clean = polishSpacing(plain);
  if (!clean) return false;

  const strongBlocks = html ? countStrongBlocks(html) : 0;
  if (html && strongBlocks >= 5 && countInlineBullets(clean) < 2 && !hasGluedWordPatterns(clean)) {
    return false;
  }

  if (html && strongBlocks >= 4 && /<ul>/i.test(html) && (html.match(/<p><strong>/gi) ?? []).length >= 4) {
    return false;
  }

  if (countInlineBullets(clean) >= 2) return true;
  if (hasGluedWordPatterns(clean)) return true;

  const dashSpecs = countDashSpecs(clean);
  const specTokens = countSpecLikeTokens(clean);

  if (dashSpecs >= 2 && strongBlocks < dashSpecs) return true;
  if (specTokens >= 3 && strongBlocks < specTokens) return true;
  if (SPEC_TOKEN_PATTERN.test(clean) && specTokens >= 2 && strongBlocks < 2) return true;

  if (clean.length > 250 && specTokens >= 3 && strongBlocks < Math.max(2, Math.floor(specTokens / 2))) {
    return true;
  }

  if (html && /^<p[^>]*>[\s\S]*<\/p>$/i.test(html.trim()) && specTokens >= 2) {
    return true;
  }

  if (html && (html.match(/<p\b/gi) ?? []).length === 1 && specTokens >= 3) {
    return true;
  }

  return false;
}

function expandDenseSectionItem(item: string) {
  if (item.length < 100 || !/Feature Specifications|Maximum Endurance|Drone Classification/i.test(item)) {
    return [item];
  }

  const expanded = preprocessSpecLine(item.replace(/Feature Specifications/i, "\nFeature Specifications:"));
  const lines = expanded.split(/\r?\n/).map((line) => polishSpacing(line)).filter(Boolean);
  if (lines.length <= 1) return [item];

  const output: string[] = [];
  for (const line of lines) {
    if (/^Feature Specifications:?$/i.test(line)) continue;
    const blocks = splitInlineSpecs(line).flatMap((part) => parseLine(part));
    for (const block of blocks) {
      if (block.type === "paragraph") output.push(block.text);
      if (block.type === "spec") output.push(`${block.label}: ${block.value}`);
    }
  }

  return output.length ? output : [item];
}

export function parseProductDescriptionBlocks(raw: string) {
  const lines = htmlToPlainLines(raw).flatMap((line) => splitInlineSpecs(line));
  const blocks: DescriptionBlock[] = [];
  let pendingSection: string | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Bare "-" / empty bullets must not clear Package Contents context.
    if (!trimmedLine || /^[-•*]$/.test(trimmedLine) || /^(?:[-•*]|\d+[.)])\s*$/.test(trimmedLine)) {
      continue;
    }

    const bulletMatch = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/);
    if (bulletMatch?.[1]) {
      const item = polishSpacing(bulletMatch[1]);
      const expandedItems = expandDenseSectionItem(item);
      const previous = blocks[blocks.length - 1];
      for (const expandedItem of expandedItems) {
        if (pendingSection) {
          if (previous?.type === "section" && previous.label === pendingSection) {
            previous.items.push(expandedItem);
          } else {
            blocks.push({ type: "section", label: pendingSection, items: [expandedItem] });
          }
        } else if (previous?.type === "section") {
          previous.items.push(expandedItem);
        } else if (isPackageQuantityItem(expandedItem)) {
          const packageSection = [...blocks].reverse().find(
            (block) => block.type === "section" && /package contents|included|in the box|box contents/i.test(block.label)
          );
          if (packageSection && packageSection.type === "section") {
            packageSection.items.push(expandedItem);
            pendingSection = packageSection.label;
          } else {
            blocks.push({ type: "section", label: "Package Contents", items: [expandedItem] });
            pendingSection = "Package Contents";
          }
        } else {
          blocks.push({ type: "section", label: "Notes", items: [expandedItem] });
        }
      }
      continue;
    }

    const parsed = parseLine(line);
    for (const block of parsed) {
      if (block.type === "section" && block.items.length === 0) {
        pendingSection = block.label;
        blocks.push(block);
        continue;
      }

      pendingSection = block.type === "section" ? block.label : null;
      blocks.push(block);
    }
  }

  return dedupeBlocks(mergeBlocks(blocks));
}

export function structuredDescriptionBlocksToHtml(blocks: DescriptionBlock[]) {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph") {
      parts.push(`<p>${escapeHtml(block.text)}</p>`);
      continue;
    }

    if (block.type === "spec") {
      parts.push(`<p><strong>${escapeHtml(block.label)}:</strong> ${escapeHtml(block.value)}</p>`);
      continue;
    }

    if (block.items.length) {
      parts.push(`<p><strong>${escapeHtml(block.label)}:</strong></p>`);
      parts.push(`<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    } else if (block.label.toLowerCase() !== "notes") {
      parts.push(`<p><strong>${escapeHtml(block.label)}:</strong></p>`);
    }
  }

  return parts.join("");
}

export function normalizeProductDescriptionHtml(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const blocks = parseProductDescriptionBlocks(trimmed);
  if (!blocks.length) return null;

  const html = structuredDescriptionBlocksToHtml(blocks);
  return html || null;
}

export function maybeNormalizeProductDescription(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return normalizeProductDescriptionHtml(raw);
}

export function descriptionNormalizePlainText(raw: string | null | undefined) {
  return descriptionPlainText(String(raw ?? ""));
}
