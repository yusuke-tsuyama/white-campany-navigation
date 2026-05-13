export type ExtractedData = {
  companyName?: string;
  overallScore?: number;
  respondents?: number;
  overtimeHours?: number;
  paidLeaveRate?: number;
  radar?: Record<string, number>;
};

export function calculateWhiteScore(data: ExtractedData) {
  let score = 50;
  const reasons: string[] = [];

  if (typeof data.overallScore === "number") {
    if (data.overallScore >= 4.2) {
      score += 15;
      reasons.push(`総合評価が高い（${data.overallScore}）`);
    } else if (data.overallScore < 3.0) {
      score -= 15;
      reasons.push(`総合評価が低い（${data.overallScore}）`);
    }
  }

  if (typeof data.overtimeHours === "number") {
    if (data.overtimeHours <= 20) {
      score += 15;
      reasons.push(`残業時間が少ない（${data.overtimeHours}時間）`);
    } else if (data.overtimeHours <= 30) {
      score += 5;
      reasons.push(`残業時間は中程度（${data.overtimeHours}時間）`);
    } else if (data.overtimeHours > 45) {
      score -= 20;
      reasons.push(`残業時間が多い（${data.overtimeHours}時間）`);
    }
  }

  if (typeof data.paidLeaveRate === "number") {
    if (data.paidLeaveRate >= 70) {
      score += 15;
      reasons.push(`有給取得率が高い（${data.paidLeaveRate}%）`);
    } else if (data.paidLeaveRate >= 50) {
      score += 8;
      reasons.push(`有給取得率は悪くない（${data.paidLeaveRate}%）`);
    } else if (data.paidLeaveRate < 40) {
      score -= 10;
      reasons.push(`有給取得率が低め（${data.paidLeaveRate}%）`);
    }
  }

  if (data.radar) {
    const compliance = data.radar["法令順守意識"];
    const morale = data.radar["社員の士気"];
    const longTerm = data.radar["人材の長期育成"];

    if (typeof compliance === "number" && compliance >= 4.5) {
      score += 8;
      reasons.push(`法令順守意識が高い（${compliance}）`);
    }
    if (typeof morale === "number" && morale >= 4.2) {
      score += 6;
      reasons.push(`社員の士気が高い（${morale}）`);
    }
    if (typeof longTerm === "number" && longTerm < 3.5) {
      score -= 8;
      reasons.push(`長期育成の評価が低め（${longTerm}）`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "中立";
  if (score >= 75) label = "かなりホワイト寄り";
  else if (score >= 60) label = "ややホワイト寄り";
  else if (score < 40) label = "ブラック寄り";
  else if (score < 50) label = "ややブラック寄り";

  return { score, label, reasons };
}
