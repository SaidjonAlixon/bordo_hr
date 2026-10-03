import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  bordoPlacesTable,
  bordoPlaceAssignmentsTable,
  bordoShiftsTable,
  bordoShiftAssignmentsTable,
  departmentsTable,
  employeesTable,
  usersTable,
} from "@workspace/db";
import { encodeBordoShiftType, hmToMinutes } from "./shift-hours";
import { ensurePlaceQr, revokeActiveQrForPlace } from "./place-attendance-qr";

export const BORDO_PLACE_ROLES: { value: string; label: string }[] = [
  { value: "director", label: "Direktor" },
  { value: "hr_direktor", label: "HRD" },
  { value: "showroom", label: "Showroom jamoasi" },
  { value: "kassir", label: "Bosh kassir" },
  { value: "sotuv_menejer", label: "Sotuv menejeri" },
  { value: "asistent_agent", label: "Asistent agent" },
  { value: "savdo_agenti", label: "Savdo agenti" },
  { value: "zakupchi", label: "Zakupchi" },
  { value: "priyomkachi", label: "Priyomkachi" },
  { value: "ombor_rahbar", label: "ZavSklad / Ombor mudiri" },
  { value: "yuk_xodim", label: "Yuk bo‘limi xodimlari" },
  { value: "yiguvchi", label: "Yig‘uvchilar" },
  { value: "shafyor", label: "Shafyor" },
  { value: "oshpaz", label: "Oshpaz" },
  { value: "farrosh", label: "Tozalovchi" },
  { value: "xodim", label: "Xodim" },
  { value: "admin", label: "Admin" },
];

const ROLE_LABEL = new Map(BORDO_PLACE_ROLES.map((r) => [r.value, r.label]));

type Scope = "department" | "role" | "user";

type PlaceRow = typeof bordoPlacesTable.$inferSelect;
type ShiftRow = typeof bordoShiftsTable.$inferSelect;

export type ResolvedPlace = {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
};

export function normalizeHm(raw: string): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(raw || "").trim());
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function rankAssignment(
  row: { scope: string; departmentId: number | null; role: string | null; userId: number | null },
  person: { userId: number | null; role: string; departmentId: number | null },
): number {
  if (row.scope === "user" && person.userId != null && row.userId === person.userId) return 3;
  if (row.scope === "role" && row.role && row.role === person.role) return 2;
  if (row.scope === "department" && person.departmentId != null && row.departmentId === person.departmentId) return 1;
  return 0;
}

function pickBest<T extends { id: number }>(
  rows: T[],
  rank: (row: T) => number,
): T | null {
  let best: T | null = null;
  let bestRank = 0;
  for (const row of rows) {
    const r = rank(row);
    if (r > bestRank || (r === bestRank && r > 0 && best && row.id > best.id)) {
      best = row;
      bestRank = r;
    }
  }
  return bestRank > 0 ? best : null;
}

async function loadUserDept(userId: number | null): Promise<number | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ departmentId: usersTable.departmentId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.departmentId ?? null;
}

export async function ensureMainBordoPlace(): Promise<PlaceRow> {
  const [existing] = await db
    .select()
    .from(bordoPlacesTable)
    .where(eq(bordoPlacesTable.isMain, true))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(bordoPlacesTable)
    .values({
      name: "Asosiy ofis",
      latitude: 41.21925,
      longitude: 69.273028,
      radiusMeters: 100,
      isMain: true,
      active: true,
    })
    .returning();
  return created!;
}

export async function resolveBordoPlaceForUser(
  userId: number | null,
  role: string,
): Promise<ResolvedPlace | null> {
  const departmentId = await loadUserDept(userId);
  const places = await db.select().from(bordoPlacesTable).where(eq(bordoPlacesTable.active, true));
  if (!places.length) {
    const main = await ensureMainBordoPlace();
    return toResolved(main);
  }
  const assignments = await db.select().from(bordoPlaceAssignmentsTable);
  const byPlace = new Map(places.map((p) => [p.id, p]));
  const matched = pickBest(assignments, (row) =>
    byPlace.has(row.placeId) ? rankAssignment(row, { userId, role, departmentId }) : 0,
  );
  const place = matched ? byPlace.get(matched.placeId) : places.find((p) => p.isMain) || places[0];
  return place ? toResolved(place) : null;
}

function toResolved(place: PlaceRow): ResolvedPlace {
  return {
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    radiusMeters: place.radiusMeters > 0 ? place.radiusMeters : 100,
  };
}

async function resolveShiftForPerson(person: {
  userId: number | null;
  role: string;
  departmentId: number | null;
}): Promise<ShiftRow | null> {
  const shifts = await db.select().from(bordoShiftsTable).where(eq(bordoShiftsTable.active, true));
  if (!shifts.length) return null;
  const places = await db.select({ id: bordoPlacesTable.id }).from(bordoPlacesTable).where(eq(bordoPlacesTable.active, true));
  const livePlaces = new Set(places.map((p) => p.id));
  const live = shifts.filter((s) => livePlaces.has(s.placeId));
  const assignments = await db.select().from(bordoShiftAssignmentsTable);
  const byShift = new Map(live.map((s) => [s.id, s]));
  const matched = pickBest(assignments, (row) =>
    byShift.has(row.shiftId) ? rankAssignment(row, person) : 0,
  );
  return matched ? byShift.get(matched.shiftId) ?? null : null;
}

/** Davomat vaqti shu xodimning smenasiga yoziladi. Aniq xodim > lavozim > bo‘lim. */
export async function applyBordoAttendanceForEmployee(
  emp: { id: number; userId: number | null; shiftType: string | null; shiftLabel: string | null },
  userRole: string,
): Promise<void> {
  const departmentId = await loadUserDept(emp.userId);
  const shift = await resolveShiftForPerson({ userId: emp.userId, role: userRole, departmentId });
  if (shift) {
    const encoded = encodeBordoShiftType(shift.startHm, shift.endHm, shift.overnight);
    if (emp.shiftType !== encoded || emp.shiftLabel !== shift.name) {
      emp.shiftType = encoded;
      emp.shiftLabel = shift.name;
      await db
        .update(employeesTable)
        .set({ shiftType: encoded, shiftLabel: shift.name })
        .where(eq(employeesTable.id, emp.id));
    }
    return;
  }
  if (String(emp.shiftType || "").startsWith("bd:")) {
    emp.shiftType = "office";
    emp.shiftLabel = null;
    await db
      .update(employeesTable)
      .set({ shiftType: "office", shiftLabel: null })
      .where(eq(employeesTable.id, emp.id));
  }
}

async function syncAllBordoShifts(): Promise<void> {
  const users = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
    })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));
  if (!users.length) return;
  const employees = await db
    .select({
      id: employeesTable.id,
      userId: employeesTable.userId,
      shiftType: employeesTable.shiftType,
      shiftLabel: employeesTable.shiftLabel,
      employmentStatus: employeesTable.employmentStatus,
    })
    .from(employeesTable)
    .where(inArray(employeesTable.userId, users.map((u) => u.id)));
  const byUser = new Map(users.map((u) => [u.id, u]));
  for (const emp of employees) {
    if (!emp.userId) continue;
    if (emp.employmentStatus === "dismissed" || emp.employmentStatus === "closed") continue;
    const user = byUser.get(emp.userId);
    if (!user) continue;
    await applyBordoAttendanceForEmployee(emp, user.role);
  }
}

function assignmentPayload(rows: { scope: string; departmentId: number | null; role: string | null; userId: number | null }[]) {
  return {
    departments: rows.filter((r) => r.scope === "department" && r.departmentId != null).map((r) => r.departmentId as number),
    roles: rows.filter((r) => r.scope === "role" && r.role).map((r) => r.role as string),
    userIds: rows.filter((r) => r.scope === "user" && r.userId != null).map((r) => r.userId as number),
  };
}

export async function bordoAttendanceBundle() {
  await ensureMainBordoPlace();
  const [places, placeAsg, shifts, shiftAsg, departments, people] = await Promise.all([
    db.select().from(bordoPlacesTable).orderBy(asc(bordoPlacesTable.isMain), asc(bordoPlacesTable.name)),
    db.select().from(bordoPlaceAssignmentsTable).orderBy(asc(bordoPlaceAssignmentsTable.id)),
    db.select().from(bordoShiftsTable).orderBy(asc(bordoShiftsTable.startHm), asc(bordoShiftsTable.id)),
    db.select().from(bordoShiftAssignmentsTable).orderBy(asc(bordoShiftAssignmentsTable.id)),
    db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable).orderBy(asc(departmentsTable.name)),
    db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
        status: usersTable.status,
      })
      .from(usersTable)
      .where(eq(usersTable.status, "active"))
      .orderBy(asc(usersTable.fullName)),
  ]);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const activePlaces = places.filter((p) => p.active);
  const qrByPlace = new Map<number, { version: number; payload: string | null }>();
  for (const place of activePlaces) {
    const qr = await ensurePlaceQr(place.id, place.name).catch(() => null);
    if (qr) qrByPlace.set(place.id, { version: qr.version, payload: qr.tokenPayload || null });
  }
  const activeShifts = shifts.filter((s) => s.active && activePlaces.some((p) => p.id === s.placeId));

  const resolved = people.map((person) => {
    const placeMatch = pickBest(placeAsg, (row) =>
      activePlaces.some((p) => p.id === row.placeId)
        ? rankAssignment(row, { userId: person.id, role: person.role, departmentId: person.departmentId })
        : 0,
    );
    const place = placeMatch
      ? activePlaces.find((p) => p.id === placeMatch.placeId)
      : activePlaces.find((p) => p.isMain) || activePlaces[0];
    const shiftMatch = pickBest(shiftAsg, (row) =>
      activeShifts.some((s) => s.id === row.shiftId)
        ? rankAssignment(row, { userId: person.id, role: person.role, departmentId: person.departmentId })
        : 0,
    );
    const shift = shiftMatch ? activeShifts.find((s) => s.id === shiftMatch.shiftId) : undefined;
    return {
      userId: person.id,
      fullName: person.fullName,
      role: person.role,
      roleLabel: ROLE_LABEL.get(person.role) || person.role,
      departmentId: person.departmentId,
      departmentName: person.departmentId ? deptName.get(person.departmentId) || "" : "",
      placeId: place?.id ?? null,
      placeName: place?.name || "Asosiy ofis",
      shiftId: shift?.id ?? null,
      shiftName: shift?.name || "",
      shiftTime: shift ? `${shift.startHm}–${shift.endHm}${shift.overnight ? " (tungi)" : ""}` : "",
    };
  });

  return {
    roles: BORDO_PLACE_ROLES,
    departments,
    people: people.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      role: p.role,
      roleLabel: ROLE_LABEL.get(p.role) || p.role,
      departmentId: p.departmentId,
      departmentName: p.departmentId ? deptName.get(p.departmentId) || "" : "",
    })),
    places: places.map((p) => ({
      ...p,
      assignments: assignmentPayload(placeAsg.filter((a) => a.placeId === p.id)),
      qr: qrByPlace.get(p.id) ?? null,
    })),
    shifts: shifts.map((s) => ({
      ...s,
      assignments: assignmentPayload(shiftAsg.filter((a) => a.shiftId === s.id)),
    })),
    resolved,
  };
}

async function replaceAssignments(
  table: "place" | "shift",
  ownerId: number,
  body: { departments?: number[]; roles?: string[]; userIds?: number[] },
) {
  const departments = [...new Set((body.departments || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  const roles = [...new Set((body.roles || []).map((r) => String(r).trim()).filter(Boolean))];
  const userIds = [...new Set((body.userIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  const rows = [
    ...departments.map((departmentId) => ({ scope: "department" as Scope, departmentId, role: null, userId: null })),
    ...roles.map((role) => ({ scope: "role" as Scope, departmentId: null, role, userId: null })),
    ...userIds.map((userId) => ({ scope: "user" as Scope, departmentId: null, role: null, userId })),
  ];
  if (table === "place") {
    await db.delete(bordoPlaceAssignmentsTable).where(eq(bordoPlaceAssignmentsTable.placeId, ownerId));
    if (rows.length) {
      await db.insert(bordoPlaceAssignmentsTable).values(rows.map((r) => ({ ...r, placeId: ownerId })));
    }
  } else {
    await db.delete(bordoShiftAssignmentsTable).where(eq(bordoShiftAssignmentsTable.shiftId, ownerId));
    if (rows.length) {
      await db.insert(bordoShiftAssignmentsTable).values(rows.map((r) => ({ ...r, shiftId: ownerId })));
    }
  }
  await syncAllBordoShifts();
}

export async function createBordoPlace(input: {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number;
  createdById?: number | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Joy nomini yozing");
  const [created] = await db
    .insert(bordoPlacesTable)
    .values({
      name,
      latitude: finiteOrNull(input.latitude),
      longitude: finiteOrNull(input.longitude),
      radiusMeters: clampRadius(input.radiusMeters),
      isMain: false,
      active: true,
    })
    .returning();
  if (created) await ensurePlaceQr(created.id, created.name, input.createdById);
  return created;
}

export async function updateBordoPlace(
  id: number,
  patch: { name?: string; latitude?: number | null; longitude?: number | null; radiusMeters?: number; active?: boolean },
) {
  const [existing] = await db.select().from(bordoPlacesTable).where(eq(bordoPlacesTable.id, id)).limit(1);
  if (!existing) return null;
  const updates: Partial<typeof bordoPlacesTable.$inferInsert> = {};
  if (typeof patch.name === "string" && patch.name.trim()) updates.name = patch.name.trim();
  if (patch.latitude !== undefined) updates.latitude = finiteOrNull(patch.latitude);
  if (patch.longitude !== undefined) updates.longitude = finiteOrNull(patch.longitude);
  if (patch.radiusMeters !== undefined) updates.radiusMeters = clampRadius(patch.radiusMeters);
  if (typeof patch.active === "boolean" && !existing.isMain) updates.active = patch.active;
  if (!Object.keys(updates).length) return existing;
  const [updated] = await db.update(bordoPlacesTable).set(updates).where(eq(bordoPlacesTable.id, id)).returning();
  if (updated) await ensurePlaceQr(updated.id, updated.name).catch(() => undefined);
  return updated;
}

export async function deleteBordoPlace(id: number) {
  const [existing] = await db.select().from(bordoPlacesTable).where(eq(bordoPlacesTable.id, id)).limit(1);
  if (!existing) return false;
  if (existing.isMain) throw new Error("Asosiy ofisni o‘chirib bo‘lmaydi");
  const shifts = await db.select({ id: bordoShiftsTable.id }).from(bordoShiftsTable).where(eq(bordoShiftsTable.placeId, id));
  if (shifts.length) {
    await db.delete(bordoShiftAssignmentsTable).where(inArray(bordoShiftAssignmentsTable.shiftId, shifts.map((s) => s.id)));
    await db.delete(bordoShiftsTable).where(eq(bordoShiftsTable.placeId, id));
  }
  await db.delete(bordoPlaceAssignmentsTable).where(eq(bordoPlaceAssignmentsTable.placeId, id));
  await revokeActiveQrForPlace(id).catch(() => undefined);
  await db.delete(bordoPlacesTable).where(eq(bordoPlacesTable.id, id));
  await syncAllBordoShifts();
  return true;
}

export async function savePlaceAssignments(
  placeId: number,
  body: { departments?: number[]; roles?: string[]; userIds?: number[] },
) {
  const [place] = await db.select({ id: bordoPlacesTable.id }).from(bordoPlacesTable).where(eq(bordoPlacesTable.id, placeId)).limit(1);
  if (!place) return false;
  await replaceAssignments("place", placeId, body);
  return true;
}

export async function createBordoShift(input: {
  placeId: number;
  name: string;
  startHm: string;
  endHm: string;
  overnight?: boolean;
}) {
  const [place] = await db.select().from(bordoPlacesTable).where(eq(bordoPlacesTable.id, input.placeId)).limit(1);
  if (!place) throw new Error("Joy topilmadi");
  const name = input.name.trim();
  const startHm = normalizeHm(input.startHm);
  const endHm = normalizeHm(input.endHm);
  if (!name) throw new Error("Smena nomini yozing");
  if (!startHm || !endHm) throw new Error("Vaqt HH:MM formatida bo‘lsin");
  const overnight = input.overnight === true || (input.overnight !== false && hmToMinutes(endHm) <= hmToMinutes(startHm));
  const [created] = await db
    .insert(bordoShiftsTable)
    .values({ placeId: place.id, name, startHm, endHm, overnight, active: true })
    .returning();
  return created;
}

export async function updateBordoShift(
  id: number,
  patch: { name?: string; startHm?: string; endHm?: string; overnight?: boolean; active?: boolean },
) {
  const [existing] = await db.select().from(bordoShiftsTable).where(eq(bordoShiftsTable.id, id)).limit(1);
  if (!existing) return null;
  const updates: Partial<typeof bordoShiftsTable.$inferInsert> = {};
  if (typeof patch.name === "string" && patch.name.trim()) updates.name = patch.name.trim();
  if (patch.startHm != null) {
    const hm = normalizeHm(patch.startHm);
    if (!hm) throw new Error("Boshlanish vaqti noto‘g‘ri");
    updates.startHm = hm;
  }
  if (patch.endHm != null) {
    const hm = normalizeHm(patch.endHm);
    if (!hm) throw new Error("Tugash vaqti noto‘g‘ri");
    updates.endHm = hm;
  }
  if (typeof patch.overnight === "boolean") updates.overnight = patch.overnight;
  if (typeof patch.active === "boolean") updates.active = patch.active;
  const startHm = updates.startHm ?? existing.startHm;
  const endHm = updates.endHm ?? existing.endHm;
  if (updates.overnight === undefined && (updates.startHm || updates.endHm)) {
    updates.overnight = hmToMinutes(endHm) <= hmToMinutes(startHm);
  }
  if (!Object.keys(updates).length) return existing;
  const [updated] = await db.update(bordoShiftsTable).set(updates).where(eq(bordoShiftsTable.id, id)).returning();
  await syncAllBordoShifts();
  return updated;
}

export async function deleteBordoShift(id: number) {
  await db.delete(bordoShiftAssignmentsTable).where(eq(bordoShiftAssignmentsTable.shiftId, id));
  const deleted = await db.delete(bordoShiftsTable).where(eq(bordoShiftsTable.id, id)).returning({ id: bordoShiftsTable.id });
  await syncAllBordoShifts();
  return deleted.length > 0;
}

export async function saveShiftAssignments(
  shiftId: number,
  body: { departments?: number[]; roles?: string[]; userIds?: number[] },
) {
  const [shift] = await db.select({ id: bordoShiftsTable.id }).from(bordoShiftsTable).where(eq(bordoShiftsTable.id, shiftId)).limit(1);
  if (!shift) return false;
  await replaceAssignments("shift", shiftId, body);
  return true;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampRadius(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(20, Math.min(2000, Math.round(n)));
}
