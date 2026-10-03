import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const KEEP = [
  "rahbariyat",
  "showroom hodimlari",
  "savdo bo'limi",
  "savdo agentlari bo'limi",
  "ombor bo'limi",
  "yuklash-tushirish va yig'uv bo'limi",
  "xo'jalik bo'limi",
];

const CREATE = [
  "Rahbariyat",
  "Showroom hodimlari",
  "Savdo bo‘limi",
  "Savdo agentlari bo‘limi",
  "Ombor bo‘limi",
  "Yuklash-tushirish va yig‘uv bo‘limi",
  "Xo‘jalik bo‘limi",
];

function norm(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("uz")
    .replace(/[\u2018\u2019\u02BB\u02BC'`]/g, "'");
}

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

async function main() {
  loadEnv();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    for (const name of CREATE) {
      const { rows } = await client.query(`SELECT id FROM departments WHERE lower(trim(name)) = lower(trim($1))`, [
        name.replace(/[\u2018\u2019]/g, "'"),
      ]);
      const existing = await client.query(`SELECT id, name FROM departments`);
      const hit = existing.rows.find((r) => norm(r.name) === norm(name));
      if (!hit) {
        await client.query(`INSERT INTO departments (name) VALUES ($1)`, [name]);
        console.log(`+ ${name}`);
      } else if (hit.name !== name) {
        await client.query(`UPDATE departments SET name = $1 WHERE id = $2`, [name, hit.id]);
        console.log(`~ ${hit.name} → ${name}`);
      } else {
        console.log(`= ${name}`);
      }
      void rows;
    }

    const { rows } = await client.query(`SELECT id, name FROM departments`);
    for (const row of rows) {
      if (KEEP.includes(norm(row.name))) continue;
      const used = await client.query(
        `SELECT
           (SELECT count(*) FROM users WHERE department_id = $1) AS users,
           (SELECT count(*) FROM employees WHERE department_id = $1) AS employees`,
        [row.id],
      );
      const users = Number(used.rows[0]?.users ?? 0);
      const employees = Number(used.rows[0]?.employees ?? 0);
      if (users || employees) {
        console.log(`saqlab qolindi (ishlatilgan): ${row.name}`);
        continue;
      }
      try {
        await client.query(`DELETE FROM departments WHERE id = $1`, [row.id]);
        console.log(`- ${row.name}`);
      } catch (err) {
        console.log(`saqlab qolindi (bog‘langan): ${row.name}`);
        void err;
      }
    }
    const left = await client.query(`SELECT name FROM departments ORDER BY id`);
    console.log("---");
    for (const row of left.rows) console.log(row.name);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
