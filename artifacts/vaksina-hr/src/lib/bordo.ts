/** BORDO savdo kompaniyasi — apteka tarmog‘i va koordinator bu yerda yo‘q. */

export const BORDO_NAME = "BORDO";

/** Menyuda va to‘g‘ridan-to‘g‘ri ochilganda kerak bo‘lmagan yo‘llar. */
const HIDDEN_PREFIXES = [
  "/pharmacy-network",
  "/checklist",
  "/ehtiyoj",
  "/boglanish",
  "/smena-filial",
  "/reviziya",
  "/distribyutsiya",
  "/logistika",
  "/it",
  "/texnik",
  "/reyting",
  "/davomat/dorixona-ochilishi",
  "/admin/smena-sozlamalar",
];

export function isHiddenBordoPath(path: string): boolean {
  return HIDDEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Lavozimlar — foydalanuvchi yaratish va yorliqlar. */
export const BORDO_ROLES: { value: string; label: string; department: string }[] = [
  { value: "admin", label: "Admin", department: "Rahbariyat" },
  { value: "director", label: "Direktor", department: "Rahbariyat" },
  { value: "hr_direktor", label: "HRD", department: "Rahbariyat" },
  { value: "hr_menejer", label: "HR menejer", department: "Rahbariyat" },
  { value: "recruiter", label: "Rekruter", department: "Rahbariyat" },
  { value: "showroom", label: "Showroom xodimi", department: "Showroom" },
  { value: "kassir", label: "Bosh kassir", department: "Savdo bo‘limi" },
  { value: "sotuv_menejer", label: "Sotuv menejeri", department: "Savdo bo‘limi" },
  { value: "asistent_agent", label: "Asistent agent", department: "Savdo agentlari" },
  { value: "savdo_agenti", label: "Savdo agenti", department: "Savdo agentlari" },
  { value: "zakupchi", label: "Zakupchi", department: "Ombor bo‘limi" },
  { value: "priyomkachi", label: "Priyomkachi", department: "Ombor bo‘limi" },
  { value: "ombor_rahbar", label: "ZavSklad / Ombor mudiri", department: "Ombor bo‘limi" },
  { value: "yuk_xodim", label: "Yuk bo‘limi xodimi", department: "Yuklash-tushirish va yig‘uv" },
  { value: "yiguvchi", label: "Yig‘uvchi", department: "Yuklash-tushirish va yig‘uv" },
  { value: "shafyor", label: "Shafyor", department: "Yuklash-tushirish va yig‘uv" },
  { value: "oshpaz", label: "Oshpaz", department: "Xo‘jalik bo‘limi" },
  { value: "farrosh", label: "Tozalovchi", department: "Xo‘jalik bo‘limi" },
];

export const BORDO_DEPARTMENTS = [
  "Rahbariyat",
  "Showroom",
  "Savdo bo‘limi",
  "Savdo agentlari",
  "Ombor bo‘limi",
  "Yuklash-tushirish va yig‘uv",
  "Xo‘jalik bo‘limi",
] as const;

export const BORDO_STAFF_ROLES = [
  "showroom",
  "kassir",
  "sotuv_menejer",
  "asistent_agent",
  "savdo_agenti",
  "zakupchi",
  "priyomkachi",
  "yuk_xodim",
  "yiguvchi",
  "shafyor",
  "oshpaz",
  "farrosh",
] as const;
