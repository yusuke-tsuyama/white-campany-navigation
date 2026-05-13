import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import unzipper from "unzipper";
import { fetchEdinetDocumentText } from "@/lib/edinet";

const MODEL = "claude-sonnet-4-5";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function stripTags(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFile(path: string, content: string) {
  const lower = path.toLowerCase();
  let score = 0;

  if (lower.endsWith(".htm")) score += 60;
  else if (lower.endsWith(".html")) score += 58;
  else if (lower.endsWith(".xhtml")) score += 56;
  else if (lower.endsWith(".xml")) score += 45;
  else if (lower.endsWith(".xbrl")) score += 42;
  else if (lower.endsWith(".txt")) score += 30;

  score += Math.min(80, Math.floor(content.length / 1500));

  for (const kw of [
    "経営成績", "財政状態", "事業等のリスク", "経営方針",
    "キャッシュ・フロー", "従業員", "セグメント", "対処すべき課題",
  ]) {
    if (content.includes(kw)) score += 18;
  }
  for (const kw of ["提出日時", "ヘッダ", "目次", "表紙"]) {
    if (content.includes(kw)) score -= 8;
  }

  return score;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const docID = String(body.docID || "").trim();

    if (!docID) {
      return NextResponse.json({ error: "docID が必要です" }, { status: 400 });
    }

    const edinetApiKey = process.env.EDINET_API_KEY;
    if (!edinetApiKey) {
      return NextResponse.json(
        { error: "EDINET_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const zipBuffer = await fetchEdinetDocumentText({ docID, apiKey: edinetApiKey });
    const directory = await unzipper.Open.buffer(zipBuffer);
    const textFiles: { path: string; content: string }[] = [];

    for (const file of directory.files) {
      if (file.type !== "File") continue;
      const lower = file.path.toLowerCase();
      const readable =
        lower.endsWith(".htm") || lower.endsWith(".html") ||
        lower.endsWith(".xhtml") || lower.endsWith(".xml") ||
        lower.endsWith(".xbrl") || lower.endsWith(".txt");
      if (!readable) continue;

      const raw = (await file.buffer()).toString("utf-8");
      const cleaned = stripTags(raw);
      if (cleaned.length > 500) {
        textFiles.push({ path: file.path, content: cleaned });
      }
    }

    if (textFiles.length === 0) {
      return NextResponse.json(
        { error: "要約対象のテキストが見つかりませんでした" },
        { status: 404 }
      );
    }

    const best = textFiles
      .map((f) => ({ ...f, score: scoreFile(f.path, f.content) }))
      .sort((a, b) => b.score - a.score)[0];

    const sourceText = best.content.slice(0, 30000);

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `転職希望者向けにIR資料を読むアナリストとして、
以下のEDINET書類テキストを初心者にも分かる日本語で要約してください。

出力ルール:
1. 200〜400字で全体要約
2. 「事業の特徴」を3点
3. 「転職希望者が気にすべき点」を3点
4. 数字や事業内容が読み取れる場合は反映
5. この書類から読み取れる範囲で記述

書類テキスト:
${sourceText}`,
        },
      ],
    });

    const summary = msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    return NextResponse.json({
      docID,
      sourceFile: best.path,
      extractedTextPreview: sourceText.slice(0, 2000),
      summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "server error" },
      { status: 500 }
    );
  }
}
