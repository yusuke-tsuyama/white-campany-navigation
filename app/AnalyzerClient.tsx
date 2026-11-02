"use client";
import { useState, useRef, useEffect } from "react";
import { ConfirmedBlock, SectionDivider } from "./RichText";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

// 画像に表示されていた情報だけ（評価・採点はしない）。lib/reviewFacts.ts の ReviewExtract と同じ形
type AnalyzeResponse = {
  extracted?: {
    companyName: string | null;
    overallScore: number | null;
    reviewCount: number | null;
    asOf: string | null;
    rankText: string | null;
    overtimeHours: number | null;
    paidLeaveRate: number | null;
    itemScores: { label: string; score: number }[];
    unreadable: string[];
  };
  error?: string;
};
type EdinetCandidate = { docID?: string; filerName?: string; secCode?: string; docDescription?: string; submitDateTime?: string; };
type EdinetSearchResponse = { companyName?: string; count?: number; candidates?: EdinetCandidate[]; searchMethod?: string; warning?: string; error?: string; };
type EdinetDocResponse = { docID?: string; sourceFile?: string; summary?: string; error?: string;  financialView?: { ok: boolean; facts: { text: string; basis: string }[]; toCheck?: { text: string; basis: string }[]; questions?: { question: string; basis: string }[]; conditions: string[]; failReason?: string }; };
type JudgePair = { text: string; basis: string; category?: "finance" | "work" };
type FinalJudgeResponse = { finalJudge?: { format: "v2"; financialConditions?: string[]; confirmed: JudgePair[]; toCheck: JudgePair[]; questions: { question: string; basis: string }[]; }; error?: string; };
type Step = { label: string; done: boolean; active: boolean };

const TUTORIAL_STEPS = [
  { icon: "📷", title: "OpenWorkのスクリーンショットをアップロード", desc: "OpenWorkの企業評価ページで、「社員による会社評価」のレーダーチャート（8項目の数値）が、すべて入るように撮影して、アップロードしてください。", sample: true },
  { icon: "🤖", title: "AIが画像の数値を読み取る", desc: "総合評価・回答者数・項目別評価など、画像に表示されている数値をAIが読み取ります。点数での判定や採点は行いません。" },
  { icon: "📊", title: "決算資料を取得", desc: "上場企業はEDINETから有価証券報告書を自動取得。非上場企業は決算書PDFをアップロードして、数値を取り出せます。" },
  { icon: "⚖️", title: "確認ポイントの整理", desc: "口コミデータと決算資料から読み取れた事実を整理し、応募前に確認したいことと面接での質問例をまとめます。企業の良し悪しの判定はしません。" },
];

const TERMS = `第1条（サービスの目的）
本サービスは、公開情報およびユーザーが入力した情報をもとに、企業に関する傾向や参考情報を提供し、転職等における意思決定を支援することを目的とします。
本サービスは、特定の企業の安全性、優良性、違法性等を保証・断定するものではありません。

第2条（提供内容）
本サービスは以下の機能を提供します。
・ユーザーが入力した数値情報の分析。
・企業に関する参考情報の整理および要約。
・上記に基づく評価・コメントの生成。
これらの情報は参考情報であり、正確性・完全性・最新性を保証するものではありません。

第3条（利用条件）
・個人の意思決定（転職検討等）の目的で利用すること。
・入力する情報について、自ら取得した情報を使用すること。
・法令および公序良俗に反しない範囲で利用すること。

第4条（禁止事項）
・本サービスの出力結果を第三者に公開、転載、配布する行為。
・特定企業の評価を断定的に広める目的で利用する行為。
・本サービスを営業活動、勧誘、誹謗中傷等に利用する行為。
・他者の権利を侵害する行為。
・本サービスの運営を妨げる行為。

第5条（免責事項）
本サービスは提供する情報の正確性、完全性、有用性について一切の保証を行いません。
ユーザーが本サービスの情報を利用したことにより生じた損害について、運営者は一切の責任を負いません。
最終的な判断は、ユーザー自身の責任において行うものとします。

第6条（データの取り扱い）
・本サービスはOpenWork株式会社とは無関係です。OpenWorkのサーバーへの自動アクセスは行っておらず、ユーザーが撮影したスクリーンショット画像をAIで分析するものです。
・画像データはサーバーに保存されません。
・アップロードされたPDFは解析後即時削除され、サーバーに保存されません。
・保存される情報は、分析結果のテキストデータに限られます。
・PDF解析結果は24時間後に自動削除されます。
・機密情報を含むPDFのアップロードはユーザー自身の判断と責任において行うものとします。

第7条（準拠法・管轄）
本規約は日本法に準拠します。

第8条（お問い合わせ）
本規約に関するお問い合わせは下記までご連絡ください。
合同会社リベルダード
メール：info@liberdade.sakura.ne.jp

最終更新日：2026年6月21日`;


function friendlyError(raw: string): string {
  if (raw.includes("overloaded") || raw.includes("529")) return "AIサーバーが混雑しています。1〜3分後にもう一度お試しください。";
  if (raw.includes("unauthorized") || raw.includes("401")) return "認証エラーです。再ログインしてください。";
  if (raw.includes("timeout") || raw.includes("ETIMEDOUT")) return "通信がタイムアウトしました。再試行してください。";
  return raw;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (res.status === 401) { throw new Error("この機能はログインが必要です。"); }
  let json: any;
  try { json = await res.json(); } catch { throw new Error("サーバー応答の解析に失敗しました。"); }
  if (!res.ok) throw new Error(json?.error || JSON.stringify(json) || `エラー: ${res.status}`);
  return json as T;
}

const card: React.CSSProperties = { backgroundColor: "#fff", borderRadius: 16, padding: "20px 16px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" };

function btn(color = "#0f172a", disabled = false): React.CSSProperties {
  return { display: "block", width: "100%", padding: "13px 20px", fontSize: 15, fontWeight: 600, backgroundColor: disabled ? "#94a3b8" : color, color: "#fff", border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", textAlign: "center", boxSizing: "border-box" };
}


/** 撮り方の例（架空の会社のダミー数値の画像。実在の企業の画面ではありません） */
function ExampleShot() {
  return (
    <div style={{ marginTop: 8, border: "1px dashed #94a3b8", borderRadius: 10, padding: 8, backgroundColor: "#f8fafc" }}>
      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px", textAlign: "center" }}>イメージ図（架空の会社のダミー数値）</p>
      <img src="/example-screenshot.jpg" alt="撮影範囲の例（ダミー数値）" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto", borderRadius: 6 }} />
      <p style={{ fontSize: 11, color: "#64748b", margin: "6px 0 0", textAlign: "center", lineHeight: 1.6 }}>上の図のように、8項目の数値・残業時間・有給休暇消化率が入る範囲で撮影してください。会社名は入力欄に入れるので、画像に写らなくて構いません。</p>
    </div>
  );
}

/** 決算資料の要約の表示。「■」見出し・「・」箇条書きを整形し、念のためMarkdown記号も取り除く */
function SummaryText({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.replace(/\*\*/g, "").replace(/^#{1,6}\s*/, "").trimEnd());
  return (
    <div style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t || /^-{3,}$/.test(t)) return <div key={i} style={{ height: 6 }} />;
        if (t.startsWith("■")) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, margin: "12px 0 4px", color: "#0f172a" }}>{t.replace(/^■\s*/, "")}</h3>;
        if (/^[・\-\*•]\s*/.test(t)) return <div key={i} style={{ paddingLeft: 16, textIndent: -16 }}>・{t.replace(/^[・\-\*•]\s*/, "")}</div>;
        return <p key={i} style={{ margin: "0 0 4px" }}>{t}</p>;
      })}
    </div>
  );
}

function StepProgress({ steps }: { steps: Step[] }) {
  return (
    <div style={{ margin: "16px 0" }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, backgroundColor: step.done ? "#16a34a" : step.active ? "#0f172a" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: step.done || step.active ? "#fff" : "#94a3b8", fontWeight: 700 }}>
            {step.done ? "✓" : i + 1}
          </div>
          <span style={{ fontSize: 14, color: step.done ? "#16a34a" : step.active ? "#0f172a" : "#94a3b8", fontWeight: step.active ? 600 : 400 }}>
            {step.label}{step.active && "..."}
          </span>
        </div>
      ))}
    </div>
  );
}

function Splash() {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
      <div style={{ marginBottom: 20 }}><img src="/app-icon.png" alt="icon" style={{ width: 160, height: 160, borderRadius: 36 }} /></div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: "0 0 8px", textAlign: "center" }}>ホワイト企業ナビ</h1>
      <p style={{ fontSize: 16, color: "#94a3b8", margin: 0, textAlign: "center", padding: "0 16px" }}>口コミ情報と決算資料をもとに<br/>企業を分析する転職支援ツール</p>
          <p style={{ fontSize: 11, color: "#cbd5e1", margin: "8px 0 0", textAlign: "center" }}>provided by 合同会社リベルダード</p>
    </div>
  );
}

function TermsModal({ onAgree, buttonText = "次へ", requireScroll = true }: { onAgree: () => void; buttonText?: string; requireScroll?: boolean }) {
  const [scrolled, setScrolled] = useState(!requireScroll);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!requireScroll) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 40) setScrolled(true);
  };
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: 16 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 20, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", maxHeight: "85dvh" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #f1f5f9" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>利用規約</h2>
          <p style={{ fontSize: 15, color: "#94a3b8", margin: 0 }}>ホワイト企業ナビ</p>
            <p style={{ fontSize: 11, color: "#cbd5e1", margin: "2px 0 0" }}>provided by 合同会社リベルダード</p>
        </div>
        <div onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", whiteSpace: "pre-wrap", margin: 0 }}>{TERMS}</p>
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #f1f5f9" }}>
          {requireScroll && !scrolled && <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 8, marginTop: 0 }}>下までスクロールすると進めます</p>}
          <button onClick={onAgree} disabled={!scrolled} style={btn("#0f172a", !scrolled)}>{buttonText}</button>
        </div>
      </div>
    </div>
  );
}

function PrivacyModal({ onAgree, isFirstVisit }: { onAgree: () => void; isFirstVisit: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: 16 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 20, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", maxHeight: "85dvh" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #f1f5f9" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>プライバシーポリシー</h2>
          <p style={{ fontSize: 15, color: "#94a3b8", margin: 0 }}>ホワイト企業ナビ</p>
          <p style={{ fontSize: 11, color: "#cbd5e1", margin: "2px 0 0" }}>provided by 合同会社リベルダード</p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>最終更新日：2026年6月21日</p>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>1. はじめに</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>合同会社リベルダードは、「ホワイト企業ナビ」をご利用いただくにあたって取得する情報の取り扱いについて、このプライバシーポリシーで説明します。</p>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>2. 取得する情報</h3>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>アカウント情報（登録ユーザーのみ）</p>
            <ul style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: "0 0 8px", paddingLeft: 18 }}>
              <li>メールアドレス</li>
              <li>パスワード（暗号化して保管します。運営者が平文で確認することはありません）</li>
            </ul>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>利用時に生成される情報</p>
            <ul style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0, paddingLeft: 18 }}>
              <li>アップロードされた画像から抽出した口コミテキスト・評価スコア</li>
              <li>EDINETから取得した財務情報のサマリー</li>
              <li>AIが整理した確認ポイント（確認できたこと・追加で確認したいこと・質問例）</li>
              <li>ユーザーID（ログイン済みの場合）またはゲスト識別情報</li>
              <li>分析実行日時</li>
            </ul>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>3. 取得しない情報・保存しない情報</h3>
            <ul style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0, paddingLeft: 18 }}>
              <li>アップロードされた画像ファイルそのもの（分析後に保持しません）</li>
              <li>氏名・住所・電話番号などの個人を特定できる情報（任意で入力した場合を除く）</li>
              <li>クレジットカード番号などの決済情報（本サービスは現時点で有料課金機能がありません）</li>
            </ul>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>4. 外部サービスへの情報送信</h3>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>Anthropic（Claude API）</p>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: "0 0 8px" }}>アップロードされた画像と分析リクエストの内容を、Anthropic社（米国）のAI APIに送信します。画像データはサーバーに保存されませんが、APIへの送信は行われます。この点をご理解のうえでご利用ください。</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>EDINET（金融庁）</p>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: "0 0 8px" }}>企業名などの検索クエリをEDINETに送信し、有価証券報告書などの公開情報を取得します。個人情報はEDINETには送信しません。</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", margin: "0 0 4px" }}>Supabase</p>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>分析結果（口コミテキスト・財務サマリー・確認ポイント・ユーザーID・日時）は、Supabase Inc.（米国）が提供するデータベースサービスに保存されます。</p>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>5. 情報の利用目的</h3>
            <ul style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0, paddingLeft: 18 }}>
              <li>本サービスの機能提供（分析結果の表示・履歴の管理）</li>
              <li>利用状況の把握とサービス改善</li>
              <li>不正利用の防止</li>
            </ul>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>6. 情報の第三者提供</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>取得した情報を、上記「外部サービスへの情報送信」に記載の事業者以外の第三者に提供することはありません。ただし、法令に基づく要請があった場合はこの限りではありません。</p>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>7. 情報の管理・保護</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>分析結果データは、ユーザーごとにアクセス制御（RLS：行レベルセキュリティ）を設定し、他のユーザーが閲覧できないよう管理しています。</p>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>8. ユーザーの権利</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>ご自身の分析履歴の削除をご希望の場合は、下記お問い合わせ先までご連絡ください。</p>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>9. Cookieとアクセス解析</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>本サービスでは、ログイン状態の維持のためにCookieを使用することがあります。</p>
          </section>
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>10. プライバシーポリシーの変更</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>本ポリシーは、法令の改正やサービスの変更にともなって改定する場合があります。重要な変更がある場合は、本サービス上でお知らせします。</p>
          </section>
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>お問い合わせ</h3>
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#334155", margin: 0 }}>{"合同会社リベルダード\nメール：info@liberdade.sakura.ne.jp"}</p>
          </section>
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #f1f5f9" }}>
          <button onClick={onAgree} style={btn("#0f172a")}>{isFirstVisit ? "同意する" : "閉じる"}</button>
        </div>
      </div>
    </div>
  );
}

function Tutorial({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const isLast = current === TUTORIAL_STEPS.length - 1;
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 20, padding: 28, maxWidth: 360, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div key={i} style={{ width: i === current ? 20 : 8, height: 8, borderRadius: 99, backgroundColor: i === current ? "#0f172a" : "#e2e8f0", transition: "width 0.3s ease" }} />
          ))}
        </div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 16, textAlign: "center" }}>{TUTORIAL_STEPS[current].icon}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, marginTop: 0, textAlign: "left" }}>{TUTORIAL_STEPS[current].title}</h2>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: "#64748b", margin: 0, textAlign: "left" }}>{TUTORIAL_STEPS[current].desc}</p>
          {(TUTORIAL_STEPS[current] as any).sample && (
            <div style={{ marginTop: 16 }}>

              <ExampleShot />

            </div>
          )}
          {(TUTORIAL_STEPS[current] as any).note && (
            <div style={{ marginTop: 16 }}>
              <a href="https://note.com/lapromenade1208/n/nfa0f767c3197?app_launch=false" target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                  <img src="https://note.com/lapromenade1208/n/nfa0f767c3197/og-image" alt="noteの記事" style={{ width: "100%", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div style={{ padding: "10px 12px", background: "#fff" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0 }}>スクリーンショットの正しい撮り方</p>
                    <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0" }}>note.com</p>
                  </div>
                </div>
              </a>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {current > 0 && <button onClick={() => setCurrent(c => c - 1)} style={{ ...btn("#e2e8f0"), color: "#0f172a", flex: 1 }}>戻る</button>}
          <button onClick={() => isLast ? onClose() : setCurrent(c => c + 1)} style={{ ...btn("#0f172a"), flex: 1 }}>{isLast ? "はじめる" : "次へ"}</button>
        </div>
        {!isLast && <button onClick={onClose} style={{ display: "block", width: "100%", marginTop: 12, padding: "8px", fontSize: 13, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textAlign: "center" }}>スキップ</button>}
      </div>
    </div>
  );
}

export default function AnalyzerClient({ userId }: { userId: string | null }) {
  const [phase, setPhase] = useState<"splash" | "terms" | "privacy" | "tutorial" | "main">("splash");
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const [companyInput, setCompanyInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [analyzeSteps, setAnalyzeSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [edinetLoading, setEdinetLoading] = useState(false);
  const [edinetData, setEdinetData] = useState<EdinetSearchResponse | null>(null);
  const [edinetSkipped, setEdinetSkipped] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [docData, setDocData] = useState<EdinetDocResponse | null>(null);
  const [judgeLoading, setJudgeLoading] = useState(false);
  const [judgeSteps, setJudgeSteps] = useState<Step[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfConsent, setPdfConsent] = useState(false);
  const [pdfData, setPdfData] = useState<any>(null);
  const [judgeData, setJudgeData] = useState<FinalJudgeResponse | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    const proceed = () => {
      const agreedTerms = localStorage.getItem("terms_agreed");
      const seenTutorial = localStorage.getItem("tutorial_seen");
      setIsFirstVisit(!agreedTerms);
      if (!agreedTerms) setPhase("terms");
      else if (!seenTutorial) setPhase("tutorial");
      else setPhase("main");
    };

    if (sessionStorage.getItem("splash_shown")) {
      proceed();
      return;
    }

    const timer = setTimeout(() => {
      sessionStorage.setItem("splash_shown", "1");
      proceed();
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  const handleAgreeTerms = () => {
    if (isFirstVisit) {
      setPhase("privacy");
    } else {
      setPhase("main");
    }
  };
  const handleAgreePrivacy = () => {
    localStorage.setItem("terms_agreed", "1");
    setPhase(localStorage.getItem("tutorial_seen") ? "main" : "tutorial");
  };
  const handleCloseTutorial = () => { localStorage.setItem("tutorial_seen", "1"); setPhase("main"); };
  const handleReset = () => {
    setCompanyInput(""); setFile(null); setPreview(null); setData(null); setEdinetData(null);
    setEdinetSkipped(false); setDocData(null); setJudgeData(null);
    setSaveMessage(""); setAnalyzeSteps([]); setJudgeSteps([]);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setData(null); setEdinetData(null); setEdinetSkipped(false);
    setDocData(null); setJudgeData(null); setSaveMessage(""); setAnalyzeSteps([]); setJudgeSteps([]);
    if (f) {
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        const maxSize = 4000;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const resized = new File([blob], f.name, { type: "image/jpeg" });
            setFile(resized);
            setPreview(canvas.toDataURL("image/jpeg", 0.9));
          }
          URL.revokeObjectURL(url);
        }, "image/jpeg", 0.9);
      };
      img.src = url;
    } else {
      setFile(null);
      setPreview(null);
    }
  };
  const GUEST_LIMIT = 3;
  const checkGuestLimit = () => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem("guestUsage");
    const usage = stored ? JSON.parse(stored) : { date: today, count: 0 };
    if (usage.date !== today) return { count: 0, date: today };
    return usage;
  };
  const incrementGuestCount = () => {
    const today = new Date().toDateString();
    const usage = checkGuestLimit();
    localStorage.setItem("guestUsage", JSON.stringify({ date: today, count: usage.count + 1 }));
  };

  const handleAnalyze = async () => {
    if (!file || companyInput.trim().length < 2) return;
    if (!user) {
      const usage = checkGuestLimit();
      if (usage.count >= GUEST_LIMIT) {
        setData({ error: "GUEST_LIMIT" });
        return;
      }
      incrementGuestCount();
    }
    setLoading(true); setData(null); setEdinetData(null); setEdinetSkipped(false); setDocData(null); setJudgeData(null); setSaveMessage("");
    const steps: Step[] = [
      { label: "画像をアップロード中", done: false, active: true },
      { label: "AIが画像の数値を読み取り中", done: false, active: false },
      { label: "読み取り結果を検証中", done: false, active: false },
      { label: "表示を準備中", done: false, active: false },
    ];
    setAnalyzeSteps([...steps]);
    try {
      steps[0] = { ...steps[0], done: true, active: false }; steps[1] = { ...steps[1], active: true }; setAnalyzeSteps([...steps]);
      const formData = new FormData(); formData.append("image", file); formData.append("companyName", companyInput.trim());
      const json = await fetchJson<AnalyzeResponse>("/api/analyze", { method: "POST", body: formData });
      steps[1] = { ...steps[1], done: true, active: false }; steps[2] = { ...steps[2], done: true, active: false }; steps[3] = { ...steps[3], active: true }; setAnalyzeSteps([...steps]);
      await new Promise(r => setTimeout(r, 400));
      steps[3] = { ...steps[3], done: true, active: false }; setAnalyzeSteps([...steps]);
      setData(json);
    } catch (e: any) { setData({ error: friendlyError(e?.message || "分析に失敗しました。") }); setAnalyzeSteps([]); }
    finally { setLoading(false); }
  };
  const handleSearchEdinet = async () => {
    const companyName = data?.extracted?.companyName; if (!companyName) return;
    setEdinetLoading(true); setEdinetData(null); setEdinetSkipped(false); setDocData(null); setJudgeData(null);
    try {
      const json = await fetchJson<EdinetSearchResponse>("/api/edinet-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName }) });
      setEdinetData(json);
    } catch (e: any) { setEdinetData({ error: friendlyError(e?.message || "決算資料の検索に失敗しました。") }); }
    finally { setEdinetLoading(false); }
  };
  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    window.location.reload();
  };
  const handleSkipEdinet = () => { setEdinetSkipped(true); setDocData({ summary: "決算資料なし（非上場・EDINET未対応企業）" }); };
  const handlePdfAnalyze = async () => {
    if (!pdfFile || !pdfConsent) return;
    setPdfLoading(true);
    try {
      const fd = new FormData();
      fd.append("pdf", pdfFile);
      const result = await fetchJson<any>("/api/pdf-analyze", { method: "POST", body: fd });
      setPdfData(result);
      setDocData({
        summary: "非上場企業の決算書PDFから、数値だけを取り出した（文章の記載は要約していない）。",
        financialView: { ok: !!result.ok, facts: result.facts ?? [], toCheck: result.toCheck ?? [], conditions: result.conditions ?? [], failReason: result.failReason },
      });
      setEdinetSkipped(true);
    } catch(e: any) {
      alert(friendlyError(e.message));
    } finally {
      setPdfLoading(false);
    }
  };
  const handleFetchDocument = async (docID?: string) => {
    if (!docID) return;
    setDocLoading(true); setDocData(null); setJudgeData(null);
    try {
      const json = await fetchJson<EdinetDocResponse>("/api/edinet-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docID }) });
      setDocData(json);
    } catch (e: any) { setDocData({ error: friendlyError(e?.message || "決算資料の要約に失敗しました。") }); }
    finally { setDocLoading(false); }
  };
  const handleFinalJudge = async () => {
    if (!data?.extracted || !docData?.summary) return;
    setJudgeLoading(true); setJudgeData(null);
    const steps: Step[] = [
      { label: "口コミデータを整理中", done: false, active: true },
      { label: "決算資料と照合中", done: false, active: false },
      { label: "確認ポイントを整理中", done: false, active: false },
    ];
    setJudgeSteps([...steps]);
    try {
      steps[0] = { ...steps[0], done: true, active: false }; steps[1] = { ...steps[1], active: true }; setJudgeSteps([...steps]);
      const json = await fetchJson<FinalJudgeResponse>("/api/final-judge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extracted: data.extracted, irSummary: docData.summary, financialView: docData.financialView }) });
      steps[1] = { ...steps[1], done: true, active: false }; steps[2] = { ...steps[2], active: true }; setJudgeSteps([...steps]);
      await new Promise(r => setTimeout(r, 400));
      steps[2] = { ...steps[2], done: true, active: false }; setJudgeSteps([...steps]);
      setJudgeData(json);
    } catch (e: any) { setJudgeData({ error: friendlyError(e?.message || "最終判定に失敗しました。") }); setJudgeSteps([]); }
    finally { setJudgeLoading(false); }
  };
  const handleSave = async () => {
    if (!data?.extracted || !judgeData?.finalJudge) return;
    setSaveLoading(true); setSaveMessage("");
    try {
      const json = await fetchJson<{ saved?: boolean; error?: string }>("/api/save-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName: data?.extracted?.companyName ?? null, extracted: data.extracted, irSummary: docData?.summary ?? null, finalJudge: judgeData.finalJudge }) });
      setSaveMessage(json.saved ? "保存しました！" : json.error || "保存に失敗しました。");
    } catch (e: any) { setSaveMessage(friendlyError(e?.message || "保存に失敗しました。")); }
    finally { setSaveLoading(false); }
  };

  return (
    <>
      {phase === "splash" && <Splash />}
      {phase === "terms" && (
        <TermsModal
          onAgree={handleAgreeTerms}
          buttonText={isFirstVisit ? "次へ" : "閉じる"}
          requireScroll={isFirstVisit}
        />
      )}
      {phase === "privacy" && <PrivacyModal onAgree={handleAgreePrivacy} isFirstVisit={isFirstVisit} />}
      {phase === "tutorial" && <Tutorial onClose={handleCloseTutorial} />}
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "16px 12px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <img src="/app-icon.png" alt="icon" style={{ width: 36, height: 36, borderRadius: 8, marginRight: 8 }} /><h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 2px" }}>ホワイト企業ナビ</h1>
              <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>口コミ情報と決算資料をもとに<br/>企業を分析する転職支援ツール</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>provided by 合同会社リベルダード</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setPhase("tutorial")} style={{ fontSize: 14, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>使い方</button>
                <Link href="/history" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>履歴 →</Link>
              </div>
              {user ? (
                <button onClick={handleLogout} style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>ログアウト</button>
              ) : (
                <Link href="/login" style={{ fontSize: 12, color: "#1d4ed8", textDecoration: "underline" }}>ログイン / 新規登録</Link>
              )}
            </div>
          </div>
        </div>
        {!user && (
          <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 12, lineHeight: 1.7, color: "#1e3a8a" }}>
            メールアドレスでログインすると、診断結果を保存して、あとから履歴で見返せます。分析の前にログインしてください。{" "}
            <Link href="/login" style={{ color: "#1d4ed8", fontWeight: 600 }}>ログイン / 新規登録 →</Link>
          </div>
        )}
        <div style={card}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>① 企業名（正式名称）</label>
          <input type="text" value={companyInput} onChange={e => setCompanyInput(e.target.value.slice(0, 60))} placeholder="例: 株式会社ABCD" style={{ width: "100%", boxSizing: "border-box", padding: "12px", fontSize: 16, border: "1px solid #cbd5e1", borderRadius: 10, marginBottom: 4 }} />
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 16px", lineHeight: 1.6 }}>「株式会社」などを含む正式名称を、OpenWorkのページからコピーして貼り付けてください。決算資料の検索に使います。入力した企業名と、画像の企業が同じかご確認ください。</p>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>② OpenWorkのスクリーンショット</label>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px", lineHeight: 1.6 }}>「社員による会社評価」のレーダーチャート（8項目の数値）が、すべて入るように撮影してください。</p>
          <details style={{ marginBottom: 12 }}>
            <summary style={{ fontSize: 12, color: "#1d4ed8", cursor: "pointer" }}>撮り方の例を見る</summary>
            <ExampleShot />
          </details>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChange} style={{ display: "none" }} />
          <div onClick={() => inputRef.current?.click()} style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "28px 16px", textAlign: "center", cursor: "pointer", backgroundColor: preview ? "#f1f5f9" : "#f8fafc" }}>
            {preview ? (
              <img src={preview} alt="プレビュー" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "contain" }} />
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>タップして画像を選択</p>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, marginBottom: 0 }}>PNG / JPEG / WebP・5MB以内</p>
              </>
            )}
          </div>
          {file && <div style={{ marginTop: 8 }}><button onClick={() => { setFile(null); setPreview(null); setData(null); setEdinetData(null); setJudgeData(null); if (inputRef.current) inputRef.current.value = ""; }} style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", cursor: "pointer", width: "100%" }}>🔄 やり直す</button></div>}
    {file && <div style={{ marginTop: 8 }}><button onClick={handleAnalyze} disabled={loading || companyInput.trim().length < 2} style={btn("#1d4ed8", loading || companyInput.trim().length < 2)}>{loading ? "解析中..." : companyInput.trim().length < 2 ? "企業名を入力してください" : "このスクリーンショットを分析する"}</button></div>}
          {loading && analyzeSteps.length > 0 && <StepProgress steps={analyzeSteps} />}
        </div>
        {data?.error && (
          <div style={{ ...card, backgroundColor: "#fef2f2" }}>
            {data.error === "GUEST_LIMIT" ? (
              <>
                <p style={{ color: "#dc2626", fontSize: 14, margin: "0 0 12px" }}>⚠️ ゲストの無料利用は1日3回までです。ログインすると無制限でご利用いただけます。</p>
                <a href="/login" style={{ display: "block", textAlign: "center", backgroundColor: "#0f172a", color: "#fff", padding: "12px", borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>ログイン / 新規登録する</a>
              </>
            ) : (
              <>
                <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>⚠️ {data.error}</p>
                {data.error.includes("混雑") && <button onClick={handleAnalyze} style={{ ...btn("#dc2626"), marginTop: 12 }}>再試行する</button>}
              </>
            )}
          </div>
        )}
        {data?.extracted && (
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>口コミ画像から読み取れた情報</h2>
            {(() => {
              const e = data.extracted!;
              const row = (label: string, value: string) => (
                <div style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  <span style={{ marginLeft: 8, color: "#0f172a" }}>{value}</span>
                </div>
              );
              return (
                <div>
                  {e.companyName && row("企業名", e.companyName)}
                  {e.overallScore !== null && row("総合評価", String(e.overallScore))}
                  {e.reviewCount !== null && row("回答者数", `${e.reviewCount.toLocaleString("ja-JP")}人`)}
                  {e.asOf && row("集計・投稿時点", e.asOf)}
                  {e.rankText && row("順位の表記", e.rankText)}
                  {e.overtimeHours !== null && row("残業時間", `${e.overtimeHours.toFixed(1)}時間`)}
                  {e.paidLeaveRate !== null && row("有給休暇消化率", `${e.paidLeaveRate.toFixed(1)}%`)}
                  {e.itemScores.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>項目別評価</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
                        {e.itemScores.map((it, i) => <li key={i}>{it.label}　{it.score.toFixed(1)}</li>)}
                      </ul>
                    </div>
                  )}
                  {e.unreadable.length > 0 && (
                    <div style={{ marginBottom: 4, padding: "10px 12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>読み取れなかった項目</div>
                      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>{e.unreadable.join("、")}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, marginTop: 4 }}>画像に写っていない項目です。</div>
                    </div>
                  )}
                </div>
              );
            })()}
            {data.extracted?.companyName && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={handleSearchEdinet} disabled={edinetLoading} style={btn("#1d4ed8", edinetLoading)}>{edinetLoading ? "決算資料を検索中..." : `「${data.extracted.companyName}」の決算資料を探す`}</button>
                <button onClick={handleSkipEdinet} style={btn("#64748b")}>非上場・決算資料なしで確認ポイントを整理する</button>
            <div style={{ marginTop: 8, padding: "12px", backgroundColor: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 8px" }}>📄 非上場企業の決算書PDFから数値を取り出す</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 10px", lineHeight: 1.6 }}>PDFは解析後即時削除されます。機密情報のアップロードは自己責任でお願いします。</p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfConsent} onChange={e => setPdfConsent(e.target.checked)} />
                <span style={{ fontSize: 12, color: "#64748b" }}>上記に同意してPDFをアップロードします</span>
              </label>
              {pdfConsent && (
                <div>
                  <input type="file" accept="application/pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} style={{ fontSize: 12, marginBottom: 8, width: "100%" }} />
                  {pdfFile && <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>📎 {pdfFile.name}（{(pdfFile.size/1024/1024).toFixed(1)}MB）</p>}
                  <button onClick={handlePdfAnalyze} disabled={!pdfFile || pdfLoading} style={btn("#0891b2", !pdfFile || pdfLoading)}>{pdfLoading ? "読み取り中..." : "このPDFから数値を取り出す"}</button>
                </div>
              )}
            </div>
              </div>
            )}
          </div>
        )}
        {edinetData?.error && (
          <div style={{ ...card, backgroundColor: "#fef2f2" }}>
            <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>⚠️ {edinetData.error}</p>
          </div>
        )}
        {edinetData?.candidates && (
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>決算資料の候補（{edinetData.count}件）</h2>
            {edinetData.warning && <p style={{ fontSize: 12, color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px", lineHeight: 1.6 }}>{edinetData.warning}</p>}
            {edinetData.candidates.length === 0 ? (
              <>
                <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#92400e", margin: "0 0 4px" }}>📋 EDINETに決算資料が見つかりませんでした。</p>
                  <p style={{ fontSize: 13, color: "#78350f", margin: 0, lineHeight: 1.6 }}>この企業は非上場の可能性があります。決算書PDFをお持ちの場合は、下のPDFアップロード欄からアップロードすると、数値を取り出せます。</p>
                </div>
                <button onClick={handleSkipEdinet} style={btn("#64748b")}>決算資料なしで確認ポイントを整理する</button>
              </>
            ) : (
              edinetData.candidates.map((c, i) => (
                <div key={`${c.docID}-${i}`} style={{ paddingTop: 12, paddingBottom: 12, borderBottom: i < edinetData.candidates!.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 2px" }}>{c.filerName || "名称不明"}</p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>{c.docDescription}　提出日 {c.submitDateTime?.slice(0, 10)}</p>
                  <button onClick={() => handleFetchDocument(c.docID)} disabled={docLoading} style={btn("#1d4ed8", docLoading)}>{docLoading ? "要約中..." : "この決算資料を要約する"}</button>
                </div>
              ))
            )}
          </div>
        )}
        {edinetSkipped && <div style={{ ...card, backgroundColor: "#f8fafc" }}><p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>ℹ️ 決算資料なしで確認ポイントを整理します（非上場・EDINET未対応企業）</p></div>}
        {docData?.error && !edinetSkipped && <div style={{ ...card, backgroundColor: "#fef2f2" }}><p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>⚠️ {docData.error}</p></div>}
        {docData?.summary && (
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>決算資料の要約</h2>
            <SummaryText text={docData.summary} />
            <div style={{ marginTop: 12 }}>
              <button onClick={handleFinalJudge} disabled={judgeLoading} style={btn("#1d4ed8", judgeLoading)}>{judgeLoading ? "整理中..." : "確認ポイントを整理する"}</button>
            </div>
            {judgeLoading && judgeSteps.length > 0 && <StepProgress steps={judgeSteps} />}
          </div>
        )}
        {judgeData?.error && (
          <div style={{ ...card, backgroundColor: "#fef2f2" }}>
            <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>⚠️ {judgeData.error}</p>
            {judgeData.error.includes("混雑") && <button onClick={handleFinalJudge} style={{ ...btn("#dc2626"), marginTop: 12 }}>再試行する</button>}
          </div>
        )}
        {judgeData?.finalJudge && (
          <div style={{ ...card, backgroundColor: "#f0fdf4" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>応募前の確認ポイント</h2>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>口コミ画像と決算資料から読み取れた範囲の整理です。企業の良し悪しを判定するものではありません。</p>
            <ConfirmedBlock items={judgeData.finalJudge.confirmed} conditions={judgeData.finalJudge.financialConditions} />
            <SectionDivider />
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>🔍 追加で確認したいこと</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>{judgeData.finalJudge.toCheck.map((it, i) => <li key={i}>{it.text}{it.basis && <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>理由: {it.basis}</span>}</li>)}</ul>
            <SectionDivider />
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>💬 面接での質問例</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>{judgeData.finalJudge.questions.map((it, i) => <li key={i}>{it.question}{it.basis && <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>基づく情報: {it.basis}</span>}</li>)}</ul>
            {user ? (
              <button onClick={handleSave} disabled={saveLoading} style={btn("#1d4ed8", saveLoading)}>{saveLoading ? "保存中..." : "この診断を保存する"}</button>
            ) : (
              <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", fontSize: 12, lineHeight: 1.7, color: "#1e3a8a" }}>
                ログインしていないため、この診断は保存できません。ログインしてから分析すると、結果を保存して、履歴で見返せます（ログインの手続きの途中で、いま表示している結果は消えます）。{" "}
                <Link href="/login" style={{ color: "#1d4ed8", fontWeight: 600 }}>ログイン / 新規登録 →</Link>
              </div>
            )}
            {saveMessage && <p style={{ marginTop: 10, fontSize: 14, textAlign: "center", color: "#16a34a" }}>{saveMessage}</p>}
            <div style={{ marginTop: 12 }}><button onClick={handleReset} style={{ ...btn("#f1f5f9"), color: "#0f172a" }}>🔄 次の企業を分析する</button></div>
          </div>
        )}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "center", gap: 24 }}>
          <button onClick={() => setPhase("terms")} style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>利用規約</button>
          <button onClick={() => setPhase("privacy")} style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>プライバシーポリシー</button>
        </div>
      </main>
    </>
  );
}
