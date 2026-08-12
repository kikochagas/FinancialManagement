const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, 'prisma', 'seed.ts');
let code = fs.readFileSync(seedPath, 'utf8');

// Insert User creation before Settings
const userCreation = `
  // 1.5 Create User
  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      email: 'demo@example.com',
      passwordHash: 'hashed',
      name: 'Demo User'
    }
  });
`;

code = code.replace('// 2. Create Settings', userCreation + '\n  // 2. Create Settings');

// Replace all `data: {` with `data: { userId: user.id,` for the models
// Let's use a regex that matches `data: {` inside `prisma.<model>.create({`
code = code.replace(/prisma\.\w+\.create\(\{\s*data:\s*\{/g, (match) => {
  return match + '\n      userId: user.id,';
});

fs.writeFileSync(seedPath, code);
console.log('Fixed seed.ts');
