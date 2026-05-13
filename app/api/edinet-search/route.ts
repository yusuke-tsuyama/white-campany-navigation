import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyName = String(body.companyName || "").trim();
    const apiKey = process.env.EDINET_API_KEY;

    if (!companyName) {
      return NextResponse.json({ error: "企業名が必要です" }, { status: 400 });
    }

    const TARGET_DOC_TYPES = ["120", "130", "140", "160", "200"];
    const today = new Date();
    const results: any[] = [];

    // 入力名から検索候補を生成（Claude API不使用）
    const base = companyName
      .replace(/^(株式会社|有限会社|合同会社|合資会社|合名会社)[\s　]?/, "")
      .replace(/[\s　]?(株式会社|有限会社|合同会社|合資会社|合名会社)$/, "")
      .trim();

    const searchNames = [
      companyName,
      `株式会社${base}`,
      `${base}株式会社`,
      base,
    ].filter((n, i, arr) => n && arr.indexOf(n) === i);

    console.log("[edinet-search] 検索名候補:", searchNames);

    // 並列で直近30日分取得
    const fetchPromises = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${apiKey}`;
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
    });

    const responses = await Promise.all(fetchPromises);

    for (const data of responses) {
      if (!data?.results) continue;
      const matched = data.results.filter((d: any) => {
        if (!d.filerName || !TARGET_DOC_TYPES.includes(d.docTypeCode)) return false;
        const filer = d.filerName.replace(/[\s\u3000]/g, "");
        const normalizedBase = base.replace(/[\s\u3000]/g, "");
        return searchNames.some(name => filer === name.replace(/[\s\u3000]/g, "")) || filer.includes(normalizedBase);
      });
      results.push(...matched);
    }

    // 30日でヒットしない場合は過去1年を順次検索
    if (results.length === 0) {
      for (let i = 30; i < 365; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2&Subscription-Key=${apiKey}`;
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          const matched = (data?.results || []).filter((d: any) => {
            if (!d.filerName || !TARGET_DOC_TYPES.includes(d.docTypeCode)) return false;
            const filer = d.filerName.replace(/[\s\u3000]/g, "");
            return searchNames.some(name => filer === name.replace(/[\s\u3000]/g, "")) || filer.includes(base.replace(/[\s\u3000]/g, ""));
          });
          results.push(...matched);
          if (results.length >= 5) break;
        } catch { continue; }
      }
    }

    console.log("[edinet-search] found:", results.length);
    return NextResponse.json({ candidates: results.slice(0, 5), count: results.length });
  } catch (error: any) {
    console.log("[edinet-search] error:", error?.message);
    return NextResponse.json({ error: error?.message || "server error" }, { status: 500 });
  }
}
