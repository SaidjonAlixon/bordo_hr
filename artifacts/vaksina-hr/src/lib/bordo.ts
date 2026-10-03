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

/** Lavozimlar — foydalanuvchi yaratish. Shtat soni yo‘q, faqat lavozim nomi. */
export const BORDO_ROLES: { value: string; label: string; department: string }[] = [
  { value: "admin", label: "Admin", department: "Rahbariyat" },
  { value: "director", label: "Direktor", department: "Rahbariyat" },
  { value: "hr_direktor", label: "HRD", department: "Rahbariyat" },
  { value: "showroom", label: "Showroom jamoasi", department: "Showroom hodimlari" },
  { value: "kassir", label: "Bosh kassir", department: "Savdo bo‘limi" },
  { value: "sotuv_menejer", label: "Sotuv menejeri", department: "Savdo bo‘limi" },
  { value: "asistent_agent", label: "Asistent agent", department: "Savdo agentlari bo‘limi" },
  { value: "savdo_agenti", label: "Savdo agenti", department: "Savdo agentlari bo‘limi" },
  { value: "zakupchi", label: "Zakupchi", department: "Ombor bo‘limi" },
  { value: "priyomkachi", label: "Priyomkachi", department: "Ombor bo‘limi" },
  { value: "ombor_rahbar", label: "ZavSklad / Ombor mudiri", department: "Ombor bo‘limi" },
  { value: "yuk_xodim", label: "Yuk bo‘limi xodimlari", department: "Yuklash-tushirish va yig‘uv bo‘limi" },
  { value: "yiguvchi", label: "Yig‘uvchilar", department: "Yuklash-tushirish va yig‘uv bo‘limi" },
  { value: "shafyor", label: "Shafyor", department: "Yuklash-tushirish va yig‘uv bo‘limi" },
  { value: "oshpaz", label: "Oshpaz", department: "Xo‘jalik bo‘limi" },
  { value: "farrosh", label: "Tozalovchi", department: "Xo‘jalik bo‘limi" },
  { value: "xodim", label: "Xodim", department: "" },
];

export const BORDO_DEPARTMENTS = [
  "Rahbariyat",
  "Showroom hodimlari",
  "Savdo bo‘limi",
  "Savdo agentlari bo‘limi",
  "Ombor bo‘limi",
  "Yuklash-tushirish va yig‘uv bo‘limi",
  "Xo‘jalik bo‘limi",
] as const;

/** Lavozimning o‘z ishi: bosh sahifa matni, funksiyalar va qo‘shimcha sahifalar. */
export type BordoDuty = {
  title: string;
  hint: string;
  primaryHref: string;
  primaryLabel: string;
  duties: string[];
  paths: string[];
};

export const BORDO_DUTIES: Record<string, BordoDuty> = {
  showroom: {
    title: "Showroom",
    hint: "Mijozni kutib olish, mahsulotni ko‘rsatish va zal tartibi.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Mijoz qabuli", "Mahsulot ko‘rsatish", "Zal tartibi"],
    paths: [],
  },
  kassir: {
    title: "Kassa",
    hint: "To‘lovni qabul qilish, kunlik tushum va o‘z oyligi.",
    primaryHref: "/oylik",
    primaryLabel: "Oylik",
    duties: ["To‘lov qabul", "Kunlik tushum", "Kassa yopish"],
    paths: ["/oylik"],
  },
  sotuv_menejer: {
    title: "Sotuv",
    hint: "Mijoz, buyurtma va sotuv bo‘yicha topshiriqlar.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Mijoz bilan ishlash", "Buyurtma", "Sotuv nazorati"],
    paths: [],
  },
  asistent_agent: {
    title: "Asistent agent",
    hint: "Savdo agentiga hujjat, buyurtma va mijoz bo‘yicha yordam.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Hujjat yuritish", "Buyurtma yordami", "Agentga yordam"],
    paths: [],
  },
  savdo_agenti: {
    title: "Savdo agenti",
    hint: "Mijozlar, buyurtma va yetkazish kelishuvi.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Mijozlar", "Buyurtma olish", "Yetkazish kelishuvi"],
    paths: [],
  },
  zakupchi: {
    title: "Xarid",
    hint: "Yetkazib beruvchi, xarid va omborga kelgan yuk.",
    primaryHref: "/omborxona-ish",
    primaryLabel: "Ombor ishi",
    duties: ["Xarid", "Yetkazib beruvchi", "Buyurtma"],
    paths: ["/omborxona-ish"],
  },
  priyomkachi: {
    title: "Qabul",
    hint: "Kelgan yukni qabul qilish, tekshirish va kirim qilish.",
    primaryHref: "/omborxona-ish",
    primaryLabel: "Qabul",
    duties: ["Yuk qabuli", "Tekshiruv", "Kirim"],
    paths: ["/omborxona-ish"],
  },
  ombor_rahbar: {
    title: "Ombor",
    hint: "Smena, xodimlar holati va ombor nazorati.",
    primaryHref: "/omborxona-ish",
    primaryLabel: "Ombor holati",
    duties: ["Smena", "Xodimlar holati", "Kirim-chiqim nazorati"],
    paths: ["/omborxona-ish", "/employees", "/davomat"],
  },
  yuk_xodim: {
    title: "Yuklash",
    hint: "Yukni ortish, tushirish va ombor oldidagi tartib.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Yuklash", "Tushirish", "Joylashtirish"],
    paths: [],
  },
  yiguvchi: {
    title: "Yig‘ish",
    hint: "Buyurtmani yig‘ish va komplektlash.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Buyurtmani yig‘ish", "Komplekt", "Tekshiruv"],
    paths: [],
  },
  shafyor: {
    title: "Yetkazish",
    hint: "Buyurtmani manzilga yetkazish va qaytish.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Yetkazib berish", "Marshrut", "Qaytish"],
    paths: [],
  },
  oshpaz: {
    title: "Oshxona",
    hint: "Xodimlar uchun ovqat tayyorlash va oshxona tartibi.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Ovqat tayyorlash", "Menyu", "Oshxona tartibi"],
    paths: [],
  },
  farrosh: {
    title: "Tozalik",
    hint: "Xona, zal va umumiy joylarni toza saqlash.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Tozalash", "Tartib", "Chiqindi"],
    paths: [],
  },
  xodim: {
    title: "Bo‘lim ishi",
    hint: "Qo‘lda qo‘shilgan bo‘limdagi kundalik topshiriqlar.",
    primaryHref: "/vazifalar",
    primaryLabel: "Topshiriqlar",
    duties: ["Bo‘lim topshirig‘i", "Davomat", "Eslatma"],
    paths: [],
  },
};

export function bordoDuty(role?: string | null): BordoDuty | null {
  const key = (role ?? "").trim().toLowerCase();
  return BORDO_DUTIES[key] ?? null;
}

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
