// XBRLから計算した数値（XbrlFinancials）を、転職希望者向けの平易な文に直す。
// 良い・悪いの評価や、原因の推測は書かない。変化の向きと大きさ（数値）だけを書く。
import type { XbrlFinancials, RoaPoint } from "./xbrlFinancials";

export type FactLine = { text: string; basis: string; category?: "finance" | "work" };

export type FinancialView = {
  ok: boolean;
  facts: FactLine[]; // 「確認できたこと」に出す文
  toCheck?: FactLine[]; // 「追加で確認したいこと」に出す文（数値の条件から、コードが作る）
  questions?: { question: string; basis: string }[]; // 「面接での質問例」（同上）
  conditions: string[]; // 「計算の条件」（折りたたみ表示）
  failReason?: string; // 数値を取り出せなかった理由（平易な文）
};

const comma = (n: number) => Math.round(n).toLocaleString("ja-JP");

/** 円 → 「3,645億円」「15.51兆円」 */
export function fmtYen(yen: number): string {
  const a = Math.abs(yen);
  const sign = yen < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(2)}兆円`;
  if (a >= 1e8) return `${sign}${comma(a / 1e8)}億円`;
  return `${sign}${comma(a / 1e4)}万円`;
}
const signedYen = (yen: number) => `${yen >= 0 ? "+" : "-"}${fmtYen(Math.abs(yen))}`;
const pct1 = (v: number, d = 1) => `${v.toFixed(d)}%`;
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const ym = (end: string) => `${end.slice(0, 4)}年${Number(end.slice(5, 7))}月期`;

const FAIL_TEXT: Record<string, string> = {
  no_xbrl: "この書類に、数値のデータ（XBRL）が含まれていなかったため",
  no_values: "最終的な利益と総資産の数値を、この書類から特定できなかったため（金融業など、会計科目が一般の会社と異なる場合に起こることがあります）",
  no_period: "決算期の変更などで、期首と期末の総資産がそろわず、計算できなかったため",
  error: "数値データの取得または読み取りに失敗したため",
};

/** 利益率と回転率の動きから、ROAの変化を1文で説明する（ROA＝利益率×回転率なので、条件が合うときだけ） */
function explainRoa(prev: RoaPoint, cur: RoaPoint): string {
  if (!(prev.netMargin! > 0 && cur.netMargin! > 0 && prev.assetTurnover! > 0 && cur.assetTurnover! > 0 && prev.roa > 0 && cur.roa > 0)) return "";
  const rel = (a: number, b: number) => (b - a) / a; // 変化率
  const m = rel(prev.netMargin!, cur.netMargin!);
  const t = rel(prev.assetTurnover!, cur.assetTurnover!);
  const r = rel(prev.roa, cur.roa);
  const dir = (x: number) => (x > 0.005 ? 1 : x < -0.005 ? -1 : 0);
  if (dir(r) === 0 || dir(m) === 0 || dir(t) === 0) return "";
  const mPlain = dir(m) > 0 ? "上がった" : "下がった";
  const tPlain = dir(t) > 0 ? "大きくなった" : "小さくなった";
  const rt = dir(r) > 0 ? "上がった" : "下がった";
  if (dir(m) === dir(t)) {
    return `利益の出しやすさも、資産に対する売上も${mPlain}ため、ROAは${rt}。`;
  }
  // 向きが逆のとき: ROAと同じ向きに動いた方が、ROAの変化を決めている
  if (dir(m) === dir(r)) return `資産に対する売上は${tPlain}が、利益の出しやすさが${mPlain}ため、ROAは${rt}。`;
  return `利益の出しやすさは${mPlain}が、資産に対する売上が${tPlain}ため、ROAは${rt}。`;
}

export function failView(code: keyof typeof FAIL_TEXT | string | undefined): FinancialView {
  return { ok: false, facts: [], conditions: [], failReason: FAIL_TEXT[code ?? "error"] ?? FAIL_TEXT.error };
}

export function buildFinancialView(f: XbrlFinancials): FinancialView {
  const facts: FactLine[] = [];
  const toCheck: FactLine[] = [];
  const questions: { question: string; basis: string }[] = [];
  const conditions: string[] = [];
  const scopeJa = f.scope === "連結" ? "グループ全体（連結）" : "提出会社単体";
  const emp = f.employees;

  if (f.ok && f.roa.length > 0) {
    const cur = f.roa[0];
    const prev = f.roa.find((r) => r.periodEnd < cur.periodEnd) ?? null;
    const basisCalc = `有価証券報告書（${cur.periodLabel}）の数値から、プログラムが計算`;

    // 1) ROA
    // ROAが1%未満の会社（金融業など）は、小数2桁で表示する
    const dp = Math.max(Math.abs(cur.roa), prev ? Math.abs(prev.roa) : 0) < 1 ? 2 : 1;
    let roaText: string;
    if (prev) {
      const diff = cur.roa - prev.roa;
      const move = Math.abs(diff) < 0.5 * Math.pow(10, -dp) ? "ほぼ同じだった" : `${Math.abs(diff).toFixed(dp)}ポイント${diff > 0 ? "上がった" : "下がった"}`;
      roaText = `ROA（会社が持つ総資産に対して、どれだけ利益を出したかの割合）は、${prev.periodLabel}が**${pct1(prev.roa, dp)}**、${cur.periodLabel}が**${pct1(cur.roa, dp)}**で、**${move}**。`;
    } else {
      roaText = `ROA（会社が持つ総資産に対して、どれだけ利益を出したかの割合）は、${cur.periodLabel}が**${pct1(cur.roa, dp)}**だった。`;
    }
    if (cur.netProfit < 0) roaText += "最終損益が赤字だったため、マイナスになっている。";
    facts.push({ category: "finance", text: roaText, basis: `${basisCalc}（最終的な利益 ÷ 総資産の期首・期末平均）` });

    // 2) ROAの変化を2つに分けて見る（利益の出しやすさ／資産の活かし方）
    if (prev && !f.isFinancial && cur.netMargin !== null && prev.netMargin !== null && cur.assetTurnover !== null && prev.assetTurnover !== null) {
      facts.push({
        category: "finance",
        text:
          `ROAの変化を2つに分けると、売上100円あたりに残った最終的な利益は${(prev.netMargin).toFixed(1)}円から${(cur.netMargin).toFixed(1)}円に、` +
          `資産1円あたりの売上は${prev.assetTurnover.toFixed(2)}円から${cur.assetTurnover.toFixed(2)}円になった。` +
          (() => { const e = explainRoa(prev, cur); return e ? `**${e.replace(/。$/, "")}**。` : ""; })(),
        basis: basisCalc,
      });
    }

    // 3) 売上・利益の増減
    const ch = (k: string) => f.changes.find((c) => c.key === k);
    const rev = ch("revenue"), op = ch("operatingProfit"), np = ch("netProfit");
    const parts: string[] = [];
    const one = (c: typeof rev, name: string) =>
      c && parts.push(`${name}は${fmtYen(c.previous)}から${fmtYen(c.current)}へ${c.pct !== null ? `（前年比${signedPct(c.pct)}）` : ""}`);
    one(rev, "売上高"); one(op, "本業の利益（営業利益）"); one(np, "最終的な利益");
    if (parts.length) facts.push({ category: "finance", text: parts.join("、") + "だった。", basis: basisCalc });
    if (op && op.pct !== null && op.pct >= 3 && op.current > 0) {
      questions.push({
        question: "貴社の業績の伸びは、給与や賞与に、どのように反映されていますか？",
        basis: `有価証券報告書では、営業利益が${fmtYen(op.previous)}から${fmtYen(op.current)}へ、前年比${signedPct(op.pct)}となっているため`,
      });
    }

    // 4) 総資産の増減と、確認できた項目の内訳（残りの合計も示す）
    const ta = ch("totalAssets");
    if (ta) {
      const listed = [
        { c: ch("ppe"), name: "有形固定資産（店舗・設備など）" },
        { c: ch("investments"), name: "投資有価証券" },
        { c: ch("cash"), name: "現預金" },
        { c: ch("inventories"), name: "棚卸資産（在庫）" },
      ].filter((x) => x.c) as { c: NonNullable<typeof ta>; name: string }[];
      listed.sort((a, b) => Math.abs(b.c.delta) - Math.abs(a.c.delta));
      let text = `総資産は${fmtYen(ta.previous)}から${fmtYen(ta.current)}へ、${fmtYen(Math.abs(ta.delta))}${ta.delta >= 0 ? "増えた" : "減った"}。`;
      if (listed.length > 0) {
        const rest = ta.delta - listed.reduce((sum, x) => sum + x.c.delta, 0);
        text += `このうち、${listed.map((x) => `${x.name}${signedYen(x.c.delta)}`).join("、")}である。これら以外の項目の合計は${signedYen(rest)}である。`;
      }
      facts.push({ category: "finance", text, basis: basisCalc });
    }

    // 計算の条件
    conditions.push(`${scopeJa}の数値である（会計基準: ${f.accounting}）。`);
    conditions.push(`ROA ＝ ${f.netProfitLabel === "当期純利益" ? "当期純利益" : "最終的な利益（親会社株主に帰属する当期純利益）"} ÷ 総資産（期首と期末の平均） × 100`);
    conditions.push("数値は有価証券報告書の数値データ（XBRL）から、プログラムが取り出して計算している。AIは計算していない。");
    for (const n of f.notes) if (n.includes("金融業")) conditions.push(n);
    for (const w of f.warnings) conditions.push(w);
  }

  // 5) 従業員（ROAが計算できなくても、取れていれば出す）
  if (emp && emp.count !== null) {
    const empBasis = `有価証券報告書（${ym(emp.asOf)}）の「従業員の状況」`;
    let t = `従業員数は${emp.scope === "連結" ? "グループ全体（連結）で" : "提出会社単体で"}${comma(emp.count)}名${emp.countPrev !== null ? `（前年${comma(emp.countPrev)}名）` : ""}である。`;
    if (emp.temp !== null && emp.temp > 0) {
      t += `これとは別に、パート・アルバイトなどの臨時雇用者が年平均${comma(emp.temp)}名${emp.tempPrev !== null ? `（前年${comma(emp.tempPrev)}名）` : ""}いる。`;
      if (emp.count > 0 && emp.temp >= emp.count) {
        const ratio = (emp.temp / emp.count).toFixed(1);
        t += `臨時雇用者の人数は、従業員数の約${ratio}倍にあたる。`;
        conditions.push("「臨時雇用者の人数は、従業員数の約○倍」は、臨時雇用者の年平均人数 ÷ 従業員数で計算した。臨時雇用者は年平均、従業員数は期末の人数のため、厳密な比較ではない。");
        toCheck.push({
          text: "応募職種の雇用形態（正社員・契約社員・パート・アルバイトなど）を、求人票で確認する。",
          basis: `有価証券報告書では、臨時雇用者の年平均人数が従業員数の約${ratio}倍となっているため`,
        });
      }
    }
    // 人数が前年より5%以上減っているとき: 募集の背景を確認する
    {
      const drops: string[] = [];
      const dropOf = (cur: number | null, prev: number | null, name: string) => {
        if (cur !== null && prev !== null && prev > 0 && (cur - prev) / prev <= -0.05) drops.push(`${name}が前年より${Math.abs(((cur - prev) / prev) * 100).toFixed(1)}%減っている`);
      };
      dropOf(emp.count, emp.countPrev, "従業員数");
      dropOf(emp.temp, emp.tempPrev, "臨時雇用者の人数");
      if (drops.length) {
        toCheck.push({
          text: "今回の募集の背景（増員・欠員補充・新設など）が、求人票や募集要項に書かれているかを確認する。",
          basis: `有価証券報告書では、${drops.join("、")}ため`,
        });
        questions.push({
          question: "今回の募集は、どのような背景（増員・欠員補充・新設など）によるものですか？",
          basis: `有価証券報告書では、${drops.join("、")}ため`,
        });
      }
    }
    facts.push({ category: "work", text: t, basis: empBasis });

    // 提出会社の平均年齢・勤続・年間給与は、人数が十分あるときだけ（持株会社などで数名のときは参考にならない）
    const fl = emp.filer;
    if (emp.scope === "連結" && fl && fl.count >= 100 && fl.avgAge !== null && fl.avgService !== null && fl.avgSalaryYen !== null) {
      facts.push({
        category: "work",
        text: `提出会社（グループの中心となる会社）の従業員${comma(fl.count)}名の平均は、年齢${fl.avgAge.toFixed(1)}歳、勤続${fl.avgService.toFixed(1)}年、年間給与${comma(fl.avgSalaryYen / 1e4)}万円である。グループ全体の値ではない。`,
        basis: empBasis,
      });
      questions.push({
        question: "応募職種の方の、平均的な勤続年数やキャリアの進み方は、どのようなものですか？",
        basis: `有価証券報告書では、提出会社の従業員${comma(fl.count)}名の平均勤続が${fl.avgService.toFixed(1)}年となっているため`,
      });
    } else if (emp.scope === "連結" && fl && fl.count < 100) {
      conditions.push(`提出会社単体の従業員が${comma(fl.count)}名と少ない（持株会社など）ため、平均年齢・勤続年数・年間給与は表示していない。`);
    }
  }

  if (facts.length === 0) {
    return failView(f.failCode);
  }
  return { ok: f.ok, facts, toCheck, questions, conditions, failReason: f.ok ? undefined : FAIL_TEXT[f.failCode ?? "error"] };
}
