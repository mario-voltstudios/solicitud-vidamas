#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const [, , slugArg] = process.argv;
if (!slugArg) {
  console.error('Usage: node scripts/new-data-fix.cjs <slug>');
  process.exit(1);
}

const slug = slugArg.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
if (!slug) {
  console.error('Slug must contain at least one alphanumeric character.');
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = [now.getUTCFullYear(), pad(now.getUTCMonth() + 1), pad(now.getUTCDate())].join('') + '_' + [pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())].join('');
const dir = path.join(process.cwd(), 'supabase', 'data-fixes', `${stamp}_${slug}`);
fs.mkdirSync(dir, { recursive: true });

const sourceTable = '<source_table>';
const pk = '<primary_key>';
const backupTable = `backup_${sourceTable}_${stamp}_${slug}`;

const files = {
  'manifest.md': `# Data fix manifest — ${slug}\n\n- **Project:** solicitud-vidamas\n- **Created (UTC):** ${now.toISOString()}\n- **Requested by:** <name>\n- **Executed by:** <name>\n- **Why:** <why this change is needed>\n- **Target table(s):** <table list>\n- **Expected blast radius:** <estimated rows / scope>\n- **Backup table:** ${backupTable}\n- **Dry-run query:** <paste the SELECT that identifies affected rows>\n- **Success criteria:** <what must be true after apply>\n- **Rollback trigger:** <when to restore>\n`,
  'backup.sql': `create table if not exists ${backupTable} as\nselect *\nfrom ${sourceTable}\nwhere <affected_rows_predicate>;\n\nselect count(*) as backed_up_rows from ${backupTable};\n`,
  'apply.sql': `begin;\n\n-- update ${sourceTable}\n-- set <column> = <new_value>\n-- where <affected_rows_predicate>;\n\ncommit;\n`,
  'restore.sql': `begin;\n\n-- update ${sourceTable} t\n-- set <column> = b.<column>\n-- from ${backupTable} b\n-- where t.${pk} = b.${pk};\n\ncommit;\n`,
  'verify.sql': `select count(*) as backup_rows from ${backupTable};\n\nselect count(*) as live_rows\nfrom ${sourceTable}\nwhere <affected_rows_predicate>;\n`,
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}

console.log(dir);
