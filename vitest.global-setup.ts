import { execSync } from 'child_process';

export function setup() {
  process.env.DATABASE_URL = 'file:../test.db';
  console.log('Migrating test database...');
  
  const testEnv: Record<string, string | undefined> = { ...process.env, DATABASE_URL: 'file:../test.db' };
  delete testEnv.TURSO_DATABASE_URL;
  delete testEnv.TURSO_AUTH_TOKEN;
  delete testEnv.RENDER;

  execSync('npx prisma db push --force-reset --accept-data-loss', {
    env: testEnv as any,
    stdio: 'inherit',
  });
}
