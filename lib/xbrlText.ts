// 有価証券報告書のXBRLから、転職希望者に関係する本文（事業の内容・人材の方針・従業員の状況）を取り出す。
// 「得点の高い1ファイルの先頭3万字」ではなく、項目ごとに分かれた本文を直接使うことで、
// 事業内容や働く人に関する記載が、要約の入力に確実に入るようにする。

const BLOCKS = {
  business: "DescriptionOfBusinessTextBlock", // 事業の内容
  hrPolicy: "PolicyOnDevelopmentOfHumanResourcesAndInternalEnvironmentStrategyTextBlock", // 人材の育成・社内環境整備の方針
  hrMetrics: "DescriptionOfMetricsRelatedToPolicyOnDevelopmentOfHumanResourcesAndInternalEnvironmentAndTargetsAndPerformanceUsingSuchMetricsMetricsAndTargetsTextBlock", // 同・指標と目標
  employees: "InformationAboutEmployeesTextBlock", // 従業員の状況
} as const;

export type XbrlTexts = { business: string; hrPolicy: string; hrMetrics: string; employees: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function htmlToText(escapedHtml: string): string {
  return decodeEntities(escapedHtml)
    .replace(/<\/(p|div|h\d|tr|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t　]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** 最新期（提出日時点）の本文ブロックを取り出す。前期の文脈（Prior）は使わない */
export function extractTexts(xml: string): XbrlTexts {
  const out: XbrlTexts = { business: "", hrPolicy: "", hrMetrics: "", employees: "" };
  for (const [k, tag] of Object.entries(BLOCKS) as [keyof XbrlTexts, string][]) {
    const re = new RegExp(`<jpcrp_cor:${tag}\\s([^>]*)>([\\s\\S]*?)</jpcrp_cor:${tag}>`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const ctx = /contextRef="([^"]+)"/.exec(m[1])?.[1] ?? "";
      if (/Prior/.test(ctx) || /Member/.test(ctx)) continue;
      const t = htmlToText(m[2]);
      if (t.length > out[k].length) out[k] = t;
    }
  }
  return out;
}

/** 要約AIに渡す入力を組み立てる（項目名つき・長さ制限つき）。使える本文がなければ null */
export function buildSummarySource(t: XbrlTexts, maxTotal = 24000): string | null {
  const parts: string[] = [];
  const add = (label: string, text: string, max: number) => {
    if (text.trim().length > 30) parts.push(`【${label}】\n${text.slice(0, max)}`);
  };
  add("事業の内容", t.business, 5000);
  add("人材の育成・社内環境整備の方針", t.hrPolicy, 6000);
  add("人材に関する指標と目標", t.hrMetrics, 4000);
  add("従業員の状況（本文の冒頭）", t.employees, 3000);
  if (parts.length === 0) return null;
  return parts.join("\n\n").slice(0, maxTotal);
}
