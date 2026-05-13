import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("JSONが見つかりませんでした");
  }
  return cleaned.slice(start, end + 1);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { extracted, scoreResult, irSummary } = body;

    if (!extracted || !scoreResult || !irSummary) {
      return NextResponse.json(
        { error: "extracted, scoreResult, irSummary が必要です" },
        { status: 400 }
      );
    }

    const baseScore =
      typeof scoreResult.score === "number" ? scoreResult.score : 50;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `転職希望者向けに企業の健全性を分析するアナリストとして、
以下3つの情報を統合し「ホワイト企業度／ブラック企業度」の最終判断をしてください。

【口コミ抽出データ】
${JSON.stringify(extracted, null, 2)}

【画像ベーススコア】
${JSON.stringify(scoreResult, null, 2)}

【IR書類要約】
${irSummary}

以下のJSONのみを返してください。説明文不要。

{
  "whiteScore": number,
  "confidence": number,
  "summary": string,
  "positives": [string, string, string],
  "risks": [string, string, string],
  "bizQuestions": [string, string],
  "bossQuestions": [string, string],
  "interviewAdvice": string
}

条件:
- whiteScore, confidence は 0〜100 の整数
- 口コミとIRの矛盾・一致を重視
- 「この情報から見る限り」という留保を入れる
- bizQuestions は財務・事業リスクを確認するための面接質問を2問生成する
- bossQuestions は口コミのネガティブ要素（管理職評価・風通し・待遇満足度など）を具体的に踏まえて、この会社特有の上司リスクを見抜く質問を2問生成する。汎用的な質問ではなく、その企業の口コミに基づいた具体的な質問にする。上司の人柄・感情コントロール・ハラスメントリスクを直接探る内容のみ。成長・育成・事業に関する質問は絶対に含めない`,
        },
      ],
    });

    const text = msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    let judged: any;
    try {
      judged = JSON.parse(extractJsonObject(text));
    } catch (e: any) {
      return NextResponse.json(
        { error: "最終判定JSONの解析に失敗しました", detail: e?.message, raw: text },
        { status: 500 }
      );
    }

    return NextResponse.json({
      finalJudge: {
        whiteScore: clamp(
          Math.round(baseScore * 0.4 + (Number(judged.whiteScore) || 50) * 0.6),
          0,
          100
        ),
        confidence: clamp(Math.round(Number(judged.confidence) || 60), 0, 100),
        summary:
          typeof judged.summary === "string"
            ? judged.summary
            : "総合判定を取得できませんでした。",
        positives: Array.isArray(judged.positives) ? judged.positives : [],
        risks: Array.isArray(judged.risks) ? judged.risks : [],
        bizQuestions: Array.isArray(judged.bizQuestions) ? judged.bizQuestions : [],
        bossQuestions: Array.isArray(judged.bossQuestions) ? judged.bossQuestions : [],
        interviewAdvice: typeof judged.interviewAdvice === "string" ? judged.interviewAdvice : "",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "server error" },
      { status: 500 }
    );
  }
}
