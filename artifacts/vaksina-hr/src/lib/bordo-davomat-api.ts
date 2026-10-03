export type BordoAssign = {
  departments: number[];
  roles: string[];
  userIds: number[];
};

export type BordoPlace = {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  isMain: boolean;
  active: boolean;
  assignments: BordoAssign;
};

export type BordoShift = {
  id: number;
  placeId: number;
  name: string;
  startHm: string;
  endHm: string;
  overnight: boolean;
  active: boolean;
  assignments: BordoAssign;
};

export type BordoPerson = {
  id: number;
  fullName: string;
  role: string;
  roleLabel: string;
  departmentId: number | null;
  departmentName: string;
};

export type BordoResolved = {
  userId: number;
  fullName: string;
  role: string;
  roleLabel: string;
  departmentId: number | null;
  departmentName: string;
  placeId: number | null;
  placeName: string;
  shiftId: number | null;
  shiftName: string;
  shiftTime: string;
};

export type BordoDavomatBundle = {
  roles: { value: string; label: string }[];
  departments: { id: number; name: string }[];
  people: BordoPerson[];
  places: BordoPlace[];
  shifts: BordoShift[];
  resolved: BordoResolved[];
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "So‘rov bajarilmadi");
  return data as T;
}

export function fetchBordoDavomat() {
  return apiJson<BordoDavomatBundle>("/bordo-davomat");
}

export function createBordoPlace(body: { name: string; latitude?: number | null; longitude?: number | null; radiusMeters?: number }) {
  return apiJson<BordoPlace>("/bordo-davomat/places", { method: "POST", body: JSON.stringify(body) });
}

export function updateBordoPlace(id: number, body: Partial<{ name: string; latitude: number | null; longitude: number | null; radiusMeters: number }>) {
  return apiJson<BordoPlace>(`/bordo-davomat/places/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteBordoPlace(id: number) {
  return apiJson<void>(`/bordo-davomat/places/${id}`, { method: "DELETE" });
}

export function savePlaceAssignments(id: number, body: BordoAssign) {
  return apiJson<{ ok: boolean }>(`/bordo-davomat/places/${id}/assignments`, { method: "PUT", body: JSON.stringify(body) });
}

export function createBordoShift(body: { placeId: number; name: string; startHm: string; endHm: string }) {
  return apiJson<BordoShift>("/bordo-davomat/shifts", { method: "POST", body: JSON.stringify(body) });
}

export function deleteBordoShift(id: number) {
  return apiJson<void>(`/bordo-davomat/shifts/${id}`, { method: "DELETE" });
}

export function saveShiftAssignments(id: number, body: BordoAssign) {
  return apiJson<{ ok: boolean }>(`/bordo-davomat/shifts/${id}/assignments`, { method: "PUT", body: JSON.stringify(body) });
}
