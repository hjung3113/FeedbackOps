import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({ connectionString: databaseUrl });
const migrationsDirectory = new URL("./migrations", import.meta.url);

try {
  await pool.query("create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())");
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const alreadyApplied = await pool.query("select 1 from schema_migrations where filename = $1", [file]);
    if (alreadyApplied.rowCount) continue;

    const sql = await readFile(join(migrationsDirectory.pathname, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (filename) values ($1)", [file]);
      await pool.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
} finally {
  await pool.end();
}
