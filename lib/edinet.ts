type EdinetDoc = {
  docID?: string;
  filerName?: string;
  secCode?: string;
  ordinanceCode?: string;
  formCode?: string;
  docDescription?: string;
  submitDateTime?: string;
};

type EdinetResponse = {
  results?: EdinetDoc[];
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

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

export async function searchEdinetByCompanyName(params: {
  companyName: string;
  apiKey: string;
  days?: number;
}) {
  const { companyName, apiKey, days = 30 } = params;
  const collected: EdinetDoc[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);

    const url =
      `https://api.edinet-fsa.go.jp/api/v2/documents.json` +
      `?date=${dateStr}&type=2&Subscription-Key=${apiKey}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (!res.ok) continue;

      const json = (await res.json()) as EdinetResponse;
      for (const doc of json.results ?? []) {
        if (isLikelyMatch(companyName, doc.filerName)) {
          collected.push(doc);
        }
      }
    } catch {
      continue;
    }
  }

  const deduped = Array.from(
    new Map(
      collected.map((doc) => [
        `${doc.docID}-${doc.filerName}-${doc.docDescription}`,
        doc,
      ])
    ).values()
  );

  deduped.sort((a, b) => {
    const da = a.submitDateTime ? new Date(a.submitDateTime).getTime() : 0;
    const db = b.submitDateTime ? new Date(b.submitDateTime).getTime() : 0;
    return db - da;
  });

  return deduped.slice(0, 20);
}

export async function fetchEdinetDocumentText(params: {
  docID: string;
  apiKey: string;
}) {
  const { docID, apiKey } = params;

  const url =
    `https://api.edinet-fsa.go.jp/api/v2/documents/${docID}` +
    `?type=1&Subscription-Key=${apiKey}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/octet-stream" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`EDINET document fetch failed: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// 提出書類の検索（企業名 → 有価証券報告書・半期報告書・四半期報告書）
//
// EDINET API v2 には「企業名で検索する」APIがなく、提出日ごとの書類一覧（documents.json）を
// 日付を変えて取得するしかない。そのため、
//  - 平日を新しい日から順に、並列でさかのぼって取得する（月の一部だけを見ると取りこぼす）
//  - 書類種別コード（docTypeCode）で、アプリが使う書類だけに絞る（臨時報告書・内部統制報告書・確認書などは除く）
//  - 同じ会社の有価証券報告書が2期分そろったら探索を止める
// ---------------------------------------------------------------------------

export type EdinetFiling = {
  docID: string;
  edinetCode?: string;
  secCode?: string;
  filerName?: string;
  docTypeCode?: string;
  docDescription?: string;
  periodStart?: string;
  periodEnd?: string;
  submitDateTime?: string;
};

// docTypeCode: 120=有価証券報告書。半期報告書(160)・四半期報告書(140)は、半年・3か月分の数値のため
// 年間の指標（ROAなど）や前年との比較に使えず、要約も有報の見出し構成を前提にしているため、候補に含めない。
// 訂正報告書(130)も含めない。
export const EDINET_TARGET_DOC_TYPES: Record<string, string> = {
  "120": "有価証券報告書",
};

type RawDoc = EdinetFiling & { withdrawalStatus?: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日本時間の「今日」から過去に向かう平日（YYYY-MM-DD）。EDINETの提出日は日本時間 */
export function weekdaysBack(now: Date, days: number): string[] {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const base = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base - i * DAY_MS);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function fetchDocsOnce(date: string, apiKey: string, fetchImpl: typeof fetch): Promise<RawDoc[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(
      `https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${date}&type=2&Subscription-Key=${apiKey}`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: RawDoc[] };
    return json.results ?? [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 取得に失敗した日は1回だけ再試行する。それでも失敗したら null（呼び出し側で「取得できなかった日」として数える） */
async function fetchDocsForDay(date: string, apiKey: string, fetchImpl: typeof fetch): Promise<RawDoc[] | null> {
  return (await fetchDocsOnce(date, apiKey, fetchImpl)) ?? (await fetchDocsOnce(date, apiKey, fetchImpl));
}

function normalizeName(text: string) {
  return text
    .normalize("NFKC") // 全角英数（ＵＦＪ など）と半角を同じ扱いにする
    .replace(/[\s　]+/g, "")
    .replace(/株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益財団法人|公益社団法人/g, "")
    .toLowerCase();
}

/** exact=社名が一致 / partial=どちらかがもう一方を含む / none */
function matchLevel(target: string, filerName?: string): "exact" | "partial" | "none" {
  if (!filerName) return "none";
  const a = normalizeName(target);
  const b = normalizeName(filerName);
  if (a.length < 2 || b.length < 2) return "none";
  if (a === b) return "exact";
  return a.includes(b) || b.includes(a) ? "partial" : "none";
}

export type EdinetFilingSearchResult = {
  filings: EdinetFiling[];
  scannedDays: number;
  failedDays: number;
  /** 時間の上限で探索を打ち切った（=探索が途中で終わっている） */
  stoppedEarly: boolean;
  elapsedMs: number;
  /** ログ用: 各段階で何日分を調べたか */
  phases: string[];
};

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * 探索の流れ（有価証券報告書は年1回なので、全日を調べる必要はない）
 *  1. 今日から新しい日順にさかのぼり、最新の有価証券報告書を見つける
 *  2. 前の期の報告書は、見つけた提出日のほぼ1年前（前後 windowDays 日）に出ているはずなので、そこだけ調べる
 *  3. その範囲に無ければ（決算期の変更など）、直前の提出日から1年3か月前までを、日付を順にさかのぼって探す
 */
export async function searchEdinetFilings(params: {
  companyName: string;
  apiKey: string;
  /** さかのぼる最大月数（既定30か月） */
  maxMonths?: number;
  /** 探索にかける最大時間（既定45秒） */
  timeBudgetMs?: number;
  concurrency?: number;
  /** 何期分の有価証券報告書を探すか（既定2） */
  annualCount?: number;
  /** 前の期を探すときの、1年前の提出日の前後何日を調べるか（既定45日） */
  windowDays?: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<EdinetFilingSearchResult> {
  const {
    companyName,
    apiKey,
    maxMonths = 30,
    timeBudgetMs = 45000,
    concurrency = 10,
    annualCount = 2,
    windowDays = 45,
    fetchImpl = fetch,
    now = new Date(),
  } = params;

  const allDates = weekdaysBack(now, Math.ceil(maxMonths * 31)); // 新しい日 → 古い日
  const started = Date.now();
  const found = new Map<string, EdinetFiling & { level: "exact" | "partial" }>();
  const scanned = new Set<string>();
  const phases: string[] = [];
  let failedDays = 0;
  let stoppedEarly = false;

  /** 見つかった有価証券報告書。社名が完全一致する会社があればその会社に、複数社なら最新の報告書を出した会社に絞る */
  const annuals = () => {
    const list = [...found.values()].filter((f) => f.docTypeCode === "120");
    const pool = list.some((f) => f.level === "exact") ? list.filter((f) => f.level === "exact") : list;
    pool.sort((a, b) => (b.submitDateTime ?? "").localeCompare(a.submitDateTime ?? ""));
    if (pool.length === 0) return [];
    const keyOf = (f: EdinetFiling) => f.edinetCode ?? f.filerName ?? "";
    const key = keyOf(pool[0]);
    return pool.filter((f) => keyOf(f) === key);
  };

  async function scan(dates: string[], shouldStop: () => boolean, label: string) {
    const todo = dates.filter((d) => !scanned.has(d));
    let n = 0;
    for (let i = 0; i < todo.length; i += concurrency) {
      if (Date.now() - started > timeBudgetMs) {
        stoppedEarly = true;
        break;
      }
      const chunk = todo.slice(i, i + concurrency);
      const results = await Promise.all(chunk.map((d) => fetchDocsForDay(d, apiKey, fetchImpl)));
      n += chunk.length;
      chunk.forEach((d) => scanned.add(d)); // 取得に失敗した日も、同じ日を何度も調べないよう「調べた」扱いにする
      for (const docs of results) {
        if (docs === null) {
          failedDays++;
          continue;
        }
        for (const doc of docs) {
          if (!doc.docID || !doc.docTypeCode || !EDINET_TARGET_DOC_TYPES[doc.docTypeCode]) continue;
          if (doc.withdrawalStatus && doc.withdrawalStatus !== "0") continue; // 取下げ・取消
          const level = matchLevel(companyName, doc.filerName);
          if (level === "none") continue;
          found.set(doc.docID, {
            docID: doc.docID,
            edinetCode: doc.edinetCode,
            secCode: doc.secCode,
            filerName: doc.filerName,
            docTypeCode: doc.docTypeCode,
            docDescription: doc.docDescription,
            periodStart: doc.periodStart,
            periodEnd: doc.periodEnd,
            submitDateTime: doc.submitDateTime,
            level,
          });
        }
      }
      if (shouldStop()) break;
    }
    phases.push(`${label}=${n}日`);
  }

  // 1. 最新の有価証券報告書
  await scan(allDates, () => annuals().length >= 1, "最新の有報を探索");

  // 2・3. 前の期
  for (let n = 1; n < annualCount && !stoppedEarly; n++) {
    const cur = annuals();
    if (cur.length < n) break; // 最新のものも見つからなかった（探索範囲内に無い）
    const anchor = (cur[cur.length - 1].submitDateTime ?? "").slice(0, 10);
    if (!anchor) break;
    const target = shiftDays(anchor, -365);
    const lo = shiftDays(target, -windowDays);
    const hi = shiftDays(target, windowDays);
    await scan(allDates.filter((d) => d >= lo && d <= hi), () => annuals().length > n, `${n + 1}期前の提出時期付近`);
    if (annuals().length <= n && !stoppedEarly) {
      // 前の期は、直前の提出日から1年3か月以内に出ているはず（決算期の変更があっても収まる）。それより前までは探さない
      const floor = shiftDays(anchor, -450);
      await scan(allDates.filter((d) => d < anchor && d >= floor), () => annuals().length > n, `${n + 1}期前を全日探索`);
    }
    if (annuals().length <= n) break;
  }

  const filings = annuals()
    .slice(0, 12)
    .map(({ level: _level, ...rest }) => rest);

  return {
    filings,
    scannedDays: scanned.size,
    failedDays,
    stoppedEarly,
    elapsedMs: Date.now() - started,
    phases,
  };
}
