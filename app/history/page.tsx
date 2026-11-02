import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) redirect("/login");

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("id, company_name, final_judge, created_at")
    .eq("user_id", authData.user.id)
    .gte("created_at", oneMonthAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main style={{ padding: 24 }}>読み込みエラー: {error.message}</main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "16px 12px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>
            ← 戻る
          </Link>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>診断履歴</h1>
        </div>
        <Link href="/?tutorial=1" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 14px", fontWeight: 600 }}>
          使い方
        </Link>
      </div>

      {analyses.length === 0 ? (
        <p style={{ fontSize: 14, color: "#64748b" }}>
          まだ保存された診断はありません。
        </p>
      ) : (
        analyses.map((item: any) => (
          <Link
            key={item.id}
            href={`/analysis/${item.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                backgroundColor: "#f0fdf4",
                position: "relative",
                borderRadius: 14,
                padding: "16px 36px 16px 16px",
                marginBottom: 12,
                boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              }}
            >
              <span
                aria-hidden="true"
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 22, color: "#94a3b8", lineHeight: 1 }}
              >
                ›
              </span>
              <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>
                {item.company_name || "会社名不明"}
              </p>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px" }}>
                {new Date(item.created_at).toLocaleString("ja-JP")}
              </p>
              {item.final_judge?.format === "v2" && (
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>応募前の確認ポイント</p>
              )}
              {item.final_judge?.format !== "v2" && item.final_judge?.whiteScore !== undefined && (
                <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 6px" }}>旧形式（スコア表示）</p>
              )}
              {item.final_judge?.format !== "v2" && item.final_judge?.whiteScore !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 99,
                      backgroundColor: "#e2e8f0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${item.final_judge.whiteScore}%`,
                        backgroundColor:
                          item.final_judge.whiteScore >= 70
                            ? "#16a34a"
                            : item.final_judge.whiteScore >= 50
                            ? "#d97706"
                            : "#dc2626",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36 }}>
                    {item.final_judge.whiteScore}%
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))
      )}
    </main>
  );
}
