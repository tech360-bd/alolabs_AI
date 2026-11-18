const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const { seedSkills } = require('./shared/seed-skills.js');

seedSkills(db).catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
