import { NextRequest, NextResponse } from "next/server";

type EdinetDoc = {
  docID: string;
  filerName?: string;
  ordinanceCode?: string;
  formCode?: string;
  docDescription?: string;
  submitDateTime?: string;
};

type EdinetDocResponse = {
  results?: EdinetDoc[];
};

function normalize(text: string) {
  return text
    .replace(/\s+/g, "")
    .replace(/株式会社/g, "")
    .replace(/有限会社/g, "")
    .replace(/一般社団法人/g, "")
    .replace(/一般財団法人/g, "")
    .replace(/公益財団法人/g, "")
    .replace(/公益社団法人/g, "")
    .trim()
    .toLowerCase();
}

function isLikelyMatch(target: string, filerName?: string) {
  if (!target || !filerName) return false;
  const a = normalize(target);
  const b = normalize(filerName);
  return a.includes(b) || b.includes(a);
}

function generateSearchDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let m = 0; m < 36; m++) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let d = lastDay; d >= Math.max(1, lastDay - 9); d--) {
      dates.push(year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
    }
  }
  return [...new Set(dates)];
}

async function fetchDocsForDate(dateStr: string, apiKey: string): Promise<EdinetDoc[]> {
  const url = "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=" + dateStr + "&type=2&Subscription-Key=" + apiKey;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = (await res.json()) as EdinetDocResponse;
    return json.results ?? [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyName = String(body.companyName || "").trim();

    if (!companyName) {
      return NextResponse.json({ error: "companyName が必要です" }, { status: 400 });
    }

    const apiKey = process.env.EDINET_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "EDINET_API_KEY が設定されていません" }, { status: 500 });
    }

    const searchDates = generateSearchDates();
    const collected: EdinetDoc[] = [];

    for (const dateStr of searchDates) {
      const docs = await fetchDocsForDate(dateStr, apiKey);
      const matched = docs.filter((doc) => isLikelyMatch(companyName, doc.filerName));
      collected.push(...matched);
      const hasAnnual = collected.some((d) => d.ordinanceCode === "010" && d.formCode === "030000");
      if (hasAnnual && collected.length >= 3) break;
    }

    const deduped = Array.from(
      new Map(collected.map((d) => [d.docID + "-" + d.filerName, d])).values()
    )
      .sort((a, b) => {
        const da = a.submitDateTime ? new Date(a.submitDateTime).getTime() : 0;
        const db = b.submitDateTime ? new Date(b.submitDateTime).getTime() : 0;
        return db - da;
      })
      .slice(0, 20);

    return NextResponse.json({ companyName, count: deduped.length, candidates: deduped });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "server error" }, { status: 500 });
  }
}
