import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { fmtYen } from "@/lib/financialView";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // 期限切れレコードをついでに削除
    const supabase = await createClient();
    await supabase.rpc("delete_expired_pdf_analyses");

    // ユーザー認証確認
    const { data: { user } } = await supabase.auth.getUser();

    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) return NextResponse.json({ error: "PDFファイルが必要です" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });
    if (file.type !== "application/pdf") return NextResponse.json({ error: "PDFファイルのみ対応しています" }, { status: 400 });

    // 1日3回制限（ログイン済みの場合）。開発中（next dev）はかけない
    if (user && process.env.NODE_ENV !== "development") {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase
        .from("pdf_analyses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      if ((count ?? 0) >= 3) {
        return NextResponse.json({ error: "1日のPDF分析回数（3回）を超えました。24時間後にお試しください。" }, { status: 429 });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          {
            type: "text",
            text: `この決算書PDFに書かれている数値を、そのまま読み取ってください。評価・採点・コメントは不要です。計算もしないでください。以下のJSONのみ返してください。マークダウン不要。
{
  "companyName": "企業名（PDFの記載のまま）またはnull",
  "fiscalYear": "決算期（例: 2025年3月期）またはnull",
  "unit": "PDFの表示単位。「円」「千円」「万円」「百万円」「億円」のいずれか",
  "revenue": 数値またはnull,
  "operatingProfit": 数値またはnull,
  "netProfit": 数値またはnull,
  "totalAssets": 数値またはnull,
  "equity": 数値またはnull,
  "liabilitiesAndEquity": 数値またはnull
}
条件:
- 数値は、PDFに表示されている単位のまま、カンマなしの数値で返す（単位の換算はしない）。赤字・マイナスは負の数。
- 最新の決算期の値だけを使う。
- netProfit は「当期純利益」（親会社株主に帰属する当期純利益がある場合はそちら）。
- equity は「純資産合計」。liabilitiesAndEquity は「負債・純資産合計」（資産合計とは別に、PDFに書かれている数値をそのまま）。
- 読み取れない項目・PDFに書かれていない項目は null。推測で埋めない。`
          }
        ]
      }]
    });

    const raw = msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const clean = raw.replace(/```json|```/g, "").trim();
    const a = clean.indexOf("{");
    const b = clean.lastIndexOf("}");
    let read: any;
    try {
      read = JSON.parse(clean.slice(a, b + 1));
    } catch {
      return NextResponse.json({ error: "PDFから数値を読み取れませんでした。別のPDFでお試しください。" }, { status: 422 });
    }

    // 単位をそろえて円にする（換算はコードで行う）
    const mult: Record<string, number> = { 円: 1, 千円: 1e3, 万円: 1e4, 百万円: 1e6, 億円: 1e8 };
    const m = mult[String(read?.unit ?? "")];
    const toYen = (v: unknown) => (m && typeof v === "number" && Number.isFinite(v) ? v * m : null);
    const rev = toYen(read.revenue);
    const op = toYen(read.operatingProfit);
    const np = toYen(read.netProfit);
    const ta = toYen(read.totalAssets);
    const eq = toYen(read.equity);
    const le = toYen(read.liabilitiesAndEquity);
    // 資産合計と、負債・純資産合計が合わないPDFは、資産を使った割合を出さない
    const balanceMismatch = ta !== null && le !== null && Math.abs(ta - le) / Math.max(Math.abs(ta), Math.abs(le), 1) > 0.005;
    const fy = typeof read.fiscalYear === "string" && read.fiscalYear.trim() ? read.fiscalYear.trim().slice(0, 30) : null;
    const companyName = typeof read.companyName === "string" ? read.companyName.trim().slice(0, 80) : null;

    const BASIS_READ = "決算書PDF（アップロードされたファイル）の記載を、AIが読み取った値";
    const BASIS_CALC = "決算書PDFから読み取った値を使い、プログラムが計算";
    const pct = (x: number) => `${(Math.abs(x) < 1 ? x.toFixed(2) : x.toFixed(1))}%`;
    const facts: { text: string; basis: string; category: "finance" }[] = [];
    const listed: string[] = [];
    if (rev !== null) listed.push(`売上高${fmtYen(rev)}`);
    if (op !== null) listed.push(`営業利益${fmtYen(op)}`);
    if (np !== null) listed.push(`当期純利益${fmtYen(np)}`);
    if (ta !== null) listed.push(`総資産${fmtYen(ta)}`);
    if (eq !== null) listed.push(`純資産${fmtYen(eq)}`);
    if (listed.length) facts.push({ category: "finance", text: `決算書PDF${fy ? `（${fy}）` : ""}には、${listed.join("、")}と記載されている。`, basis: BASIS_READ });
    if (rev && rev > 0 && op !== null) facts.push({ category: "finance", text: `売上高に対する本業の利益（営業利益）の割合は${pct((op / rev) * 100)}である。`, basis: BASIS_CALC });
    if (rev && rev > 0 && np !== null) facts.push({ category: "finance", text: `売上高に対する最終的な利益の割合は${pct((np / rev) * 100)}である。`, basis: BASIS_CALC });
    const toCheck: { text: string; basis: string }[] = [];
    if (balanceMismatch) {
      facts.push({ category: "finance", text: `決算書PDFには、資産合計は${fmtYen(ta as number)}、負債・純資産合計は${fmtYen(le as number)}と記載されている。`, basis: BASIS_READ });
      toCheck.push({
        text: "決算書PDFの資産合計と負債・純資産合計が一致していない。このため、総資産を使った割合（ROAなど）は計算していない。PDFの記載を確認する。",
        basis: `資産合計は${fmtYen(ta as number)}、負債・純資産合計は${fmtYen(le as number)}と読み取ったため`,
      });
    }
    if (!balanceMismatch && ta && ta > 0 && np !== null) facts.push({ category: "finance", text: `ROA（会社が持つ総資産に対して、どれだけ利益を出したかの割合）は${pct((np / ta) * 100)}である。期末の総資産で計算しており、前年との比較はできていない。`, basis: BASIS_CALC });
    if (!balanceMismatch && ta && ta > 0 && eq !== null) facts.push({ category: "finance", text: `総資産のうち、純資産が占める割合は${pct((eq / ta) * 100)}である。`, basis: BASIS_CALC });

    const conditions = [
      "数値は、アップロードされたPDFの記載をAIが読み取った値である。PDFの記載と照らして確認すること。",
      "ROAは「当期純利益 ÷ 期末の総資産」で計算した。有価証券報告書の場合（期首と期末の平均）とは条件が異なる。",
      "割合は、プログラムが計算した。AIは計算していない。",
    ];
    const parsed = {
      companyName,
      fiscalYear: fy,
      facts,
      toCheck,
      conditions,
      ok: facts.length > 0,
      failReason: facts.length ? undefined : "PDFから金額を読み取れなかった",
    };

    // ログイン済みなら結果を保存
    if (user) {
      await supabase.from("pdf_analyses").insert({
        user_id: user.id,
        company_name: parsed.companyName,
        analysis_result: parsed,
      });
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.log("[pdf-analyze] error:", error?.message);
    return NextResponse.json({ error: error?.message || "server error" }, { status: 500 });
  }
}
