const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const user = await db.user.findFirst();
  if (!user) {
    console.log("No user found");
    return;
  }
  
  const existing = await db.category.findFirst({
    where: { userId: user.id, name: 'Other' }
  });

  if (!existing) {
    await db.category.create({
      data: {
        userId: user.id,
        name: 'Other',
        type: 'Expense',
        color: '#94a3b8'
      }
    });
    console.log("Category 'Other' created successfully!");
  } else {
    console.log("Category 'Other' already exists!");
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
