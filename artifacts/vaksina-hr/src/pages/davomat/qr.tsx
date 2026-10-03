import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Loader2,
  MapPin,
  QrCode,
  RefreshCw,
  ScanLine,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { useAuth } from "../../contexts/AuthContext";
import { QrScanDialog, primeQrCamera } from "../../components/QrScanDialog";
import { fetchQrPlaces, issuePlaceQr, qrPunchDavomat, revokePlaceQr, type QrPlaceRow } from "../../lib/davomat-api";
import { downloadAllQrPdf, downloadQrPdf, downloadQrPng, renderQrToCanvas } from "../../lib/qr-render";
import { hasFullPlatformAccess, isDeptHeadRole, isDirectorRole } from "../../lib/roles";
import { cn } from "../../lib/utils";

function formatCoord(lat: number, lng: number): string {
  const latAbs = Math.abs(lat);
  const lngAbs = Math.abs(lng);
  const latD = Math.floor(latAbs);
  const latM = Math.floor((latAbs - latD) * 60);
  const latS = ((latAbs - latD) * 60 - latM) * 60;
  const lngD = Math.floor(lngAbs);
  const lngM = Math.floor((lngAbs - lngD) * 60);
  const lngS = ((lngAbs - lngD) * 60 - lngM) * 60;
  const s = (n: number) => n.toFixed(1).padStart(4, "0");
  return `${latD}°${String(latM).padStart(2, "0")}'${s(latS)}"${lat >= 0 ? "N" : "S"} ${lngD}°${String(lngM).padStart(2, "0")}'${s(lngS)}"${lng >= 0 ? "E" : "W"}`;
}

function QrCanvasItem({ payload, size = 280 }: { payload: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    void (async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))));
      if (cancelled || !ref.current) return;
      try {
        await renderQrToCanvas(ref.current, payload, size);
      } catch {
        /* paint */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="h-[min(280px,72vw)] w-[min(280px,72vw)] max-w-full"
    />
  );
}

export default function DavomatQrPage({ adminMode = false }: { adminMode?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [qrStream, setQrStream] = useState<MediaStream | null>(null);
  const [scanAction, setScanAction] = useState<"in" | "out">("in");
  const [bulkPdfBusy, setBulkPdfBusy] = useState(false);

  const canEdit = adminMode || hasFullPlatformAccess(user?.role);
  const canView = canEdit || isDirectorRole(user?.role) || isDeptHeadRole(user?.role);

  useEffect(() => {
    if (scanOpen) return;
    setQrStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, [scanOpen]);

  useEffect(() => {
    void primeQrCamera();
  }, []);

  const placesQ = useQuery({
    queryKey: ["davomat-qr-places"],
    queryFn: fetchQrPlaces,
    enabled: Boolean(user) && canView,
  });

  const places = placesQ.data?.places ?? [];
  const selected = useMemo(
    () => places.find((p) => p.id === selectedId) ?? null,
    [places, selectedId],
  );

  useEffect(() => {
    if (selectedId != null || !places.length) return;
    const main = places.find((p) => p.isMain);
    const withQr = places.find((p) => p.hasActiveQr && p.payload);
    setSelectedId((main || withQr || places[0])!.id);
  }, [places, selectedId]);

  const active = places.filter((p) => p.payload);

  const issue = useMutation({
    mutationFn: (id: number) => issuePlaceQr(id),
    onSuccess: async (r) => {
      setSelectedId(r.placeId);
      await qc.invalidateQueries({ queryKey: ["davomat-qr-places"] });
      toast({
        title: "QR saqlandi",
        description: `«${r.placeLabel}» uchun QR yaratildi. Skaner faqat shu joy hududida ishlaydi.`,
      });
    },
    onError: (e: Error) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => revokePlaceQr(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["davomat-qr-places"] });
      toast({ title: "QR o‘chirildi" });
    },
    onError: (e: Error) => toast({ title: "O‘chirilmadi", description: e.message, variant: "destructive" }),
  });

  async function onDownloadPng(place: QrPlaceRow) {
    if (!place.payload) return;
    try {
      await downloadQrPng(place.payload, `davomat-qr-${place.id}.png`);
    } catch (e) {
      toast({ title: "PNG yuklanmadi", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function onDownloadPdf(place: QrPlaceRow) {
    if (!place.payload) return;
    try {
      await downloadQrPdf(place.payload, place.name, `davomat-qr-${place.id}.pdf`);
      toast({ title: "PDF yuklandi" });
    } catch (e) {
      toast({ title: "PDF yuklanmadi", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function onDownloadAllPdf() {
    const source = places.filter((p) => p.payload);
    if (!source.length) {
      toast({ title: "PDF", description: "Faol QR yo‘q — avval joy tanlab QR yarating", variant: "destructive" });
      return;
    }
    setBulkPdfBusy(true);
    try {
      await downloadAllQrPdf(
        source.map((p, i) => ({ n: i + 1, title: p.name, payload: p.payload! })),
        "BORDO · Davomat QR",
      );
      toast({ title: "PDF yuklandi", description: `${source.length} ta joy QR` });
    } catch (e) {
      toast({ title: "PDF yuklanmadi", description: e instanceof Error ? e.message : "Qayta urinib ko‘ring", variant: "destructive" });
    } finally {
      setBulkPdfBusy(false);
    }
  }

  async function onAdminScan(detected: string) {
    const result = await qrPunchDavomat({ payload: detected, action: scanAction });
    const place = result.branchLabel || result.departmentLabel || null;
    toast({
      title: result.action === "in" ? "Keldim (QR)" : "Ketdim (QR)",
      description: place ? `${result.message || "Qabul qilindi"} · ${place}` : result.message || "Qabul qilindi",
    });
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-muted-foreground">
        Davomat QR ni ko‘rishga ruxsat yo‘q.
      </div>
    );
  }

  if (placesQ.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-rose-700">
        {(placesQ.error as Error)?.message || "Joylar yuklanmadi"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 pb-28 sm:px-6">
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <QrCode className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Davomat QR</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            QR ochilgan joyga bog‘lanadi. Xodim shu joy hududida turib skaner qilsa, keldi yoki ketdi shu joyga yoziladi.
          </p>
        </div>
        <div className="flex gap-2 text-[11px] font-medium">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-700">Faol {active.length}</span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Joy {places.length}</span>
        </div>
      </header>

      {canEdit ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ScanLine className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Tekshiruv skaneri</h2>
                <p className="text-xs text-muted-foreground">Admin joy hududisiz ham sinab ko‘radi</p>
              </div>
            </div>
            <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto">
              <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setScanAction("in")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-semibold",
                    scanAction === "in" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  Keldim
                </button>
                <button
                  type="button"
                  onClick={() => setScanAction("out")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-semibold",
                    scanAction === "out" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  Ketdim
                </button>
              </div>
              <Button type="button" className="h-10 gap-2 rounded-xl" onClick={() => setScanOpen(true)}>
                <ScanLine className="h-4 w-4" />
                Skaner qilish
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Joyni oching</h2>
          <Link href="/admin/davomat-joylar" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
            Joylar
          </Link>
        </div>
        {placesQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…
          </div>
        ) : places.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
            Hali davomat joyi yo‘q. Avval joy qo‘shing, keyin shu yerda QR yarating.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((place) => {
              const on = selectedId === place.id;
              return (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => setSelectedId(place.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                    on ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/40 hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      on ? "bg-white/15" : place.hasActiveQr ? "bg-emerald-500/15 text-emerald-700" : "bg-background text-muted-foreground",
                    )}
                  >
                    {place.hasActiveQr ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {place.name}
                      {place.isMain ? " · asosiy" : ""}
                    </span>
                    <span className={cn("block truncate text-[11px]", on ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {place.radiusMeters} m
                      {place.hasActiveQr ? ` · QR v${place.version}` : " · QR yo‘q"}
                      {!place.hasCoords ? " · koordinata yo‘q" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col items-center gap-6 p-5 sm:p-8 md:flex-row md:items-start md:justify-center">
            <div className="rounded-[1.4rem] border bg-white p-4 shadow-sm">
              {selected.payload ? (
                <QrCanvasItem payload={selected.payload} />
              ) : (
                <div className="flex h-[min(280px,72vw)] w-[min(280px,72vw)] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <QrCode className="h-8 w-8" />
                  Bu joyda hali QR yo‘q
                </div>
              )}
            </div>
            <div className="w-full max-w-sm space-y-3 text-center md:pt-2 md:text-left">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ochilgan joy</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selected.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Radius {selected.radiusMeters} m
                  {selected.version != null ? ` · versiya ${selected.version}` : ""}
                </p>
                {selected.latitude != null && selected.longitude != null ? (
                  <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                    {formatCoord(selected.latitude, selected.longitude)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">Koordinata yo‘q — skaner ishlamaydi. Avval joyni saqlang.</p>
                )}
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Chop etib joyga osing. Xodim o‘z joyining QR ini, shu radius ichida skaner qiladi.
              </p>
              <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                {canEdit ? (
                  <Button
                    type="button"
                    className="h-10 gap-2 rounded-xl"
                    disabled={issue.isPending}
                    onClick={() => issue.mutate(selected.id)}
                  >
                    {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {selected.hasActiveQr ? "Yangi QR" : "QR yaratish"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 rounded-xl"
                  disabled={!selected.payload}
                  onClick={() => void onDownloadPng(selected)}
                >
                  <FileImage className="h-4 w-4" />
                  PNG
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 rounded-xl"
                  disabled={!selected.payload}
                  onClick={() => void onDownloadPdf(selected)}
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </Button>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-10 gap-2 rounded-xl"
                    disabled={!selected.hasActiveQr || revoke.isPending}
                    onClick={() => {
                      if (!window.confirm(`«${selected.name}» QR ini bekor qilasizmi?`)) return;
                      revoke.mutate(selected.id);
                    }}
                  >
                    {revoke.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    O‘chirish
                  </Button>
                ) : null}
              </div>
              {selected.needsReissue ? (
                <p className="text-xs text-amber-700">Eski QR ochilmaydi — «Yangi QR» bosing.</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {active.length > 1 ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Barcha joy QR lari</h2>
            <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl" disabled={bulkPdfBusy} onClick={() => void onDownloadAllPdf()}>
              {bulkPdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {active.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => setSelectedId(place.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3 text-left",
                  selectedId === place.id ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <div className="rounded-xl border bg-white p-1.5">
                  <QrCanvasItem payload={place.payload!} size={96} />
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{place.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{place.radiusMeters} m · v{place.version}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <QrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        stream={qrStream}
        title={scanAction === "in" ? "Keldim" : "Ketdim"}
        onDetected={(text) => onAdminScan(text)}
      />
    </div>
  );
}
