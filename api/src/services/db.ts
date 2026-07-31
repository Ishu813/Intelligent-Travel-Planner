import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set for the API process. Ensure the API loads the root .env (see api/package.json dev/start scripts).",
  );
}

const pool = new Pool({ connectionString });

export const db = {
  async ping() {
    const res = await pool.query("select 1 as ok");
    return res.rows[0]?.ok === 1;
  },
};
