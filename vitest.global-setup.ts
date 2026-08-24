import { execSync } from 'child_process';

export function setup() {
  process.env.DATABASE_URL = 'file:../test.db';
  console.log('Migrating test database...');
  execSync('npx prisma db push --force-reset --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: 'file:../test.db' },
    stdio: 'inherit',
  });
}
