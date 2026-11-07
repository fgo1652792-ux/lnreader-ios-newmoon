// lnreader-ios/src/reader/newmoon/worFonts.js
// PORT of New-moon-2/src/reader/worFonts.js — the 29 reader fonts offered by
// the Galaxy Novels reader (exact data-value / data-name / data-family triples
// from the original reader markup).
//
// PORT EDIT: the `google` CSS2 URL field is GONE — every face resolves to a
// TTF bundled at assets/reader/fonts/newmoon/ (shipped as
// ReaderAssets/fonts/newmoon/<file> by the existing withReaderAssets config
// plugin; see plugins/withReaderAssets.js — it fs.cpSync's assets/reader/fonts
// recursively, so the newmoon/ subdirectory lands next to the classic fonts).
//
// Two kinds of entries:
//   - direct  : the canonical Google family IS bundled → the original family
//               stack is kept and @font-face registers that exact family name.
//   - aliased : the family is not bundled → the primary family is swapped to
//               the closest bundled face (Cairo / Tajawal / Amiri / Noto Naskh
//               Arabic / Readex Pro / Scheherazade New) while the picker keeps
//               every original font ID, so the panel looks identical. Bundled
//               rendering is always the fallback — no network is ever touched.
//
// WOR_FONT_FACES is the de-duplicated @font-face registration list consumed by
// buildWorShell({ fontsBase }) in worShell.js.

const CAIRO = [{ family: 'Cairo', file: 'Cairo-VF.ttf', weight: '200 1000' }];
const TAJAWAL = [
  { family: 'Tajawal', file: 'Tajawal-Regular.ttf', weight: '400' },
  { family: 'Tajawal', file: 'Tajawal-Bold.ttf', weight: '700' },
];
const AMIRI = [
  { family: 'Amiri', file: 'Amiri-Regular.ttf', weight: '400' },
  { family: 'Amiri', file: 'Amiri-Bold.ttf', weight: '700' },
];
const NOTO_NASKH = [
  {
    family: 'Noto Naskh Arabic',
    file: 'NotoNaskhArabic-VF.ttf',
    weight: '400 700',
  },
];
const READEX = [
  { family: 'Readex Pro', file: 'ReadexPro-VF.ttf', weight: '160 700' },
];
const SCHEHERAZADE = [
  {
    family: 'Scheherazade New',
    file: 'ScheherazadeNew-Regular.ttf',
    weight: '400',
  },
  {
    family: 'Scheherazade New',
    file: 'ScheherazadeNew-Bold.ttf',
    weight: '700',
  },
];

export const WOR_FONTS = [
  // direct: system default — no bundled file.
  { value: 'default', name: 'الخط العادي', family: 'inherit', local: null },
  // direct: the original already falls back to Amiri (device-local font on
  // the original site) — Amiri is bundled, so the fallback is now real.
  {
    value: 'thmanyah-serif-text',
    name: 'خط ثمانية للنصوص',
    family:
      '"thmanyah Serif Text", "Thmanyah Serif Text", "Thmanyah", Amiri, Georgia, serif',
    local: AMIRI,
  },
  {
    value: 'cairo',
    name: 'خط كايرو',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'tajawal',
    name: 'خط تجوال',
    family: 'Tajawal, Tahoma, Arial, sans-serif',
    local: TAJAWAL,
  },
  {
    value: 'amiri',
    name: 'خط أميري',
    family: 'Amiri, Georgia, serif',
    local: AMIRI,
  },
  {
    value: 'noto-naskh-arabic',
    name: 'خط نوتو نسخ العربي',
    family: '"Noto Naskh Arabic", Amiri, Georgia, serif',
    local: NOTO_NASKH,
  },
  {
    value: 'readex-pro',
    name: 'خط ريدكس برو',
    family: '"Readex Pro", Tahoma, Arial, sans-serif',
    local: READEX,
  },
  {
    value: 'scheherazade-new',
    name: 'خط شهرزاد الجديد',
    family: '"Scheherazade New", Amiri, Georgia, serif',
    local: SCHEHERAZADE,
  },
  // aliases — every ID stays in the picker; rendering maps to a bundled face.
  {
    value: 'changa',
    name: 'خط تشانغا',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'el-messiri',
    name: 'خط المسيري',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'harmattan',
    name: 'خط هارماتان',
    family: 'Tajawal, Tahoma, Arial, sans-serif',
    local: TAJAWAL,
  },
  {
    value: 'reem-kufi',
    name: 'خط ريم كوفي',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'markazi-text',
    name: 'خط مركزي',
    family: '"Noto Naskh Arabic", Amiri, Georgia, serif',
    local: NOTO_NASKH,
  },
  {
    value: 'lateef',
    name: 'خط لطيف',
    family: '"Scheherazade New", Amiri, Georgia, serif',
    local: SCHEHERAZADE,
  },
  {
    value: 'mirza',
    name: 'خط ميرزا',
    family: '"Scheherazade New", Amiri, Georgia, serif',
    local: SCHEHERAZADE,
  },
  {
    value: 'lalezar',
    name: 'خط لاليزار',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'baloo-bhaijaan-2',
    name: 'خط بالو بهيجان',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'aref-ruqaa',
    name: 'خط عارف رقعة',
    family: 'Amiri, Georgia, serif',
    local: AMIRI,
  },
  {
    value: 'rakkas',
    name: 'خط ركاس',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'vazirmatn',
    name: 'خط وزيرمتن',
    family: '"Readex Pro", Tahoma, Arial, sans-serif',
    local: READEX,
  },
  {
    value: 'almarai',
    name: 'خط المراعي',
    family: 'Tajawal, Tahoma, Arial, sans-serif',
    local: TAJAWAL,
  },
  {
    value: 'changa-one',
    name: 'خط تشانغا ون',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'katibeh',
    name: 'خط كاتبة',
    family: '"Scheherazade New", Amiri, Georgia, serif',
    local: SCHEHERAZADE,
  },
  {
    value: 'kufam',
    name: 'خط كوفام',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'mada',
    name: 'خط مدى',
    family: '"Readex Pro", Tahoma, Arial, sans-serif',
    local: READEX,
  },
  {
    value: 'qahiri',
    name: 'خط قاهري',
    family: '"Scheherazade New", Amiri, Georgia, serif',
    local: SCHEHERAZADE,
  },
  {
    value: 'ruwudu',
    name: 'خط روودو',
    family: '"Scheherazade New", Amiri, Georgia, serif',
    local: SCHEHERAZADE,
  },
  {
    value: 'noto-kufi-arabic',
    name: 'خط نوتو كوفي العربي',
    family: 'Cairo, Tahoma, Arial, sans-serif',
    local: CAIRO,
  },
  {
    value: 'noto-sans-arabic',
    name: 'خط نوتو سانس العربي',
    family: '"Readex Pro", Tahoma, Arial, sans-serif',
    local: READEX,
  },
];

// Faces registered once per bundled family (de-duplicated, in bundle order).
export const WOR_FONT_FACES = [
  ...CAIRO,
  ...TAJAWAL,
  ...AMIRI,
  ...NOTO_NASKH,
  ...READEX,
  ...SCHEHERAZADE,
];

// Fonts the original engine preloaded on first launch (all local now — kept
// for API parity with the source module).
export const WOR_PRELOAD_FONTS = [
  'cairo',
  'tajawal',
  'amiri',
  'noto-naskh-arabic',
  'readex-pro',
  'scheherazade-new',
];

export const worFontByValue = value =>
  WOR_FONTS.find(f => f.value === value) || WOR_FONTS[0];
