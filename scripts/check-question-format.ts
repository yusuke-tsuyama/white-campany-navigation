// 面接の質問文の整形（formatQuestion）の確認用。
//   npx tsx scripts/check-question-format.ts
import fs from "node:fs";

const src = fs.readFileSync("app/api/final-judge/route.ts", "utf-8");
const fn = src.match(/function formatQuestion[\s\S]*?\n}\n/)![0].replace("(t: string): string", "(t)");
const formatQuestion = new Function(fn + "; return formatQuestion;")() as (t: string) => string;

const cases: [string, string][] = [
  ["「ハンバーガー大学」をはじめとした育成制度について、応募職種ではどのような研修が用意されていますか？", "「『ハンバーガー大学』をはじめとした育成制度について、応募職種ではどのような研修が用意されていますか？」"],
  ["「応募職種における評価・昇給は、どのような基準で決まりますか？」", "「応募職種における評価・昇給は、どのような基準で決まりますか？」"],
  ["応募職種における評価は、どのように決まりますか。また、フィードバックはありますか？", "「応募職種における評価は、どのように決まりますか？」"],
  ["「貴社の有価証券報告書に「直営」とありますが、配属はどう決まりますか？」", "「貴社の有価証券報告書に『直営』とありますが、配属はどう決まりますか？」"],
];
let ng = 0;
for (const [input, expected] of cases) {
  const got = formatQuestion(input);
  const ok = got === expected;
  if (!ok) ng++;
  console.log(ok ? "OK " : "NG ", got);
}
process.exit(ng ? 1 : 0);
