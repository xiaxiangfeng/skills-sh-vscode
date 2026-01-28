const { spawnSync } = require('child_process');

const token = process.env.OVSX_PAT;
if (!token) {
  console.error('Missing OVSX_PAT environment variable.');
  process.exit(1);
}

const result = spawnSync('npx', ['ovsx', 'publish', '-p', token], {
  stdio: 'inherit',
  shell: true
});

process.exit(result.status ?? 1);
