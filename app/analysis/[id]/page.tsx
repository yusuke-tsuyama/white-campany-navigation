import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ConfirmedBlock, SectionDivider } from "@/app/RichText";
import { createClient } from "@/lib/supabase/server";

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) redirect("/login");

  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .single();

  if (error || !data) notFound();

  const fj = data.final_judge;
  const isV2 = fj?.format === "v2";
  const isLegacy = !!fj && !isV2;
  const score = fj?.whiteScore ?? 0;
  const scoreColor =
    score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";

  const card: React.CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  };

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "16px 12px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/history" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>
          ← 履歴
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>診断詳細</h1>
      </div>

      {/* 基本情報 */}
      <div style={card}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          {data.company_name || "会社名不明"}
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
          {new Date(data.created_at).toLocaleString("ja-JP")}
        </p>
      </div>

      {/* 新形式（応募前の確認ポイント） */}
      {isV2 && (
        <div style={{ ...card, backgroundColor: "#f0fdf4" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>応募前の確認ポイント</h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>
            口コミ画像と決算資料から読み取れた範囲の整理です。企業の良し悪しを判定するものではありません。
          </p>
          <ConfirmedBlock items={fj.confirmed ?? []} conditions={fj.financialConditions} />
          <SectionDivider />
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>🔍 追加で確認したいこと</h3>
          <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>
            {(fj.toCheck ?? []).map((it: any, i: number) => (
              <li key={i}>
                {it.text}
                {it.basis && <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>理由: {it.basis}</span>}
              </li>
            ))}
          </ul>
          <SectionDivider />
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>💬 面接での質問例</h3>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.8 }}>
            {(fj.questions ?? []).map((it: any, i: number) => (
              <li key={i}>
                {it.question}
                {it.basis && <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>基づく情報: {it.basis}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 旧形式（スコア表示の最終判定。現在は廃止） */}
      {isLegacy && (
        <div style={{ ...card, backgroundColor: "#f0fdf4" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
            最終判定（旧形式）
          </h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
            この結果は、スコア表示を廃止する前の形式で保存されたものです。現在のアプリでは、このような点数の判定は行っていません。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>
              {score}%
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 99,
                  backgroundColor: "#e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${score}%`,
                    backgroundColor: scoreColor,
                    borderRadius: 99,
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                確信度: {data.final_judge.confidence}%
              </p>
            </div>
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.8,
              color: "#334155",
              whiteSpace: "pre-wrap",
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            {data.final_judge.summary}
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 6, marginTop: 0 }}>
            ✅ プラス要素
          </h3>
          <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>
            {data.final_judge.positives?.map((p: string, i: number) => (
              <li key={i}>{p}</li>
            ))}
          </ul>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#dc2626", marginBottom: 6, marginTop: 0 }}>
            ⚠️ リスク
          </h3>
          <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>
            {data.final_judge.risks?.map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ul>

          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
            💬 面接で確認すべき質問
          </h3>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.8 }}>
            {data.final_judge.interviewQuestions?.map((q: string, i: number) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* IR要約 */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
          決算資料の要約
        </h2>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.8,
            color: "#334155",
            whiteSpace: "pre-wrap",
            margin: 0,
          }}
        >
          {data.ir_summary || "なし"}
        </p>
      </div>

      {/* 生データ（折りたたみ） */}
      <details
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        }}
      >
        <summary
          style={{ fontSize: 14, fontWeight: 700, cursor: "pointer", color: "#64748b" }}
        >
          生データを見る
        </summary>
        <pre
          style={{
            fontSize: 12,
            marginTop: 12,
            overflowX: "auto",
            color: "#334155",
          }}
        >
          {JSON.stringify(data.screenshot_extracted, null, 2)}
        </pre>
      </details>
    </main>
  );
}
