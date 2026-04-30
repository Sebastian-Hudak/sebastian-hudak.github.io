#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const i18nPath = path.join(projectRoot, "_data", "i18n.js");
const snapshotPath = path.join(projectRoot, "scripts", ".i18n-defaults.json");

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write");

delete require.cache[require.resolve(i18nPath)];
const i18n = require(i18nPath);

const templateFiles = collectTemplateFiles();
const extractedEntries = new Map();
const conflicts = [];

for (const relPath of templateFiles) {
  const scope = getScopeForFile(relPath);
  if (!scope) continue;

  const absolutePath = path.join(projectRoot, relPath);
  const source = fs.readFileSync(absolutePath, "utf8");

  extractContentEntries(source, relPath, scope);
  extractAttributeEntries(source, relPath, scope);
}

if (conflicts.length) {
  console.error("Conflicting default text was found for the same i18n key:");
  for (const conflict of conflicts) {
    console.error(`- ${formatEntryLabel(conflict.first.entry)} in ${conflict.first.entry.sourcePath}`);
    console.error(`  first:  ${JSON.stringify(conflict.first.entry.value)}`);
    console.error(`  second: ${JSON.stringify(conflict.second.entry.value)} in ${conflict.second.entry.sourcePath}`);
  }
  process.exit(1);
}

const extractedSnapshot = buildSnapshot(extractedEntries);
const savedSnapshot = readSnapshot();
const hasSavedSnapshot = Object.keys(savedSnapshot).length > 0;

stripEnglishBranches(i18n);

const locales = getSupportedLocales(i18n);
const englishChanges = collectEnglishChanges(extractedEntries, savedSnapshot);
const staleSnapshotKeys = collectStaleSnapshotKeys(savedSnapshot, extractedSnapshot);

if (shouldWrite) {
  syncNonEnglishStructure(i18n, extractedEntries, locales);
  fs.writeFileSync(i18nPath, serializeModule(i18n));
  writeSnapshot(extractedSnapshot);
}

const missingTranslations = collectMissingTranslations(i18n, extractedEntries, locales);

if (!shouldWrite) {
  const hasIssues =
    englishChanges.length > 0 ||
    staleSnapshotKeys.length > 0 ||
    missingTranslations.length > 0;

  if (!hasIssues) {
    console.log("i18n check passed. Templates and translations are in sync.");
    process.exit(0);
  }

  console.error("i18n check found entries that need attention.");

  if (englishChanges.length) {
    console.error("\nEnglish template text changed since the last sync:");
    for (const change of englishChanges) {
      console.error(`- ${formatEntryLabel(change.entry)} from ${change.entry.sourcePath}`);
      console.error(`  previous: ${JSON.stringify(change.previousValue ?? "")}`);
      console.error(`  current:  ${JSON.stringify(change.nextValue)}`);
    }
  }

  if (staleSnapshotKeys.length) {
    console.error("\nThe previous i18n snapshot still contains removed keys:");
    for (const item of staleSnapshotKeys) {
      console.error(`- ${item}`);
    }
  }

  if (missingTranslations.length) {
    console.error("\nMissing translations:");
    for (const item of missingTranslations) {
      console.error(`- ${formatEntryLabel(item.entry)} is missing ${item.locale}`);
    }
  }

  console.error("\nRun `npm run i18n:sync` after editing English template text.");
  process.exit(1);
}

console.log("English defaults now come from the templates.");
console.log("Removed `en` entries from `_data/i18n.js` and refreshed the i18n snapshot.");

if (englishChanges.length && hasSavedSnapshot) {
  console.log("\nReview these translations after the English update:");
  for (const change of englishChanges) {
    const reviewList = change.reviewLocales.length
      ? change.reviewLocales.join(", ")
      : "no non-English locales configured";
    console.log(`- ${formatEntryLabel(change.entry)} -> ${reviewList}`);
  }
} else if (!hasSavedSnapshot) {
  console.log("\nInitialized the English snapshot from the current templates.");
}

if (missingTranslations.length) {
  console.log("\nFill in these blank or missing translations:");
  for (const item of missingTranslations) {
    console.log(`- ${formatEntryLabel(item.entry)} is missing ${item.locale}`);
  }
}

function collectTemplateFiles() {
  const files = [];
  const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });

  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    if (!hasTemplateExtension(entry.name)) continue;
    files.push(entry.name);
  }

  walkDir(path.join(projectRoot, "_includes"), (absolutePath) => {
    if (!hasTemplateExtension(absolutePath)) return;
    files.push(path.relative(projectRoot, absolutePath));
  });

  return files.sort();
}

function walkDir(dirPath, onFile) {
  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkDir(absolutePath, onFile);
      continue;
    }

    if (entry.isFile()) {
      onFile(absolutePath);
    }
  }
}

function hasTemplateExtension(filePath) {
  const ext = path.extname(filePath);
  return ext === ".njk" || ext === ".html";
}

function getScopeForFile(relPath) {
  if (relPath.startsWith("_includes/")) {
    return { type: "shared" };
  }

  const ext = path.extname(relPath);
  if (!ext) return null;

  return {
    type: "page",
    pageKey: path.basename(relPath, ext),
  };
}

function extractContentEntries(source, relPath, scope) {
  const elementPattern =
    /<([a-zA-Z][\w:-]*)([^>]*\b(?:data-i18n|data-i18n-html)="[^"]+"[^>]*)>([\s\S]*?)<\/\1>/g;

  let match;

  while ((match = elementPattern.exec(source)) !== null) {
    const attrs = match[2];
    const textKey = getAttribute(attrs, "data-i18n");
    const htmlKey = getAttribute(attrs, "data-i18n-html");
    const key = htmlKey || textKey;

    if (!key || isDynamicValue(key)) continue;

    const rawContent = match[3];
    if (isDynamicValue(rawContent)) continue;

    const value = htmlKey
      ? normalizeHtmlContent(rawContent)
      : normalizeTextContent(rawContent);

    if (!value) continue;

    registerEntry({
      scope,
      key,
      sourcePath: relPath,
      value,
    });
  }
}

function extractAttributeEntries(source, relPath, scope) {
  const tagPattern =
    /<([a-zA-Z][\w:-]*)([^>]*\bdata-i18n-(?:placeholder|title|aria-label|alt)="[^"]+"[^>]*)>/g;

  let match;

  while ((match = tagPattern.exec(source)) !== null) {
    const attrs = match[2];
    const pairs = [
      ["data-i18n-placeholder", "placeholder"],
      ["data-i18n-title", "title"],
      ["data-i18n-aria-label", "aria-label"],
      ["data-i18n-alt", "alt"],
    ];

    for (const [keyAttr, valueAttr] of pairs) {
      const key = getAttribute(attrs, keyAttr);
      if (!key || isDynamicValue(key)) continue;

      const rawValue = getAttribute(attrs, valueAttr);
      if (!rawValue || isDynamicValue(rawValue)) continue;

      registerEntry({
        scope,
        key,
        sourcePath: relPath,
        value: normalizeTextContent(rawValue),
      });
    }
  }
}

function registerEntry(entry) {
  const mapKey = getSnapshotKey(entry);
  const existing = extractedEntries.get(mapKey);

  if (!existing) {
    extractedEntries.set(mapKey, entry);
    return;
  }

  if (existing.value !== entry.value) {
    conflicts.push({
      first: { entry: existing },
      second: { entry },
    });
  }
}

function stripEnglishBranches(data) {
  if (data.shared && data.shared.en) {
    delete data.shared.en;
  }

  if (!data.pages) return;

  for (const pageKey of Object.keys(data.pages)) {
    if (data.pages[pageKey] && data.pages[pageKey].en) {
      delete data.pages[pageKey].en;
    }
  }
}

function getSupportedLocales(data) {
  const localeSet = new Set();

  if (data.shared) {
    for (const locale of Object.keys(data.shared)) {
      if (locale !== "en") localeSet.add(locale);
    }
  }

  if (data.pages) {
    for (const pageKey of Object.keys(data.pages)) {
      const pageLocales = data.pages[pageKey] || {};
      for (const locale of Object.keys(pageLocales)) {
        if (locale !== "en") localeSet.add(locale);
      }
    }
  }

  return Array.from(localeSet).sort();
}

function syncNonEnglishStructure(data, entries, locales) {
  if (!data.shared) {
    data.shared = {};
  }

  if (!data.pages) {
    data.pages = {};
  }

  for (const locale of locales) {
    if (!data.shared[locale]) {
      data.shared[locale] = {};
    }
  }

  for (const entry of entries.values()) {
    for (const locale of locales) {
      const bucket = getLocaleBucket(data, entry, locale, true);
      if (typeof bucket[entry.key] !== "string") {
        bucket[entry.key] = "";
      }
    }
  }
}

function collectMissingTranslations(data, entries, locales) {
  const results = [];

  for (const entry of entries.values()) {
    for (const locale of locales) {
      const bucket = getLocaleBucket(data, entry, locale, false);
      const value = bucket ? bucket[entry.key] : undefined;

      if (typeof value !== "string" || value.trim() === "") {
        results.push({ entry, locale });
      }
    }
  }

  return results;
}

function collectEnglishChanges(entries, snapshot) {
  const results = [];

  for (const entry of entries.values()) {
    const snapshotKey = getSnapshotKey(entry);
    const previousValue = snapshot[snapshotKey];

    if (previousValue === undefined) {
      results.push({
        entry,
        previousValue: undefined,
        nextValue: entry.value,
        reviewLocales: [],
      });
      continue;
    }

    if (previousValue !== entry.value) {
      results.push({
        entry,
        previousValue,
        nextValue: entry.value,
        reviewLocales: [],
      });
    }
  }

  return results.map((item) => ({
    ...item,
    reviewLocales: getSupportedLocales(i18n).filter((locale) => {
      const bucket = getLocaleBucket(i18n, item.entry, locale, false);
      return Boolean(bucket && typeof bucket[item.entry.key] === "string");
    }),
  }));
}

function collectStaleSnapshotKeys(snapshot, currentSnapshot) {
  return Object.keys(snapshot)
    .filter((key) => !(key in currentSnapshot))
    .sort();
}

function getLocaleBucket(data, entry, locale, createIfMissing) {
  if (entry.scope.type === "shared") {
    if (!data.shared) {
      if (!createIfMissing) return null;
      data.shared = {};
    }

    if (!data.shared[locale] && createIfMissing) {
      data.shared[locale] = {};
    }

    return data.shared[locale] || null;
  }

  if (!data.pages) {
    if (!createIfMissing) return null;
    data.pages = {};
  }

  if (!data.pages[entry.scope.pageKey] && createIfMissing) {
    data.pages[entry.scope.pageKey] = {};
  }

  const pageBucket = data.pages[entry.scope.pageKey];
  if (!pageBucket) return null;

  if (!pageBucket[locale] && createIfMissing) {
    pageBucket[locale] = {};
  }

  return pageBucket[locale] || null;
}

function buildSnapshot(entries) {
  const snapshot = {};

  for (const entry of entries.values()) {
    snapshot[getSnapshotKey(entry)] = entry.value;
  }

  return snapshot;
}

function readSnapshot() {
  if (!fs.existsSync(snapshotPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch (error) {
    console.error(`Failed to parse ${path.relative(projectRoot, snapshotPath)}.`);
    console.error(error);
    process.exit(1);
  }
}

function writeSnapshot(snapshot) {
  fs.writeFileSync(`${snapshotPath}`, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function getSnapshotKey(entry) {
  return entry.scope.type === "shared"
    ? `shared.${entry.key}`
    : `pages.${entry.scope.pageKey}.${entry.key}`;
}

function getAttribute(attrs, name) {
  const pattern = new RegExp(`${escapeRegExp(name)}=(["'])([\\s\\S]*?)\\1`);
  const match = attrs.match(pattern);
  return match ? match[2] : null;
}

function normalizeTextContent(value) {
  const withoutTags = value.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);
  return collapseWhitespace(decoded);
}

function normalizeHtmlContent(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
    bull: "•",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1].toLowerCase() === "x";
      const numeric = isHex
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);

      if (Number.isNaN(numeric)) return match;
      return String.fromCodePoint(numeric);
    }

    return Object.prototype.hasOwnProperty.call(named, entity)
      ? named[entity]
      : match;
  });
}

function isDynamicValue(value) {
  return value.includes("{{") || value.includes("{%");
}

function formatEntryLabel(entry) {
  return entry.scope.type === "shared"
    ? `shared.${entry.key}`
    : `pages.${entry.scope.pageKey}.${entry.key}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeModule(data) {
  return `module.exports = ${JSON.stringify(data, null, 2)};\n`;
}
