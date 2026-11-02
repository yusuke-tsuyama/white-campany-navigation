import type { CSSProperties } from "react";

// 「**強調**」と書かれた部分を、太字＋蛍光ペン風にして表示する（それ以外のMarkdownは扱わない）
const MARKER: CSSProperties = {
  fontWeight: 700,
  background: "linear-gradient(transparent 55%, #fde68a 55%)",
};

export function RichText({ text }: { text: string }) {
  const parts = String(text ?? "").split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i} style={MARKER}>{p}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

export type ConfirmedItem = { text: string; basis: string; category?: "finance" | "work" };

const H3: CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 };
const H4: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#334155", margin: "0 0 6px" };
const UL: CSSProperties = { paddingLeft: 18, margin: "0 0 14px", fontSize: 14, lineHeight: 1.8 };
const BASIS: CSSProperties = { display: "block", fontSize: 12, color: "#64748b" };

/** 区切り線（確認ポイントの各ブロックの間） */
export function SectionDivider() {
  return <hr style={{ border: "none", borderTop: "1px solid #000", margin: "18px 0" }} />;
}

/** 「確認できたこと」。財務と働く環境に分けて表示する（分類がない旧データは、そのまま1つの並びで表示） */
export function ConfirmedBlock({ items, conditions }: { items: ConfirmedItem[]; conditions?: string[] }) {
  const list = (arr: ConfirmedItem[]) => (
    <ul style={UL}>
      {arr.map((it, i) => (
        <li key={i}>
          <RichText text={it.text} />
          {it.basis && <span style={BASIS}>根拠: {it.basis}</span>}
        </li>
      ))}
    </ul>
  );
  const finance = items.filter((x) => x.category === "finance");
  const work = items.filter((x) => x.category === "work");
  const hasCategory = finance.length + work.length > 0;
  const cond = (conditions?.length ?? 0) > 0 && (
    <details style={{ margin: "-6px 0 14px", fontSize: 12, color: "#64748b" }}>
      <summary style={{ cursor: "pointer", color: "#1d4ed8" }}>数値の計算の条件を見る</summary>
      <ul style={{ paddingLeft: 18, margin: "6px 0 0", lineHeight: 1.7 }}>
        {conditions!.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </details>
  );
  return (
    <div>
      <h3 style={H3}>✅ 確認できたこと</h3>
      {hasCategory ? (
        <>
          {finance.length > 0 && (
            <>
              <h4 style={H4}>💰 会社の財務状況に関すること</h4>
              {list(finance)}
              {cond}
            </>
          )}
          {work.length > 0 && (
            <>
              <h4 style={H4}>👤 働く環境や条件に関すること</h4>
              {list(work)}
            </>
          )}
          {finance.length === 0 && cond}
        </>
      ) : (
        <>
          {list(items)}
          {cond}
        </>
      )}
    </div>
  );
}
