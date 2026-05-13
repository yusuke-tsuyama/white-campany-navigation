import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

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

    // 1日3回制限（ログイン済みの場合）
    if (user) {
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
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          {
            type: "text",
            text: `この決算書PDFを分析してください。以下のJSONのみ返してください。マークダウン不要。
{
  "companyName": "企業名",
  "fiscalYear": "決算期",
  "financials": {
    "revenue": 数値またはnull,
    "operatingProfit": 数値またはnull,
    "netProfit": 数値またはnull,
    "totalAssets": 数値またはnull,
    "equity": 数値またはnull,
    "cashFlow": 数値またはnull
  },
  "indicators": {
    "roa": 数値またはnull,
    "roe": 数値またはnull,
    "operatingMargin": 数値またはnull,
    "equityRatio": 数値またはnull
  },
  "score": 0から100の整数,
  "label": "財務的に安定した傾向" または "概ね良好な傾向" または "一部に注目すべき点あり" または "慎重な検討をお勧め",
  "summary": "150字程度の総合コメント（断定表現を避け示唆表現で）",
  "positivePoints": ["良い点1", "良い点2"],
  "concerns": ["懸念点1", "懸念点2"]
}
単位は万円で統一。指標は%で。読み取れない項目はnull。`
          }
        ]
      }]
    });

    const raw = msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    console.log("[pdf-analyze] raw:", raw.slice(0, 200));

    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

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
