import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "画像ファイルが必要です" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);
    const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const imageContent = {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mediaType, data: base64 },
    };

    // 第1段階: 会社名だけを抽出
    const nameMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: [
          imageContent,
          {
            type: "text",
            text: "この画像はOpenWorkという就職口コミサイトのスクリーンショットです。OpenWork以外の画像なら「NOT_OPENWORK」とだけ返してください。OpenWorkの画像なら、分析対象の企業名を1つだけ返してください。企業名はopenworkロゴの直下、会社ロゴの横に大きく表示されています。口コミ本文・関連会社・競合他社の名前は絶対に使わないでください。企業名のみを返してください。説明不要。",
          },
        ],
      }],
    });

    const companyName = nameMsg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();

    console.log("[analyze] 抽出企業名:", companyName);

    if (companyName === "NOT_OPENWORK") {
      return NextResponse.json({ error: "OpenWorkのスクリーンショットをアップロードしてください" });
    }

    // 第2段階: スコア・数値を分析
    const scoreMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          imageContent,
          {
            type: "text",
            text: `あなたはホワイト企業ナビのデータアナリストです。この画像から以下の数値を読み取り、JSONのみ返してください。マークダウンや説明文は不要です。企業名は「${companyName}」です。{"extracted":{"companyName":"${companyName}","overallScore":null,"workLifeBalance":null,"salary":null,"management":null,"growth":null,"reviewCount":null,"positivePoints":[],"concerns":[]},"result":{"score":50,"label":"概ね良好な傾向","reasons":["根拠1","根拠2"]},"explanation":"総合コメント"}`,
          },
        ],
      }],
    });

    const raw = scoreMsg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    console.log("[analyze] raw:", raw.slice(0, 300));

    let parsed: any;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      console.log("[analyze] parse error:", e);
      return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
    }

    // 会社名を第1段階の結果で上書き
    parsed.extracted.companyName = companyName;

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.log("[analyze] error:", error?.message);
    return NextResponse.json({ error: error?.message || "server error" }, { status: 500 });
  }
}
