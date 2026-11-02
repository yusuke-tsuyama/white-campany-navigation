// 決算資料の要約の表示。「■」見出し・「・」箇条書きを整形し、念のためMarkdown記号も取り除く。
// 見出しのアイコンは、見出しの言葉から表示側で決める（AIの出力には含めない）
const ICONS: [RegExp, string][] = [
  [/概要/, "📄"],
  [/事業/, "🏢"],
  [/働く人/, "👥"],
];

const headingOf = (raw: string) => {
  // 旧い保存データの見出しも、いまの言い方にそろえる
  const h = raw.replace(/^■\s*/, "").replace("働く人に関する記載", "働く人の記載");
  const icon = ICONS.find(([re]) => re.test(h))?.[1];
  return icon ? `${icon} ${h}` : h;
};

export function SummaryText({ text }: { text: string }) {
  const lines = String(text ?? "").split("\n").map((l) => l.replace(/\*\*/g, "").replace(/^#{1,6}\s*/, "").trimEnd());
  return (
    <div style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t || /^-{3,}$/.test(t)) return <div key={i} style={{ height: 6 }} />;
        if (t.startsWith("■")) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, margin: "12px 0 4px", color: "#0f172a" }}>{headingOf(t)}</h3>;
        if (/^[・\-\*•]\s*/.test(t)) return <div key={i} style={{ paddingLeft: 16, textIndent: -16 }}>・{t.replace(/^[・\-\*•]\s*/, "")}</div>;
        return <p key={i} style={{ margin: "0 0 4px" }}>{t}</p>;
      })}
    </div>
  );
}

/** 要約を囲むカードの背景色（rgb(241,245,249)） */
export const SUMMARY_BG = "#f1f5f9";
