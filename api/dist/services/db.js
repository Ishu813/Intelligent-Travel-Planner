import { Pool } from "pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set for the API process. Ensure the API loads the root .env (see api/package.json dev/start scripts).");
}
const pool = new Pool({
    connectionString
});
export const db = {
    async ping() {
        const res = await pool.query("select 1 as ok");
        return res.rows[0]?.ok === 1;
    },
    async query(text, params) {
        const res = await pool.query(text, params);
        return res.rows;
    },
    async getPublicTrip(uuid) {
        const rows = await pool.query(`
      select
        t.public_uuid,
        t.title,
        t.from_location,
        t.to_location,
        t.start_date,
        t.days,
        t.mode,
        t.budget_inr,
        t.pace,
        t.route_profile,
        ST_AsGeoJSON(t.route_geom)::jsonb as route,
        i.content as itinerary
      from trips t
      left join itineraries i on i.trip_id = t.id
      where t.public_uuid = $1
      limit 1
      `, [uuid]);
        return rows.rows[0] ?? null;
    },
    async close() {
        await pool.end();
    }
};
