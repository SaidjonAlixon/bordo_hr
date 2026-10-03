import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { canManageSettings, isHrRole } from "../lib/roles";
import {
  bordoAttendanceBundle,
  createBordoPlace,
  createBordoShift,
  deleteBordoPlace,
  deleteBordoShift,
  savePlaceAssignments,
  saveShiftAssignments,
  updateBordoPlace,
  updateBordoShift,
} from "../lib/bordo-places";
import { reverseGeocodeName } from "../lib/geo-location";

const router: IRouter = Router();

function canEdit(role?: string | null) {
  return canManageSettings(role) || isHrRole(role);
}

router.get("/bordo-davomat", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Davomat joylari faqat admin, direktor va HR uchun" });
    return;
  }
  try {
    res.json(await bordoAttendanceBundle());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Yuklanmadi" });
  }
});

router.get("/bordo-davomat/joy-nomi", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: "Koordinata noto‘g‘ri" });
    return;
  }
  try {
    const name = await reverseGeocodeName(lat, lng);
    res.json({ name });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || "Joy nomi topilmadi" });
  }
});

router.post("/bordo-davomat/places", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const created = await createBordoPlace({
      name: String(req.body?.name || ""),
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      radiusMeters: req.body?.radiusMeters,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.patch("/bordo-davomat/places/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const updated = await updateBordoPlace(Number(req.params.id), {
      name: req.body?.name,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      radiusMeters: req.body?.radiusMeters,
      active: req.body?.active,
    });
    if (!updated) {
      res.status(404).json({ error: "Joy topilmadi" });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete("/bordo-davomat/places/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const ok = await deleteBordoPlace(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Joy topilmadi" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.put("/bordo-davomat/places/:id/assignments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  const ok = await savePlaceAssignments(Number(req.params.id), req.body || {});
  if (!ok) {
    res.status(404).json({ error: "Joy topilmadi" });
    return;
  }
  res.json({ ok: true });
});

router.post("/bordo-davomat/shifts", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const created = await createBordoShift({
      placeId: Number(req.body?.placeId),
      name: String(req.body?.name || ""),
      startHm: String(req.body?.startHm || ""),
      endHm: String(req.body?.endHm || ""),
      overnight: req.body?.overnight,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.patch("/bordo-davomat/shifts/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const updated = await updateBordoShift(Number(req.params.id), req.body || {});
    if (!updated) {
      res.status(404).json({ error: "Smena topilmadi" });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete("/bordo-davomat/shifts/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  const ok = await deleteBordoShift(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "Smena topilmadi" });
    return;
  }
  res.status(204).end();
});

router.put("/bordo-davomat/shifts/:id/assignments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEdit(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  const ok = await saveShiftAssignments(Number(req.params.id), req.body || {});
  if (!ok) {
    res.status(404).json({ error: "Smena topilmadi" });
    return;
  }
  res.json({ ok: true });
});

export default router;
