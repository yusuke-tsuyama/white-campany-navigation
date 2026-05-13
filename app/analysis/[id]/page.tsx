import { notFound, redirect } from "next/navigation";
import Link from "next/link";
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

  const score = data.final_judge?.whiteScore ?? 0;
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

      {/* 最終判定 */}
      {data.final_judge && (
        <div style={{ ...card, backgroundColor: "#f0fdf4" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
            最終判定
          </h2>
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
          IR要約
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
