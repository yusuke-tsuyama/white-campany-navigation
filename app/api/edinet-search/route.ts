import { NextRequest, NextResponse } from "next/server";
import { EDINET_TARGET_DOC_TYPES, searchEdinetFilings } from "@/lib/edinet";

// EDINETは企業名での検索ができず、提出日ごとの一覧を順に取得するため、時間がかかる場合がある
export const maxDuration = 60;

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

    const r = await searchEdinetFilings({ companyName, apiKey });

    // 検索にかかった時間と、調べた日数の記録（速度の確認用）
    console.log(
      `[edinet-search] company="${companyName}" elapsed=${(r.elapsedMs / 1000).toFixed(1)}s scannedDays=${r.scannedDays} failedDays=${r.failedDays} stoppedEarly=${r.stoppedEarly} found=${r.filings.length} phases=[${r.phases.join(", ")}]`
    );

    const notes: string[] = [];
    if (r.failedDays > 0) {
      notes.push(`EDINETへの問い合わせに失敗した日が${r.failedDays}日ありました。表示されていない書類がある場合は、もう一度検索してください。`);
    }
    if (r.stoppedEarly) {
      notes.push("時間の上限のため、探索を途中で打ち切りました。表示されていない書類がある場合は、もう一度検索してください。");
    }

    return NextResponse.json({
      companyName,
      count: r.filings.length,
      candidates: r.filings.map((f) => ({
        ...f,
        docTypeLabel: f.docTypeCode ? EDINET_TARGET_DOC_TYPES[f.docTypeCode] : undefined,
      })),
      warning: notes.length ? notes.join(" ") : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "server error" }, { status: 500 });
  }
}
