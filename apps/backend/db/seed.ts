import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const pool = new Pool({ connectionString: databaseUrl });
const seedFile = new URL("./seed.sql", import.meta.url);

try {
  await pool.query(await readFile(seedFile, "utf8"));
  console.log("seeded FeedbackOps MVP data");
} finally {
  await pool.end();
}
