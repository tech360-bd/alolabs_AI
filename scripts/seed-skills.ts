import { db } from '../src/lib/db';

import { seedSkills } from './shared/seed-skills.js';

seedSkills(db).catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
