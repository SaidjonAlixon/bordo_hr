/**
 * Davomat joyi QR — ochilgan joyga bog‘langan token.
 * Payload formati filial QR bilan bir xil: VMHR1.<qrId>.<rawToken>
 */
import { and, desc, eq } from "drizzle-orm";
import { db, placeAttendanceQrTable } from "@workspace/db";
import { encodeQrPayload, hashQrToken, mintQrSecrets, parseQrPayload } from "./branch-attendance-qr";

export { encodeQrPayload, mintQrSecrets, parseQrPayload, hashQrToken };

export type PlaceQrVerifyOk = {
  ok: true;
  row: typeof placeAttendanceQrTable.$inferSelect;
};

export type PlaceQrVerifyFail = {
  ok: false;
  code: string;
  error: string;
};

export async function verifyPlaceQrPayload(payload: string): Promise<PlaceQrVerifyOk | PlaceQrVerifyFail> {
  const parsed = parseQrPayload(payload);
  if (!parsed) {
    return { ok: false, code: "qr_invalid", error: "QR kod noto‘g‘ri formatda" };
  }
  const [row] = await db
    .select()
    .from(placeAttendanceQrTable)
    .where(eq(placeAttendanceQrTable.qrId, parsed.qrId))
    .limit(1);
  if (!row) {
    return { ok: false, code: "qr_unknown", error: "QR kod topilmadi" };
  }
  if (row.status !== "active") {
    return { ok: false, code: "qr_revoked", error: "Bu QR kod bekor qilingan" };
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { ok: false, code: "qr_expired", error: "QR kod muddati tugagan" };
  }
  if (row.tokenHash !== hashQrToken(parsed.rawToken)) {
    return { ok: false, code: "qr_token_mismatch", error: "QR token mos kelmadi" };
  }
  return { ok: true, row };
}

export async function getActiveQrForPlace(placeId: number) {
  const [row] = await db
    .select()
    .from(placeAttendanceQrTable)
    .where(and(eq(placeAttendanceQrTable.placeId, placeId), eq(placeAttendanceQrTable.status, "active")))
    .orderBy(desc(placeAttendanceQrTable.createdAt))
    .limit(1);
  return row ?? null;
}

export async function revokeActiveQrForPlace(placeId: number) {
  await db
    .update(placeAttendanceQrTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(placeAttendanceQrTable.placeId, placeId), eq(placeAttendanceQrTable.status, "active")));
}

/** Joy yaratilganda bitta faol QR. Bor bo‘lsa o‘sha qaytadi. */
export async function ensurePlaceQr(placeId: number, placeLabel: string, createdById?: number | null) {
  const existing = await getActiveQrForPlace(placeId);
  if (existing?.tokenPayload) {
    if (existing.placeLabel !== placeLabel) {
      await db
        .update(placeAttendanceQrTable)
        .set({ placeLabel })
        .where(eq(placeAttendanceQrTable.id, existing.id));
    }
    return { ...existing, placeLabel };
  }
  if (existing) await revokeActiveQrForPlace(placeId);
  const secrets = mintQrSecrets();
  const payload = encodeQrPayload(secrets.qrId, secrets.rawToken);
  const [row] = await db
    .insert(placeAttendanceQrTable)
    .values({
      qrId: secrets.qrId,
      placeId,
      placeLabel,
      tokenHash: secrets.tokenHash,
      tokenPayload: payload,
      version: (existing?.version ?? 0) + 1,
      status: "active",
      createdById: createdById ?? null,
      expiresAt: null,
    })
    .returning();
  return row!;
}
