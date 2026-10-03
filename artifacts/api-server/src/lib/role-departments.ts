import { eq, sql } from "drizzle-orm";
import { db, departmentsTable } from "@workspace/db";

export const FARMASEVT_DEPARTMENT_NAME = "Farmasevt";

export const PHARMACY_USER_ROLES = ["mudir", "farmasevt", "stajyor"] as const;

/** Rol → bo‘lim nomi. Faqat mudir/farmasevt/stajyor «Farmasevt» bo‘limida. */
export const BORDO_DEPARTMENT_NAMES = [
  "Rahbariyat",
  "Showroom hodimlari",
  "Savdo bo‘limi",
  "Savdo agentlari bo‘limi",
  "Ombor bo‘limi",
  "Yuklash-tushirish va yig‘uv bo‘limi",
  "Xo‘jalik bo‘limi",
] as const;

export const ROLE_DEPARTMENT_NAME: Record<string, string> = {
  admin: "Rahbariyat",
  director: "Rahbariyat",
  hr_direktor: "Rahbariyat",
  showroom: "Showroom hodimlari",
  kassir: "Savdo bo‘limi",
  sotuv_menejer: "Savdo bo‘limi",
  asistent_agent: "Savdo agentlari bo‘limi",
  savdo_agenti: "Savdo agentlari bo‘limi",
  zakupchi: "Ombor bo‘limi",
  priyomkachi: "Ombor bo‘limi",
  ombor_rahbar: "Ombor bo‘limi",
  yuk_xodim: "Yuklash-tushirish va yig‘uv bo‘limi",
  yiguvchi: "Yuklash-tushirish va yig‘uv bo‘limi",
  shafyor: "Yuklash-tushirish va yig‘uv bo‘limi",
  oshpaz: "Xo‘jalik bo‘limi",
  farrosh: "Xo‘jalik bo‘limi",
};

export function departmentNameForRole(role?: string | null): string | null {
  if (!role) return null;
  return ROLE_DEPARTMENT_NAME[role] ?? null;
}

function normalizeDeptName(name: string): string {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("uz");
}

async function reassignDepartmentRefs(fromId: number, toId: number) {
  await db.execute(sql`UPDATE users SET department_id = ${toId} WHERE department_id = ${fromId}`);
  try {
    await db.execute(sql`UPDATE employees SET department_id = ${toId} WHERE department_id = ${fromId}`);
  } catch {
    /* ustun yo‘q bo‘lishi mumkin */
  }
  try {
    await db.execute(sql`UPDATE requests SET department_id = ${toId} WHERE department_id = ${fromId}`);
  } catch {
    /* ignore */
  }
  try {
    await db.execute(
      sql`UPDATE department_job_titles SET department_id = ${toId} WHERE department_id = ${fromId}`,
    );
  } catch {
    /* ignore */
  }
  try {
    await db.execute(
      sql`UPDATE department_attendance_qr SET department_id = ${toId} WHERE department_id = ${fromId}`,
    );
  } catch {
    /* ignore */
  }
}

/** Bir xil nomdagi dublikatlarni birlashtirish (masalan 2 ta «Koordinator»). */
export async function dedupeDepartmentsByName(): Promise<number> {
  const rows = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      headId: departmentsTable.headId,
    })
    .from(departmentsTable);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = normalizeDeptName(r.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  let removed = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    // Saqlanadigan: boshlig‘i bor yoki eng kichik id
    const sorted = [...list].sort((a, b) => {
      if ((a.headId != null) !== (b.headId != null)) return a.headId != null ? -1 : 1;
      return a.id - b.id;
    });
    const keep = sorted[0]!;
    const canonName =
      Object.values(ROLE_DEPARTMENT_NAME).find(
        (n) => normalizeDeptName(n) === normalizeDeptName(keep.name),
      ) || keep.name.trim();

    if (keep.name !== canonName) {
      await db
        .update(departmentsTable)
        .set({ name: canonName })
        .where(eq(departmentsTable.id, keep.id));
    }

    for (const dup of sorted.slice(1)) {
      await reassignDepartmentRefs(dup.id, keep.id);
      await db.delete(departmentsTable).where(eq(departmentsTable.id, dup.id));
      removed += 1;
    }
  }
  return removed;
}

export async function ensureDepartmentByName(name: string): Promise<number> {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Bo‘lim nomi bo‘sh");

  const [existing] = await db
    .select({ id: departmentsTable.id, name: departmentsTable.name })
    .from(departmentsTable)
    .where(sql`lower(trim(name)) = ${normalizeDeptName(trimmed)}`)
    .limit(1);
  if (existing) {
    if (existing.name !== trimmed) {
      await db
        .update(departmentsTable)
        .set({ name: trimmed })
        .where(eq(departmentsTable.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(departmentsTable)
    .values({ name: trimmed })
    .returning({ id: departmentsTable.id });
  if (created) return created.id;

  const [again] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(sql`lower(trim(name)) = ${normalizeDeptName(trimmed)}`)
    .limit(1);
  if (!again) throw new Error(`«${trimmed}» bo‘limi yaratilmadi`);
  return again.id;
}

export async function resolveDepartmentIdForRole(role: string): Promise<number | null> {
  const name = departmentNameForRole(role);
  if (!name) return null;
  return ensureDepartmentByName(name);
}

/** BORDO bo‘limlarini yaratadi. Qo‘lda qo‘shilgan boshqa bo‘limlar o‘chirilmaydi. */
export async function syncAllRoleDepartmentAssignments(): Promise<void> {
  await dedupeDepartmentsByName();
  for (const name of BORDO_DEPARTMENT_NAMES) {
    await ensureDepartmentByName(name);
  }
  for (const [role, deptName] of Object.entries(ROLE_DEPARTMENT_NAME)) {
    const deptId = await ensureDepartmentByName(deptName);
    await db.execute(sql`
      UPDATE users
      SET department_id = ${deptId}
      WHERE role = ${role}
        AND department_id IS NULL
    `);
  }
}
