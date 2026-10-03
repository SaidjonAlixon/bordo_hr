import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useToast } from "../../hooks/use-toast";
import {
  createBordoPlace,
  createBordoShift,
  deleteBordoPlace,
  deleteBordoShift,
  fetchBordoDavomat,
  savePlaceAssignments,
  saveShiftAssignments,
  updateBordoPlace,
  type BordoAssign,
  type BordoPlace,
  type BordoShift,
} from "../../lib/bordo-davomat-api";
import { gpsInputError, parseGpsText } from "../../lib/pharmacy-staff-api";

const emptyAssign = (): BordoAssign => ({ departments: [], roles: [], userIds: [] });

function toggleNum(list: number[], id: number) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function toggleStr(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function formatGpsText(lat: number, lng: number): string {
  const one = (value: number, pos: string, neg: string) => {
    const hemi = value < 0 ? neg : pos;
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    let min = Math.floor(minFloat);
    let sec = Math.round((minFloat - min) * 60 * 10) / 10;
    if (sec >= 60) {
      sec = 0;
      min += 1;
    }
    if (min >= 60) {
      min = 0;
      deg += 1;
    }
    return `${deg}°${String(min).padStart(2, "0")}'${sec.toFixed(1).padStart(4, "0")}"${hemi}`;
  };
  return `${one(lat, "N", "S")} ${one(lng, "E", "W")}`;
}

function coordText(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return formatGpsText(lat, lng);
}

function readCoord(raw: string): { latitude: number; longitude: number } {
  const gps = parseGpsText(raw);
  if (!gps) throw new Error(gpsInputError(raw) || "Koordinata noto‘g‘ri");
  return { latitude: gps.lat, longitude: gps.lng };
}

export default function DavomatJoylarPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bordo-davomat"], queryFn: fetchBordoDavomat });
  const [placeId, setPlaceId] = useState<number | "new" | null>(null);
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [placeForm, setPlaceForm] = useState({ name: "", coord: "", radiusMeters: "100" });
  const [shiftForm, setShiftForm] = useState({ name: "", startHm: "09:00", endHm: "18:00" });
  const [placeAssign, setPlaceAssign] = useState<BordoAssign | null>(null);
  const [shiftAssign, setShiftAssign] = useState<BordoAssign | null>(null);
  const [personQ, setPersonQ] = useState("");
  const nameTouched = useRef(true);
  const nameLookup = useRef(0);

  const data = q.data;
  const selected =
    placeId === "new"
      ? null
      : data?.places.find((p) => p.id === (placeId ?? data.places.find((x) => x.isMain)?.id)) || null;

  useEffect(() => {
    if (!data || placeId === "new" || placeId != null) return;
    const main = data.places.find((p) => p.isMain) || data.places[0];
    if (!main) return;
    setPlaceId(main.id);
    nameTouched.current = true;
    setPlaceForm({
      name: main.name,
      coord: coordText(main.latitude, main.longitude),
      radiusMeters: String(main.radiusMeters || 100),
    });
    setPlaceAssign(main.assignments);
  }, [data, placeId]);
  const shifts = (data?.shifts || []).filter((s) => selected && s.placeId === selected.id && s.active);
  const selectedShift = shifts.find((s) => s.id === shiftId) || shifts[0] || null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["bordo-davomat"] });
  const fail = (e: Error) => toast({ title: "Saqlanmadi", description: e.message, variant: "destructive" });

  const suggestPlaceName = (lat: number, lng: number) => {
    if (nameTouched.current) return;
    const ticket = ++nameLookup.current;
    void fetch(`/api/bordo-davomat/joy-nomi?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { name?: string } | null) => {
        const name = String(body?.name || "").trim();
        if (!name || ticket !== nameLookup.current || nameTouched.current) return;
        if (/^-?\d+(?:[.,]\d+)?\s*,/.test(name)) return;
        setPlaceForm((f) => ({ ...f, name }));
      })
      .catch(() => undefined);
  };

  const applyCoord = (raw: string) => {
    setPlaceForm((f) => ({ ...f, coord: raw }));
    const gps = parseGpsText(raw);
    if (gps) suggestPlaceName(gps.lat, gps.lng);
  };

  const savePlace = useMutation({
    mutationFn: () => {
      const gps = readCoord(placeForm.coord);
      const body = {
        name: placeForm.name.trim(),
        latitude: gps.latitude,
        longitude: gps.longitude,
        radiusMeters: Number(placeForm.radiusMeters) || 100,
      };
      if (!body.name) throw new Error("Joy nomini yozing");
      return createBordoPlace(body);
    },
    onSuccess: () => {
      nameTouched.current = false;
      setPlaceForm({ name: "", coord: "", radiusMeters: "100" });
      toast({ title: "Joy saqlandi" });
      refresh();
    },
    onError: fail,
  });

  const updateSelectedPlace = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Joy tanlanmagan");
      const gps = readCoord(placeForm.coord);
      return updateBordoPlace(selected.id, {
        name: placeForm.name.trim() || selected.name,
        latitude: gps.latitude,
        longitude: gps.longitude,
        radiusMeters: Number(placeForm.radiusMeters) || selected.radiusMeters,
      });
    },
    onSuccess: () => {
      toast({ title: "Lokatsiya yangilandi" });
      refresh();
    },
    onError: fail,
  });

  const removePlace = useMutation({
    mutationFn: (id: number) => deleteBordoPlace(id),
    onSuccess: () => {
      setPlaceId(null);
      toast({ title: "Joy o‘chirildi" });
      refresh();
    },
    onError: fail,
  });

  const savePlaceAsg = useMutation({
    mutationFn: () => {
      if (!selected || !placeAssign) throw new Error("Joy tanlanmagan");
      return savePlaceAssignments(selected.id, placeAssign);
    },
    onSuccess: () => {
      toast({ title: "Joy biriktirildi" });
      refresh();
    },
    onError: fail,
  });

  const addShift = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Avval joyni tanlang");
      return createBordoShift({
        placeId: selected.id,
        name: shiftForm.name.trim(),
        startHm: shiftForm.startHm,
        endHm: shiftForm.endHm,
      });
    },
    onSuccess: () => {
      setShiftForm({ name: "", startHm: "09:00", endHm: "18:00" });
      toast({ title: "Smena qo‘shildi" });
      refresh();
    },
    onError: fail,
  });

  const removeShift = useMutation({
    mutationFn: (id: number) => deleteBordoShift(id),
    onSuccess: () => {
      setShiftId(null);
      setShiftAssign(null);
      toast({ title: "Smena o‘chirildi" });
      refresh();
    },
    onError: fail,
  });

  const saveShiftAsg = useMutation({
    mutationFn: () => {
      if (!selectedShift || !shiftAssign) throw new Error("Smena tanlanmagan");
      return saveShiftAssignments(selectedShift.id, shiftAssign);
    },
    onSuccess: () => {
      toast({ title: "Smena biriktirildi" });
      refresh();
    },
    onError: fail,
  });

  const people = useMemo(() => {
    const qv = personQ.trim().toLowerCase();
    return (data?.people || []).filter((p) => {
      if (!qv) return true;
      return `${p.fullName} ${p.roleLabel} ${p.departmentName}`.toLowerCase().includes(qv);
    });
  }, [data?.people, personQ]);

  const openPlace = (place: BordoPlace) => {
    setPlaceId(place.id);
    setShiftId(null);
    nameTouched.current = true;
    setPlaceForm({
      name: place.name,
      coord: coordText(place.latitude, place.longitude),
      radiusMeters: String(place.radiusMeters || 100),
    });
    setPlaceAssign(place.assignments);
    setShiftAssign(null);
  };

  const openShift = (shift: BordoShift) => {
    setShiftId(shift.id);
    setShiftAssign(shift.assignments);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Brauzer lokatsiyani bermaydi", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPlaceForm((f) => ({ ...f, coord: formatGpsText(lat, lng) }));
        suggestPlaceName(lat, lng);
      },
      () => toast({ title: "Lokatsiya olinmadi", variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  if (q.isLoading) return <div className="p-6 text-sm text-[#6e1632]">Yuklanmoqda…</div>;
  if (q.isError) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-700">{(q.error as Error).message}</p>
        <Button className="mt-3 bg-[#6e1632] text-white" onClick={() => void q.refetch()}>Qayta urinish</Button>
      </div>
    );
  }

  const assign = placeAssign || selected?.assignments || emptyAssign();
  const sAssign = shiftAssign || selectedShift?.assignments || emptyAssign();

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 pb-24">
      <div className="rounded-2xl bg-gradient-to-br from-[#8b1e3f] via-[#6e1632] to-[#4a1224] px-5 py-5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Davomat · joy · smena</p>
        <h1 className="mt-1 text-2xl font-semibold">Davomat joylari</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/80">
          Asosiy ofis standart joy. Boshqa lokatsiya qo‘shing, bo‘lim, lavozim yoki aniq xodimga bering.
          Smena shu joy ichida ochiladi va kim qaysi soatda kelishi shunga qarab hisoblanadi.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#6e1632]">Joylar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.places.filter((p) => p.active).map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => openPlace(place)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                  selected?.id === place.id ? "border-[#6e1632] bg-[#6e1632] text-white" : "border-[#e7c5d0] bg-white hover:bg-[#f8e8ed]"
                }`}
              >
                <span>
                  <span className="block font-medium">{place.name}</span>
                  <span className={`text-[11px] ${selected?.id === place.id ? "text-white/75" : "text-muted-foreground"}`}>
                    {place.isMain ? "Standart joy" : `${place.radiusMeters} m`}
                  </span>
                </span>
                <MapPin className="h-4 w-4 shrink-0" />
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#e7c5d0] text-[#6e1632]"
              onClick={() => {
                setPlaceId("new");
                nameTouched.current = false;
                setPlaceForm({ name: "", coord: "", radiusMeters: "100" });
                setPlaceAssign(emptyAssign());
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Yangi joy
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-[#6e1632]">
                {selected && placeForm.name === selected.name ? selected.name : "Yangi joy"} — lokatsiya
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Nomi</Label>
                <Input
                  value={placeForm.name}
                  onChange={(e) => {
                    nameTouched.current = true;
                    setPlaceForm((f) => ({ ...f, name: e.target.value }));
                  }}
                  placeholder="Masalan, Showroom"
                />
              </div>
              <div className="space-y-1">
                <Label>Koordinata</Label>
                <Input
                  value={placeForm.coord}
                  onChange={(e) => applyCoord(e.target.value)}
                  placeholder={`41°18'23.3"N 69°18'28.0"E`}
                />
                <p className="text-[11px] text-muted-foreground">
                  Google Maps dan nusxa — tizim lokatsiya nomini o‘zi topadi.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-full space-y-1 sm:w-36">
                  <Label>Radius, metr</Label>
                  <Input value={placeForm.radiusMeters} onChange={(e) => setPlaceForm((f) => ({ ...f, radiusMeters: e.target.value }))} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-9" onClick={useMyLocation}>Shu yerning lokatsiyasi</Button>
                  {selected ? (
                    <Button type="button" className="h-9 bg-[#6e1632] text-white hover:bg-[#8b1e3f]" disabled={updateSelectedPlace.isPending} onClick={() => updateSelectedPlace.mutate()}>
                      Lokatsiyani saqlash
                    </Button>
                  ) : (
                    <Button type="button" className="h-9 bg-[#6e1632] text-white hover:bg-[#8b1e3f]" disabled={savePlace.isPending} onClick={() => savePlace.mutate()}>
                      Joy qo‘shish
                    </Button>
                  )}
                  {selected && !selected.isMain ? (
                    <Button type="button" variant="outline" className="h-9 text-rose-700" onClick={() => removePlace.mutate(selected.id)}>
                      <Trash2 className="mr-1 h-4 w-4" /> O‘chirish
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {selected ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-[#6e1632]">Kimlar shu joyda davomat qiladi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Avval aniq xodim, keyin lavozim, keyin bo‘lim. Hech narsa belgilanmasa, xodim Asosiy ofisga tushadi.
                </p>
                <AssignGrid
                  title="Bo‘limlar"
                  items={(data?.departments || []).map((d) => ({ id: String(d.id), label: d.name }))}
                  selected={assign.departments.map(String)}
                  onToggle={(id) => setPlaceAssign({ ...assign, departments: toggleNum(assign.departments, Number(id)) })}
                />
                <AssignGrid
                  title="Lavozimlar"
                  items={(data?.roles || []).map((r) => ({ id: r.value, label: r.label }))}
                  selected={assign.roles}
                  onToggle={(id) => setPlaceAssign({ ...assign, roles: toggleStr(assign.roles, id) })}
                />
                <div>
                  <Label>Xodimlar</Label>
                  <Input className="mt-1" value={personQ} onChange={(e) => setPersonQ(e.target.value)} placeholder="Ism yoki lavozim" />
                  <div className="mt-2 max-h-48 space-y-1 overflow-auto rounded-xl border border-[#e7c5d0] p-2">
                    {people.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[#f8e8ed]">
                        <input
                          type="checkbox"
                          checked={assign.userIds.includes(p.id)}
                          onChange={() => setPlaceAssign({ ...assign, userIds: toggleNum(assign.userIds, p.id) })}
                        />
                        <span>{p.fullName}</span>
                        <span className="text-xs text-muted-foreground">{p.roleLabel}{p.departmentName ? ` · ${p.departmentName}` : ""}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button type="button" className="bg-[#6e1632] text-white hover:bg-[#8b1e3f]" disabled={savePlaceAsg.isPending} onClick={() => savePlaceAsg.mutate()}>
                  Biriktirishni saqlash
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {selected ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-[#6e1632]">{selected.name} smenalari</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {shifts.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openShift(s)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        selectedShift?.id === s.id ? "border-[#6e1632] bg-[#6e1632] text-white" : "border-[#e7c5d0] bg-[#f8e8ed] text-[#6e1632]"
                      }`}
                    >
                      {s.name} · {s.startHm}–{s.endHm}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
                  <div className="min-w-0 space-y-1">
                    <Label>Smena nomi</Label>
                    <Input value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} placeholder="Kunduzgi" />
                  </div>
                  <SoatMaydoni
                    label="Boshlanish"
                    value={shiftForm.startHm}
                    onChange={(startHm) => setShiftForm((f) => ({ ...f, startHm }))}
                  />
                  <SoatMaydoni
                    label="Tugash"
                    value={shiftForm.endHm}
                    onChange={(endHm) => setShiftForm((f) => ({ ...f, endHm }))}
                  />
                  <Button type="button" className="bg-[#6e1632] text-white hover:bg-[#8b1e3f]" disabled={addShift.isPending} onClick={() => addShift.mutate()}>
                    Smena qo‘shish
                  </Button>
                </div>
                {selectedShift ? (
                  <div className="space-y-3 rounded-xl border border-[#e7c5d0] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#6e1632]">{selectedShift.name} kimlar uchun</p>
                      <Button type="button" variant="outline" className="text-rose-700" onClick={() => removeShift.mutate(selectedShift.id)}>
                        O‘chirish
                      </Button>
                    </div>
                    <AssignGrid
                      title="Bo‘limlar"
                      items={(data?.departments || []).map((d) => ({ id: String(d.id), label: d.name }))}
                      selected={sAssign.departments.map(String)}
                      onToggle={(id) => setShiftAssign({ ...sAssign, departments: toggleNum(sAssign.departments, Number(id)) })}
                    />
                    <AssignGrid
                      title="Lavozimlar"
                      items={(data?.roles || []).map((r) => ({ id: r.value, label: r.label }))}
                      selected={sAssign.roles}
                      onToggle={(id) => setShiftAssign({ ...sAssign, roles: toggleStr(sAssign.roles, id) })}
                    />
                    <Button type="button" className="bg-[#6e1632] text-white hover:bg-[#8b1e3f]" disabled={saveShiftAsg.isPending} onClick={() => saveShiftAsg.mutate()}>
                      Smenani saqlash
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Hali smena yo‘q. Nom va vaqt yozib qo‘shing.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#6e1632]">Hozir kim qayerda</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-[#6e1632]">
              <tr>
                <th className="py-2">Xodim</th>
                <th>Lavozim</th>
                <th>Bo‘lim</th>
                <th>Joy</th>
                <th>Smena</th>
              </tr>
            </thead>
            <tbody>
              {(data?.resolved || []).map((row) => (
                <tr key={row.userId} className="border-t border-[#f3d5de]">
                  <td className="py-2">{row.fullName}</td>
                  <td>{row.roleLabel}</td>
                  <td>{row.departmentName || "—"}</td>
                  <td>{row.placeName}</td>
                  <td>{row.shiftName ? `${row.shiftName} · ${row.shiftTime}` : "Standart ofis vaqti"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SoatMaydoni({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [hour, minute] = (value || "09:00").split(":");
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
  const set = (h: string, m: string) => onChange(`${h}:${m}`);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <select
          aria-label={`${label} soati`}
          value={hours.includes(hour || "") ? hour : "09"}
          onChange={(e) => set(e.target.value, minutes.includes(minute || "") ? minute! : "00")}
          className="h-9 rounded-md border border-[#e7c5d0] bg-white px-2 text-sm text-[#4a1224]"
        >
          {hours.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-[#6e1632]">:</span>
        <select
          aria-label={`${label} daqiqasi`}
          value={minutes.includes(minute || "") ? minute : "00"}
          onChange={(e) => set(hour || "09", e.target.value)}
          className="h-9 rounded-md border border-[#e7c5d0] bg-white px-2 text-sm text-[#4a1224]"
        >
          {minutes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AssignGrid({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6e1632]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const on = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                on ? "border-[#6e1632] bg-[#6e1632] text-white" : "border-[#e7c5d0] bg-white text-[#4a1224]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
