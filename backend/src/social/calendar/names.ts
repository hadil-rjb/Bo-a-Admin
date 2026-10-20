/* Ported from the AutoCalendar project (server/i18n/names.js). */
/**
 * Builds display names for events in English and Arabic.
 *
 * English: "<Country> <Indicator> (<YoY|MoM|QoQ>) (<Q3>)"  e.g. "China GDP (YoY) (Q3)"
 * Arabic:  "<indicator> <country adjective> (<suffix>)"    e.g. "الناتج المحلي الإجمالي الصيني (سنوي)"
 *
 * Unknown indicators fall back to the English title and are flagged so the
 * dashboard can ask for a translation (which is then remembered).
 */

export const COUNTRIES: Record<string, { en: string; flag: string; m: string; f: string }> = {
  US: { en: 'US', flag: 'us', m: 'الأمريكي', f: 'الأمريكية' },
  EU: { en: 'Eurozone', flag: 'eu', m: 'في منطقة اليورو', f: 'في منطقة اليورو' },
  GB: { en: 'UK', flag: 'gb', m: 'البريطاني', f: 'البريطانية' },
  JP: { en: 'Japan', flag: 'jp', m: 'الياباني', f: 'اليابانية' },
  CN: { en: 'China', flag: 'cn', m: 'الصيني', f: 'الصينية' },
  CA: { en: 'Canada', flag: 'ca', m: 'الكندي', f: 'الكندية' },
  AU: { en: 'Australia', flag: 'au', m: 'الأسترالي', f: 'الأسترالية' },
  NZ: { en: 'New Zealand', flag: 'nz', m: 'النيوزيلندي', f: 'النيوزيلندية' },
  CH: { en: 'Switzerland', flag: 'ch', m: 'السويسري', f: 'السويسرية' },
  DE: { en: 'Germany', flag: 'de', m: 'الألماني', f: 'الألمانية' },
  FR: { en: 'France', flag: 'fr', m: 'الفرنسي', f: 'الفرنسية' },
  IT: { en: 'Italy', flag: 'it', m: 'الإيطالي', f: 'الإيطالية' },
  ES: { en: 'Spain', flag: 'es', m: 'الإسباني', f: 'الإسبانية' },
};

// Ordered: more specific patterns first. g = grammatical gender of the Arabic head noun.
const INDICATORS: [RegExp, string, 'm' | 'f'][] = [
  [/^core pce price index/i, 'مؤشر أسعار نفقات الاستهلاك الشخصي الأساسي', 'm'],
  [/^pce price index/i, 'مؤشر أسعار نفقات الاستهلاك الشخصي', 'm'],
  [/^core inflation rate/i, 'معدل التضخم الأساسي', 'm'],
  [/^core (cpi|consumer price)/i, 'مؤشر أسعار المستهلك الأساسي', 'm'],
  [/^inflation rate/i, 'معدل التضخم', 'm'],
  [/^(cpi|consumer price index)/i, 'مؤشر أسعار المستهلك', 'm'],
  [/^(ppi|producer price)/i, 'مؤشر أسعار المنتجين', 'm'],
  [/^gdp price index/i, 'مؤشر أسعار الناتج المحلي', 'm'],
  [/^gdp( growth rate| growth)?\b/i, 'الناتج المحلي الإجمالي', 'm'],
  [/^non farm payrolls|^nonfarm payrolls/i, 'الوظائف غير الزراعية', 'f'],
  [/^adp employment change/i, 'التغير في التوظيف ADP', 'm'],
  [/^employment change/i, 'التغير في التوظيف', 'm'],
  [/^unemployment rate/i, 'معدل البطالة', 'm'],
  [/^(initial )?jobless claims/i, 'طلبات إعانة البطالة الأولية', 'f'],
  [/^continuing jobless claims/i, 'طلبات إعانة البطالة المستمرة', 'f'],
  [/^claimant count change/i, 'التغير في طلبات إعانة البطالة', 'm'],
  [/^average hourly earnings/i, 'متوسط الأجر في الساعة', 'm'],
  [/^average earnings/i, 'متوسط الدخل', 'm'],
  [/^jolts job openings/i, 'فرص العمل JOLTS', 'f'],
  [/^core retail sales/i, 'مبيعات التجزئة الأساسية', 'f'],
  [/^retail sales/i, 'مبيعات التجزئة', 'f'],
  [/^(fed )?interest rate decision|^interest rate$/i, 'قرار سعر الفائدة', 'm'],
  [/^loan prime rate/i, 'سعر الفائدة الأساسي على القروض', 'm'],
  [/^fomc minutes/i, 'محضر اجتماع اللجنة الفيدرالية', 'm'],
  [/^fomc economic projections/i, 'التوقعات الاقتصادية للفيدرالي', 'f'],
  [/^(balance of trade|trade balance)/i, 'الميزان التجاري', 'm'],
  [/^current account/i, 'الحساب الجاري', 'm'],
  [/^exports/i, 'الصادرات', 'f'],
  [/^imports/i, 'الواردات', 'f'],
  [/^industrial production/i, 'الإنتاج الصناعي', 'm'],
  [/^ism manufacturing pmi/i, 'مؤشر ISM لمديري المشتريات الصناعي', 'm'],
  [/^ism services pmi|^ism non-manufacturing pmi/i, 'مؤشر ISM لمديري المشتريات الخدمي', 'm'],
  [/^(s&p global |hcob |caixin |au jibun bank |judo bank )?manufacturing pmi/i, 'مؤشر مديري المشتريات الصناعي', 'm'],
  [/^(s&p global |hcob |caixin |au jibun bank |judo bank )?services pmi/i, 'مؤشر مديري المشتريات الخدمي', 'm'],
  [/^(s&p global |hcob |caixin |au jibun bank |judo bank )?composite pmi/i, 'مؤشر مديري المشتريات المركب', 'm'],
  [/^nbs manufacturing pmi/i, 'مؤشر مديري المشتريات الصناعي الرسمي', 'm'],
  [/^housing starts/i, 'بدايات المساكن', 'f'],
  [/^building permits/i, 'تصاريح البناء', 'f'],
  [/^pending home sales/i, 'مبيعات المنازل المعلقة', 'f'],
  [/^existing home sales/i, 'مبيعات المنازل القائمة', 'f'],
  [/^new home sales/i, 'مبيعات المنازل الجديدة', 'f'],
  [/^durable goods orders/i, 'طلبيات السلع المعمرة', 'f'],
  [/^factory orders/i, 'طلبيات المصانع', 'f'],
  [/^michigan consumer sentiment/i, 'ثقة المستهلك لجامعة ميشيغان', 'f'],
  [/^(cb )?consumer confidence/i, 'ثقة المستهلك', 'f'],
  [/^zew economic sentiment/i, 'مؤشر ZEW للثقة الاقتصادية', 'm'],
  [/^zew current conditions/i, 'مؤشر ZEW للأوضاع الحالية', 'm'],
  [/^ifo business climate/i, 'مؤشر Ifo لمناخ الأعمال', 'm'],
  [/^tankan/i, 'مؤشر تانكان', 'm'],
  [/^(eia )?crude oil stocks change|^crude oil inventories/i, 'مخزونات النفط الخام', 'f'],
  [/^api crude oil stock change/i, 'مخزونات النفط الخام API', 'f'],
  [/^personal income/i, 'الدخل الشخصي', 'm'],
  [/^personal spending/i, 'الإنفاق الشخصي', 'm'],
  [/^wage price index/i, 'مؤشر أسعار الأجور', 'm'],
  [/^ivey pmi/i, 'مؤشر Ivey لمديري المشتريات', 'm'],
];

const SUFFIX_RE = /\s*\(?\b(YoY|MoM|QoQ)\b\)?\s*$/i;
const SUFFIX_AR: Record<string, string> = { yoy: 'سنوي', mom: 'شهري', qoq: 'ربع سنوي' };

function splitSuffix(title: string) {
  const m = SUFFIX_RE.exec(title);
  if (!m) return { base: title.trim(), suffix: '' };
  return { base: title.slice(0, m.index).trim(), suffix: m[1] };
}

const normalizeSuffix = (s: string) => ({ yoy: 'YoY', mom: 'MoM', qoq: 'QoQ' } as Record<string, string>)[s.toLowerCase()];

const QUALIFIER_RE = /\s+(Prel|Final|Flash|Adv)\.?$/i;
const QUALIFIER_AR: Record<string, string> = { prel: 'أولي', final: 'نهائي', flash: 'أولي', adv: 'مسبق' };

/** "Building Permits MoM Prel" → { base: "Building Permits", suffix: "MoM", qualifier: "Prel" } */
function parseTitle(title = '') {
  let t = title.trim();
  let qualifier = '';
  const q = QUALIFIER_RE.exec(t);
  if (q) {
    qualifier = q[1];
    t = t.slice(0, q.index);
  }
  return { ...splitSuffix(t), qualifier };
}

const BANKS: Record<string, string> = {
  fed: 'الاحتياطي الفيدرالي', fomc: 'الاحتياطي الفيدرالي', ecb: 'البنك المركزي الأوروبي', boe: 'بنك إنجلترا',
  boj: 'بنك اليابان', boc: 'بنك كندا', rba: 'البنك الاحتياطي الأسترالي', rbnz: 'البنك الاحتياطي النيوزيلندي',
  snb: 'البنك الوطني السويسري', pboc: 'بنك الشعب الصيني', bundesbank: 'البنك المركزي الألماني',
};
const SPEECH_RE = /^(Fed|FOMC|ECB|BoE|BoJ|BoC|RBA|RBNZ|SNB|PBoC|Bundesbank)\s+(?:(Chair(?:man)?|President|Governor)\s+)?(.+?)\s+Speech$/i;

function arabicSpeech(base: string) {
  const m = SPEECH_RE.exec(base);
  if (!m) return null;
  const bank = BANKS[m[1].toLowerCase()];
  const person = m[3].trim();
  return m[2] ? `كلمة رئيس ${bank} ${person}` : `كلمة ${person} من ${bank}`;
}

export type NamedEvent = { country?: string; title?: string; period?: string };

export function englishName(ev: NamedEvent) {
  const c = ev.country ? COUNTRIES[ev.country] : undefined;
  const parsed = parseTitle(ev.title || '');
  const { suffix, qualifier } = parsed;
  const base = parsed.base.replace(/^GDP Growth Rate\b/i, 'GDP');
  const prefix = c && !SPEECH_RE.test(base) && !base.toLowerCase().startsWith(c.en.toLowerCase());
  let name = prefix ? `${c.en} ${base}` : base;
  if (suffix) name += ` (${normalizeSuffix(suffix)})`;
  if (qualifier) name += ` (${qualifier[0].toUpperCase()}${qualifier.slice(1).toLowerCase()})`;
  if (/^Q[1-4]$/.test(ev.period || '')) name += ` (${ev.period})`;
  return name;
}

export function arabicName(ev: NamedEvent, learned: Record<string, string> = {}): { name: string; translated: boolean } {
  const key = learnedKey(ev);
  if (learned[key]) return { name: learned[key], translated: true };

  const { base, suffix, qualifier } = parseTitle(ev.title || '');
  const speech = arabicSpeech(base);
  if (speech) return { name: speech, translated: true };

  const cleaned = base.replace(/\b(preliminary|s\.a|n\.s\.a)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
  const hit = INDICATORS.find(([re]) => re.test(cleaned));
  if (!hit) return { name: englishName(ev), translated: false };

  const [, ar, g] = hit;
  const c = ev.country ? COUNTRIES[ev.country] : undefined;
  let name = c ? `${ar} ${c[g]}` : ar;
  const tags = [suffix && SUFFIX_AR[suffix.toLowerCase()], qualifier && QUALIFIER_AR[qualifier.toLowerCase()]].filter(Boolean);
  if (tags.length) name += ` (${tags.join('، ')})`;
  return { name, translated: true };
}

export const learnedKey = (ev: NamedEvent) => `${ev.country}|${ev.title}`;
