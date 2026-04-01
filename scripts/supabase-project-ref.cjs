#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const command = args[0] || 'print';
const dryRun = args.includes('--dry-run');

function readEnvValue(key) {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(repoRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith('#')) continue;
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, foundKey, rawValue] = match;
      if (foundKey !== key) continue;
      return rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
  return process.env[key];
}

function getProjectRef() {
  const url = readEnvValue('NEXT_PUBLIC_SUPABASE_URL') || readEnvValue('SUPABASE_URL');
  if (!url) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL in .env.local or .env');
    process.exit(1);
  }

  const match = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  if (!match) {
    console.error(`Could not extract Supabase project ref from URL: ${url}`);
    process.exit(1);
  }

  return match[1];
}

const projectRef = getProjectRef();

if (command === 'print') {
  console.log(projectRef);
  process.exit(0);
}

if (command === 'link') {
  const cliArgs = ['link', '--project-ref', projectRef];
  if (dryRun) {
    console.log(`supabase ${cliArgs.join(' ')}`);
    process.exit(0);
  }

  const result = spawnSync('supabase', cliArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

console.error(`Unknown command: ${command}`);
console.error('Usage: node scripts/supabase-project-ref.cjs [print|link] [--dry-run]');
process.exit(1);
