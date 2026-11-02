// 有価証券報告書のXBRL（EDINET API の type=1 の zip）から財務数値を取り出し、
// ROA と前年からの変化の内訳を「コードで」計算する。AI（LLM）は数値の読み取りにも計算にも使わない。
//
// 方針:
// - 連結/単体、年度、利益の種類、単位、計算式を結果に必ず付ける。
// - 数値が取れない・複数のタグで食い違う・決算期が12か月でない場合は、推測で埋めずに計算しない。
import unzipper from "unzipper";

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------
export type Accounting = "日本基準" | "IFRS" | "米国基準" | "不明";
export type Scope = "連結" | "単体";
export type MetricKey =
  | "totalAssets"
  | "netProfit"
  | "revenue"
  | "operatingProfit"
  | "cash"
  | "inventories"
  | "ppe"
  | "investments";

export type Series = Record<string, number>; // key: 期末日(YYYY-MM-DD) → 円

export type RoaPoint = {
  periodEnd: string; // 決算期末日
  periodLabel: string; // 例: 2025年12月期
  roa: number; // %
  netProfit: number; // 円
  assetsStart: number; // 期首総資産（円）= 前期末
  assetsEnd: number; // 期末総資産（円）
  assetsAvg: number;
  netMargin: number | null; // 当期純利益 ÷ 売上高（%）
  assetTurnover: number | null; // 売上高 ÷ 平均総資産（回）
};

export type Change = {
  key: MetricKey;
  label: string;
  current: number; // 円
  previous: number; // 円
  delta: number; // 円
  pct: number | null; // %（前期が正のとき）
};

export type EmployeeFacts = {
  scope: Scope; // 従業員数の集計範囲（連結があれば連結）
  count: number | null; // 従業員数（就業人員）
  countPrev: number | null;
  temp: number | null; // 臨時雇用者（パート・アルバイト等）の年間平均人員
  tempPrev: number | null;
  asOf: string; // 基準日
  // 提出会社（単体）の平均年齢・勤続年数・年間給与。連結がある会社でのみ、単体の値として取り出す
  filer: { count: number; avgAge: number | null; avgService: number | null; avgSalaryYen: number | null } | null;
};

export type FailCode = "no_xbrl" | "no_values" | "no_period";

export type XbrlFinancials = {
  ok: boolean;
  reason?: string; // ok=false のとき
  failCode?: FailCode;
  employees: EmployeeFacts | null; // ROAが計算できなくても、取れれば入る
  accounting: Accounting;
  isFinancial: boolean; // 銀行・保険・証券など（内訳の見方が一般事業会社と異なる）
  scope: Scope | null;
  netProfitLabel: string; // 例: 親会社株主に帰属する当期純利益
  roa: RoaPoint[]; // 新しい期が先頭
  changes: Change[]; // 最新期と前期の比較
  notes: string[]; // 計算の条件・注意（画面に出す）
  warnings: string[]; // 食い違い等（ログ・画面に出す）
  periodEnds: string[]; // 取れた決算期末日（新しい順）
};

// ---------------------------------------------------------------------------
// XBRL インスタンスの解析（正規表現ベース。外部ライブラリなし）
// ---------------------------------------------------------------------------
type Ctx = { instant?: string; start?: string; end?: string; members: string[] };
type RawFact = { tag: string; ctx: string; value: number };

function parseContexts(xml: string): Map<string, Ctx> {
  const map = new Map<string, Ctx>();
  const re = /<(?:\w+:)?context\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?context>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const body = m[2];
    const pick = (name: string) => {
      const r = new RegExp(`<(?:\\w+:)?${name}>\\s*([^<\\s]+)\\s*<`).exec(body);
      return r ? r[1] : undefined;
    };
    const members: string[] = [];
    const mr = /<(?:\w+:)?explicitMember[^>]*>\s*([^<\s]+)\s*</g;
    let x: RegExpExecArray | null;
    while ((x = mr.exec(body))) members.push(x[1]);
    // typedMember を含む場合も「単純でない文脈」として扱う
    if (/<(?:\w+:)?typedMember/.test(body)) members.push("typedMember");
    map.set(m[1], { instant: pick("instant"), start: pick("startDate"), end: pick("endDate"), members });
  }
  return map;
}

function parseFacts(xml: string, wanted: Set<string>): RawFact[] {
  const facts: RawFact[] = [];
  const re = /<((?:jppfs_cor|jpigp_cor|jpcrp_cor):[A-Za-z0-9]+)\s([^>]*?)>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (!wanted.has(m[1])) continue;
    const attrs = m[2];
    const ctx = /contextRef="([^"]+)"/.exec(attrs)?.[1];
    if (!ctx) continue;
    const unit = /unitRef="([^"]+)"/.exec(attrs)?.[1];
    if (!unit || !/JPY/i.test(unit)) continue; // 円建ての数値だけ
    const value = Number(m[3].replace(/[,\s]/g, ""));
    if (!Number.isFinite(value)) continue;
    facts.push({ tag: m[1], ctx, value });
  }
  return facts;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ---------------------------------------------------------------------------
// 取り出す科目とタグ（優先順）
// ---------------------------------------------------------------------------
type MetricDef = { key: MetricKey; label: string; kind: "instant" | "duration"; tags: string[] };

const DEFS: MetricDef[] = [
  {
    key: "totalAssets", label: "総資産", kind: "instant",
    tags: [
      "jppfs_cor:Assets", "jpigp_cor:AssetsIFRS",
      "jpcrp_cor:TotalAssetsSummaryOfBusinessResults",
      "jpcrp_cor:TotalAssetsIFRSSummaryOfBusinessResults",
      "jpcrp_cor:TotalAssetsUSGAAPSummaryOfBusinessResults",
    ],
  },
  {
    key: "netProfit", label: "当期純利益", kind: "duration",
    tags: [
      "jppfs_cor:ProfitLossAttributableToOwnersOfParent", "jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS",
      "jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults",
      "jpcrp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults",
      "jpcrp_cor:NetIncomeLossAttributableToOwnersOfParentUSGAAPSummaryOfBusinessResults",
      "jppfs_cor:NetIncomeLoss", "jpcrp_cor:NetIncomeLossSummaryOfBusinessResults",
    ],
  },
  {
    key: "revenue", label: "売上高", kind: "duration",
    tags: [
      "jppfs_cor:NetSales", "jppfs_cor:OperatingRevenue1", "jpigp_cor:RevenueIFRS", "jpigp_cor:NetSalesIFRS",
      "jpcrp_cor:NetSalesSummaryOfBusinessResults", "jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults",
      "jpcrp_cor:RevenueIFRSSummaryOfBusinessResults", "jpcrp_cor:RevenuesUSGAAPSummaryOfBusinessResults",
    ],
  },
  { key: "operatingProfit", label: "営業利益", kind: "duration", tags: ["jppfs_cor:OperatingIncome", "jpigp_cor:OperatingProfitLossIFRS"] },
  { key: "cash", label: "現預金", kind: "instant", tags: ["jppfs_cor:CashAndDeposits", "jpigp_cor:CashAndCashEquivalentsIFRS"] },
  { key: "inventories", label: "棚卸資産", kind: "instant", tags: ["jppfs_cor:Inventories", "jpigp_cor:InventoriesIFRS", "jpigp_cor:InventoriesCAIFRS"] },
  { key: "investments", label: "投資有価証券", kind: "instant", tags: ["jppfs_cor:InvestmentSecurities"] },
  { key: "ppe", label: "有形固定資産", kind: "instant", tags: ["jppfs_cor:PropertyPlantAndEquipment", "jpigp_cor:PropertyPlantAndEquipmentIFRS"] },
];

// 棚卸資産が一括で出ていない会社向けの内訳（合計して使う）
const INVENTORY_PARTS = [
  "jppfs_cor:MerchandiseAndFinishedGoods", "jppfs_cor:Merchandise", "jppfs_cor:FinishedGoods",
  "jppfs_cor:WorkInProcess", "jppfs_cor:RawMaterialsAndSupplies", "jppfs_cor:RawMaterials",
];

const WANTED = new Set<string>([...DEFS.flatMap((d) => d.tags), ...INVENTORY_PARTS]);

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------
const ymLabel = (end: string) => `${end.slice(0, 4)}年${Number(end.slice(5, 7))}月期`;
const agree = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.001 + 1;

type Collected = {
  series: Record<MetricKey, Series>;
  warnings: string[];
  tagUsed: Partial<Record<MetricKey, string>>;
};

function collect(xml: string, scope: "default" | "nonconsolidated"): Collected {
  const ctxs = parseContexts(xml);
  const facts = parseFacts(xml, WANTED);
  const warnings: string[] = [];
  const tagUsed: Partial<Record<MetricKey, string>> = {};
  const series = {} as Record<MetricKey, Series>;

  const inScope = (c: Ctx) =>
    scope === "default"
      ? c.members.length === 0
      : c.members.length === 1 && /NonConsolidatedMember/.test(c.members[0]);

  // tag → (期末日 → 値)
  const byTag = new Map<string, Map<string, number>>();
  for (const f of facts) {
    const c = ctxs.get(f.ctx);
    if (!c || !inScope(c)) continue;
    let key: string | undefined;
    if (c.instant) key = c.instant;
    else if (c.start && c.end) {
      const d = daysBetween(c.start, c.end);
      if (d < 340 || d > 380) continue; // 12か月でない期間（変則決算・四半期など）は使わない
      key = c.end;
    }
    if (!key) continue;
    const isDurationFact = !c.instant;
    const t = isDurationFact ? `D|${f.tag}` : `I|${f.tag}`;
    if (!byTag.has(t)) byTag.set(t, new Map());
    const m = byTag.get(t)!;
    if (!m.has(key)) m.set(key, f.value);
  }

  for (const def of DEFS) {
    const prefix = def.kind === "duration" ? "D|" : "I|";
    const merged: Series = {};
    const conflicted = new Set<string>();
    for (const tag of def.tags) {
      const m = byTag.get(prefix + tag);
      if (!m) continue;
      if (!tagUsed[def.key]) tagUsed[def.key] = tag;
      for (const [date, v] of m) {
        if (date in merged) {
          if (!agree(merged[date], v)) conflicted.add(date);
        } else merged[date] = v;
      }
    }
    // 棚卸資産: 一括科目がなければ内訳の合計
    if (def.key === "inventories" && Object.keys(merged).length === 0) {
      const sums: Series = {};
      for (const tag of INVENTORY_PARTS) {
        const m = byTag.get("I|" + tag);
        if (!m) continue;
        for (const [d, v] of m) sums[d] = (sums[d] ?? 0) + v;
      }
      Object.assign(merged, sums);
      if (Object.keys(sums).length) tagUsed.inventories = "内訳の合計（商品及び製品・仕掛品・原材料及び貯蔵品）";
    }
    for (const d of conflicted) {
      delete merged[d];
      warnings.push(`${def.label}（${ymLabel(d)}）は、資料内の複数の箇所で数値が一致しなかったため、使用しません。`);
    }
    series[def.key] = merged;
  }
  return { series, warnings, tagUsed };
}


function extractEmployees(xml: string, consolidated: boolean): EmployeeFacts | null {
  const ctxs = parseContexts(xml);
  const re = /<jpcrp_cor:(NumberOfEmployees|AverageNumberOfTemporaryWorkers|AverageAgeYears\w*|AverageLengthOfServiceYears\w*|AverageAnnualSalary\w*)\s([^>]*?)>([^<]*)<\/jpcrp_cor:\1>/g;
  // key: `${種別}|${default|non}|${基準日}`
  const got = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const ctx = /contextRef="([^"]+)"/.exec(m[2])?.[1];
    const c = ctx ? ctxs.get(ctx) : undefined;
    if (!c || !c.instant) continue;
    const kind = c.members.length === 0 ? "default" : c.members.length === 1 && /NonConsolidatedMember/.test(c.members[0]) ? "non" : null;
    if (!kind) continue;
    const v = Number(m[3].replace(/[,\s]/g, ""));
    if (!Number.isFinite(v)) continue;
    const name = m[1].startsWith("AverageAge") ? "age" : m[1].startsWith("AverageLength") ? "service" : m[1].startsWith("AverageAnnual") ? "salary" : m[1] === "NumberOfEmployees" ? "count" : "temp";
    const k = `${name}|${kind}|${c.instant}`;
    if (!got.has(k)) got.set(k, v);
  }
  // 基準日: 従業員数が取れた最新の日
  const dates = [...got.keys()].filter((k) => k.startsWith("count|default|")).map((k) => k.split("|")[2]).sort().reverse();
  if (dates.length === 0) return null;
  const asOf = dates[0];
  const prev = dates.find((d) => d < asOf && daysBetween(d, asOf) >= 340 && daysBetween(d, asOf) <= 380);
  const g = (name: string, kind: string, d?: string) => (d ? got.get(`${name}|${kind}|${d}`) ?? null : null);
  const filerCount = consolidated ? g("count", "non", asOf) : g("count", "default", asOf);
  const fk = consolidated ? "non" : "default";
  return {
    scope: consolidated ? "連結" : "単体",
    count: g("count", "default", asOf),
    countPrev: g("count", "default", prev),
    temp: g("temp", "default", asOf),
    tempPrev: g("temp", "default", prev),
    asOf,
    filer: filerCount !== null ? { count: filerCount, avgAge: g("age", fk, asOf), avgService: g("service", fk, asOf), avgSalaryYen: g("salary", fk, asOf) } : null,
  };
}

function detectAccounting(xml: string): Accounting {
  if (/jpigp_cor:/.test(xml)) return "IFRS";
  if (/USGAAPSummaryOfBusinessResults/.test(xml)) return "米国基準";
  if (/jppfs_cor:/.test(xml)) return "日本基準";
  return "不明";
}

export function analyzeXbrlInstance(xml: string): XbrlFinancials {
  const accounting = detectAccounting(xml);
  // 銀行・保険・証券の勘定科目（…BNK / …INS / …SEC）が使われている会社は金融業として扱う
  const isFinancial = /<jppfs_cor:[A-Za-z]+(BNK|INS|SEC)[\s>]/.test(xml);
  const employees = extractEmployees(xml, /NonConsolidatedMember/.test(xml) || /ProfitLossAttributableToOwnersOfParent/.test(xml));
  const base = { accounting, isFinancial, employees, roa: [], changes: [], notes: [], warnings: [], periodEnds: [] as string[] };

  // 連結があるか: 単体（NonConsolidatedMember）の数値が同居していれば、無印は連結
  const hasNonConsolidated = /NonConsolidatedMember/.test(xml);
  const hasConsolidatedOnlyTag = /ProfitLossAttributableToOwnersOfParent/.test(xml);
  const consolidated = hasNonConsolidated || hasConsolidatedOnlyTag;

  const tryScopes: { scope: Scope; kind: "default" | "nonconsolidated" }[] = consolidated
    ? [{ scope: "連結", kind: "default" }, { scope: "単体", kind: "nonconsolidated" }]
    : [{ scope: "単体", kind: "default" }];

  let picked: { scope: Scope; c: Collected } | null = null;
  for (const s of tryScopes) {
    const c = collect(xml, s.kind);
    if (Object.keys(c.series.netProfit).length && Object.keys(c.series.totalAssets).length) {
      picked = { scope: s.scope, c };
      break;
    }
  }
  if (!picked) {
    return {
      ...base, ok: false, scope: null, netProfitLabel: "",
      failCode: "no_values" as const,
      reason: "この資料から、当期純利益と総資産の数値を取り出せませんでした。",
    };
  }

  const { scope, c } = picked;
  const warnings = [...c.warnings];
  const netProfitLabel = /OwnersOfParent/.test(c.tagUsed.netProfit ?? "")
    ? "親会社株主に帰属する当期純利益"
    : "当期純利益";

  // 決算期末日（新しい順）：当期純利益が取れた期
  const ends = Object.keys(c.series.netProfit).sort().reverse();
  const assetDates = Object.keys(c.series.totalAssets).sort();
  const prevAssetDate = (end: string) => {
    // 期首＝前期末の総資産日（約1年前）
    const cand = assetDates.filter((d) => d < end).pop();
    if (!cand) return null;
    const gap = daysBetween(cand, end);
    return gap >= 340 && gap <= 380 ? cand : null;
  };

  const roa: RoaPoint[] = [];
  for (const end of ends) {
    const ps = prevAssetDate(end);
    const aEnd = c.series.totalAssets[end];
    const aStart = ps ? c.series.totalAssets[ps] : undefined;
    if (aEnd === undefined || aStart === undefined) continue;
    const avg = (aEnd + aStart) / 2;
    if (avg <= 0) continue;
    const np = c.series.netProfit[end];
    const rev = c.series.revenue[end];
    roa.push({
      periodEnd: end,
      periodLabel: ymLabel(end),
      roa: (np / avg) * 100,
      netProfit: np,
      assetsStart: aStart,
      assetsEnd: aEnd,
      assetsAvg: avg,
      netMargin: !isFinancial && rev && rev > 0 ? (np / rev) * 100 : null,
      assetTurnover: !isFinancial && rev && rev > 0 ? rev / avg : null,
    });
  }

  if (roa.length === 0) {
    return {
      ...base, ok: false, scope, netProfitLabel, warnings,
      periodEnds: ends,
      failCode: "no_period" as const,
      reason: "期首と期末の総資産がそろわない（決算期の変更など）ため、ROAを計算できませんでした。",
    };
  }

  // 最新期と前期の変化（前期の ROA も出ている場合のみ内訳を作る）
  const changes: Change[] = [];
  const latest = ends[0];
  const prevEnd = ends.find((e) => e < latest && daysBetween(e, latest) >= 340 && daysBetween(e, latest) <= 380);
  if (prevEnd && !isFinancial) {
    for (const def of DEFS) {
      const cur = c.series[def.key][latest];
      const prev = c.series[def.key][prevEnd];
      if (cur === undefined || prev === undefined) continue;
      changes.push({
        key: def.key,
        label: def.key === "netProfit" ? netProfitLabel : def.label,
        current: cur,
        previous: prev,
        delta: cur - prev,
        pct: prev > 0 ? ((cur - prev) / prev) * 100 : null,
      });
    }
  }

  const notes = [
    `${scope}の数値（${accounting}）。単位は円で取り出し、画面では百万円に直して表示します。`,
    `ROA = ${netProfitLabel} ÷ ［期首総資産（前期末）と期末総資産の平均］ × 100`,
    "数値は有価証券報告書のXBRLから、プログラムが取り出して計算しています（AIは計算していません）。",
  ];

  if (isFinancial) {
    notes.push("金融業のため、資産の構成が一般事業会社と異なる。ROAの数値と推移のみを示し、売上・現預金・設備などの内訳は示さない。ROAは一般に低く出るため、他の業種との比較には向かない。");
  }

  return {
    ok: true, accounting, isFinancial, employees, scope, netProfitLabel, roa, changes, notes, warnings, periodEnds: ends,
  };
}

/** zip（EDINET API type=1）から、本文のXBRLインスタンス（XML文字列）を取り出す。なければ null */
export async function readXbrlInstance(zip: Buffer): Promise<string | null> {
  const dir = await unzipper.Open.buffer(zip);
  const cands = dir.files.filter(
    (f) => f.type === "File" && /XBRL\/PublicDoc\/[^/]+\.xbrl$/i.test(f.path)
  );
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.uncompressedSize - a.uncompressedSize);
  return (await cands[0].buffer()).toString("utf-8");
}

export const NO_XBRL_RESULT: XbrlFinancials = {
  ok: false, accounting: "不明", isFinancial: false, employees: null, failCode: "no_xbrl", scope: null,
  netProfitLabel: "", roa: [], changes: [], notes: [], warnings: [], periodEnds: [],
  reason: "この資料にXBRL（数値データ）が含まれていませんでした。",
};

/** zip から財務数値を解析する */
export async function analyzeXbrlZip(zip: Buffer): Promise<XbrlFinancials> {
  const xml = await readXbrlInstance(zip);
  return xml ? analyzeXbrlInstance(xml) : NO_XBRL_RESULT;
}

// ---------------------------------------------------------------------------
// 表示用の整形
// ---------------------------------------------------------------------------
export const toMillion = (yen: number) => Math.round(yen / 1_000_000);
export const fmtMillion = (yen: number) => `${toMillion(yen).toLocaleString("ja-JP")}百万円`;
export const fmtPct = (v: number) => `${v.toFixed(2)}%`;
