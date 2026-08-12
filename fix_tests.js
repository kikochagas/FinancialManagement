const fs = require('fs');
const glob = require('fs').readdirSync; // not real glob, I'll just use path
const path = require('path');

const files = [
  'src/features/transactions/__tests__/actions.test.ts',
  'src/features/accounts/__tests__/actions.test.ts',
  'src/features/investments/__tests__/actions.test.ts',
  'src/features/goals/__tests__/actions.test.ts',
  'src/features/settings/__tests__/actions.test.ts',
  'src/features/reports/__tests__/actions.test.ts',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /vi\.mock\('@\/lib\/db', \(\) => \(\{\s*db: mockDeep\(\)\s*\}\)\);/g,
    `vi.mock('@/lib/db', async (importOriginal) => {
  const { mockDeep } = await import('vitest-mock-extended');
  return { db: mockDeep() };
});`
  );
  fs.writeFileSync(file, content);
}
console.log('Fixed tests');
