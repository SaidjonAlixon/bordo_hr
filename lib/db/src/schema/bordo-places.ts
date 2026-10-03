import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";

/** Davomat joyi — Asosiy ofis va qo‘shimcha lokatsiyalar. */
export const bordoPlacesTable = pgTable(
  "bordo_places",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    radiusMeters: integer("radius_meters").notNull().default(100),
    isMain: boolean("is_main").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("bordo_places_main_idx").on(t.isMain), index("bordo_places_active_idx").on(t.active)],
);

/** Joy → bo‘lim, lavozim yoki aniq xodim. */
export const bordoPlaceAssignmentsTable = pgTable(
  "bordo_place_assignments",
  {
    id: serial("id").primaryKey(),
    placeId: integer("place_id").notNull(),
    /** department | role | user */
    scope: text("scope").notNull(),
    departmentId: integer("department_id"),
    role: text("role"),
    userId: integer("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bordo_place_asg_place_idx").on(t.placeId),
    index("bordo_place_asg_user_idx").on(t.userId),
    index("bordo_place_asg_role_idx").on(t.role),
    index("bordo_place_asg_dept_idx").on(t.departmentId),
  ],
);

/** Joy ichidagi smena (Asosiy ofis va boshqa joylar). */
export const bordoShiftsTable = pgTable(
  "bordo_shifts",
  {
    id: serial("id").primaryKey(),
    placeId: integer("place_id").notNull(),
    name: text("name").notNull(),
    startHm: text("start_hm").notNull(),
    endHm: text("end_hm").notNull(),
    overnight: boolean("overnight").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("bordo_shifts_place_idx").on(t.placeId), index("bordo_shifts_active_idx").on(t.active)],
);

/** Smena → bo‘lim, lavozim yoki aniq xodim. */
export const bordoShiftAssignmentsTable = pgTable(
  "bordo_shift_assignments",
  {
    id: serial("id").primaryKey(),
    shiftId: integer("shift_id").notNull(),
    /** department | role | user */
    scope: text("scope").notNull(),
    departmentId: integer("department_id"),
    role: text("role"),
    userId: integer("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bordo_shift_asg_shift_idx").on(t.shiftId),
    index("bordo_shift_asg_user_idx").on(t.userId),
    index("bordo_shift_asg_role_idx").on(t.role),
    index("bordo_shift_asg_dept_idx").on(t.departmentId),
  ],
);
