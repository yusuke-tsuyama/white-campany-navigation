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
