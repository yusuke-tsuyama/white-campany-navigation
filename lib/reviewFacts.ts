// OpenWorkのスクリーンショットから「画像に表示されていた情報」だけを取り出し、検証して整える。
// ここでは評価・採点・判定をしない。AIが返した値は、型・長さ・範囲を確かめてから使う。

/** OpenWorkの会社評価（レーダーチャート）の標準8項目。画像に写っていない項目を、AIの推測ではなくコードで判定するために使う */
export const OPENWORK_ITEMS = [
  "待遇面の満足度",
  "社員の士気",
  "風通しの良さ",
  "社員の相互尊重",
  "20代成長環境",
  "人材の長期育成",
  "法令順守意識",
  "人事評価の適正感",
] as const;

export type ReviewExtract = {
  companyName: string | null;
  overallScore: number | null; // 画像に表示された総合評価（0〜5）
  reviewCount: number | null; // 画像に表示された回答者数
  asOf: string | null; // 画像に表示された集計・投稿時点の文言（表示がなければ null）
  rankText: string | null; // 画像に表示された順位表記（例: 上位3%）
  overtimeHours: number | null; // 画像に表示された残業時間（月間, h）
  paidLeaveRate: number | null; // 画像に表示された有給休暇消化率（%）
  itemScores: { label: string; score: number }[]; // 画像から読み取れた項目別評価
  unreadable: string[]; // 標準項目のうち、画像から読み取れなかったもの
};

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>{}"`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

function cleanNum(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

// 空白を除き、表記ゆれ（遵／順 など）をそろえて比較する
const squash = (s: string) =>
  s.replace(/[\s　]+/g, "").replace(/遵/g, "順").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

export function normalizeReviewExtract(raw: unknown, companyName: string | null): ReviewExtract {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const itemScores: { label: string; score: number }[] = [];
  const seen = new Set<string>();
  for (const x of (Array.isArray(r.itemScores) ? r.itemScores : []).slice(0, 12)) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const label = cleanStr(o.label, 30);
    const score = cleanNum(o.score, 0, 5);
    if (label === null || score === null || seen.has(squash(label))) continue;
    seen.add(squash(label));
    itemScores.push({ label, score });
  }

  const readLabels = itemScores.map((i) => squash(i.label));
  const unreadable = OPENWORK_ITEMS.filter(
    (std) => !readLabels.some((l) => l.includes(squash(std)) || squash(std).includes(l))
  );

  const count = cleanNum(r.reviewCount, 0, 10_000_000);
  return {
    companyName,
    overallScore: cleanNum(r.overallScore, 0, 5),
    reviewCount: count === null ? null : Math.round(count),
    asOf: cleanStr(r.asOf, 40),
    rankText: cleanStr(r.rankText, 30),
    overtimeHours: cleanNum(r.overtimeHours, 0, 300),
    paidLeaveRate: cleanNum(r.paidLeaveRate, 0, 100),
    itemScores,
    unreadable: [...unreadable],
  };
}
