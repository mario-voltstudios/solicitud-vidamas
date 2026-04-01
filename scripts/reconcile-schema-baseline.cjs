#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const reconciliationDir = path.join(repoRoot, 'supabase', 'reconciliation');
const argPath = process.argv[2] ? path.resolve(repoRoot, process.argv[2]) : null;
const remoteInventoryPath = path.join(reconciliationDir, 'remote-inventory.json');
const remoteSchemaPath = path.join(reconciliationDir, 'remote-schema.sql');
const summaryJsonPath = path.join(reconciliationDir, 'latest-summary.json');
const summaryMdPath = path.join(reconciliationDir, 'latest-summary.md');

function cleanIdentifier(value) {
  return value.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function qualifyIdentifier(value) {
  const cleaned = cleanIdentifier(value);
  return cleaned.includes('.') ? cleaned : `public.${cleaned}`;
}

function normalizeObjectKey(key) {
  const cleaned = cleanIdentifier(key);
  const [type, ...rest] = cleaned.split(':');

  if (rest.length === 0) return cleaned;
  if (type === 'policy' && rest.length >= 2) {
    const tableName = qualifyIdentifier(rest[0]);
    const policyName = rest.slice(1).join(':');
    return `policy:${tableName}:${policyName}`;
  }

  return `${type}:${qualifyIdentifier(rest.join(':'))}`;
}

function parseObjectSet(sqlText) {
  const objects = new Set();
  const patterns = [
    { type: 'table', regex: /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[\w]+"?\.)?"?[\w]+"?)/gi },
    { type: 'view', regex: /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+((?:"?[\w]+"?\.)?"?[\w]+"?)/gi },
    { type: 'function', regex: /create\s+(?:or\s+replace\s+)?function\s+((?:"?[\w]+"?\.)?"?[\w]+"?)/gi },
    { type: 'type', regex: /create\s+type\s+(?:if\s+not\s+exists\s+)?((?:"?[\w]+"?\.)?"?[\w]+"?)/gi },
  ];

  for (const { type, regex } of patterns) {
    for (const match of sqlText.matchAll(regex)) {
      objects.add(`${type}:${qualifyIdentifier(match[1])}`);
    }
  }

  for (const match of sqlText.matchAll(/create\s+policy\s+("[^"]+"|[\w-]+)\s+on\s+((?:"?[\w]+"?\.)?"?[\w]+"?)/gi)) {
    const policyName = cleanIdentifier(match[1]);
    const tableName = qualifyIdentifier(match[2]);
    objects.add(`policy:${tableName}:${policyName}`);
  }

  return objects;
}

function loadRemoteObjects() {
  const candidate = argPath || (fs.existsSync(remoteInventoryPath) ? remoteInventoryPath : remoteSchemaPath);

  if (!candidate || !fs.existsSync(candidate)) {
    console.error('Remote reconciliation source not found.');
    console.error('Next steps:');
    console.error('  1. node scripts/supabase-project-ref.cjs link');
    console.error('  2. export SUPABASE_DB_URL=<remote connection string>');
    console.error('  3. python3 scripts/export-remote-schema-inventory.py supabase/reconciliation/remote-inventory.json');
    console.error('  4. node scripts/reconcile-schema-baseline.cjs');
    process.exit(1);
  }

  if (candidate.endsWith('.json')) {
    const payload = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    return {
      sourcePath: path.relative(repoRoot, candidate),
      sourceType: payload.source || 'inventory-json',
      objects: new Set((payload.objects || []).map(normalizeObjectKey)),
    };
  }

  return {
    sourcePath: path.relative(repoRoot, candidate),
    sourceType: 'sql-schema-dump',
    objects: parseObjectSet(fs.readFileSync(candidate, 'utf8')),
  };
}

fs.mkdirSync(reconciliationDir, { recursive: true });

const migrationFiles = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  : [];

const localObjects = new Set();
for (const fileName of migrationFiles) {
  const filePath = path.join(migrationsDir, fileName);
  const sqlText = fs.readFileSync(filePath, 'utf8');
  for (const objectName of parseObjectSet(sqlText)) {
    localObjects.add(objectName);
  }
}

const remote = loadRemoteObjects();
const remoteObjects = remote.objects;

const localOnly = [...localObjects].filter((name) => !remoteObjects.has(name)).sort();
const remoteOnly = [...remoteObjects].filter((name) => !localObjects.has(name)).sort();

const summary = {
  generatedAt: new Date().toISOString(),
  remoteSourcePath: remote.sourcePath,
  remoteSourceType: remote.sourceType,
  migrationFiles,
  counts: {
    localObjects: localObjects.size,
    remoteObjects: remoteObjects.size,
    localOnly: localOnly.length,
    remoteOnly: remoteOnly.length,
  },
  localOnly,
  remoteOnly,
};

fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

const md = [
  '# Supabase baseline reconciliation',
  '',
  `- Generated (UTC): ${summary.generatedAt}`,
  `- Remote source: \`${summary.remoteSourcePath}\``,
  `- Remote source type: ${summary.remoteSourceType}`,
  `- Migration files: ${migrationFiles.length}`,
  `- Local objects parsed: ${summary.counts.localObjects}`,
  `- Remote objects parsed: ${summary.counts.remoteObjects}`,
  `- Local-only objects: ${summary.counts.localOnly}`,
  `- Remote-only objects: ${summary.counts.remoteOnly}`,
  '',
  '## Local-only objects',
  '',
  ...(localOnly.length ? localOnly.map((item) => `- \`${item}\``) : ['- None']),
  '',
  '## Remote-only objects',
  '',
  ...(remoteOnly.length ? remoteOnly.map((item) => `- \`${item}\``) : ['- None']),
  '',
].join('\n');

fs.writeFileSync(summaryMdPath, md, 'utf8');

console.log(`Wrote ${path.relative(repoRoot, summaryJsonPath)}`);
console.log(`Wrote ${path.relative(repoRoot, summaryMdPath)}`);
console.log(`Local-only: ${localOnly.length}`);
console.log(`Remote-only: ${remoteOnly.length}`);
