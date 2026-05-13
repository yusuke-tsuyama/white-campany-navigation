"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

type AnalyzeResponse = {
  extracted?: any;
  result?: { score: number; label: string; reasons: string[] };
  explanation?: string;
  error?: string;
};
type EdinetCandidate = { docID?: string; filerName?: string; secCode?: string; docDescription?: string; submitDateTime?: string; };
type EdinetSearchResponse = { companyName?: string; count?: number; candidates?: EdinetCandidate[]; searchMethod?: string; error?: string; };
type EdinetDocResponse = { docID?: string; sourceFile?: string; summary?: string; error?: string; };
type FinalJudgeResponse = { finalJudge?: { whiteScore: number; confidence: number; summary: string; positives: string[]; risks: string[]; bizQuestions: string[]; bossQuestions: string[]; }; error?: string; };
type Step = { label: string; done: boolean; active: boolean };

const TUTORIAL_STEPS = [
  { icon: "📷", title: "OpenWorkのスクリーンショットをアップロード", desc: "OpenWorkの企業評価ページのスクリーンショットをアップロードしてください。", sample: true },
  { icon: "🤖", title: "AIが数値を解析", desc: "残業時間・有給取得率・総合評価などの数値をAIが自動で読み取り、ホワイト企業度スコアを算出します。" },
  { icon: "📊", title: "決算資料を取得", desc: "上場企業はEDINETから有価証券報告書を自動取得。非上場企業は決算書PDFをアップロードして財務分析できます。" },
  { icon: "⚖️", title: "総合判定", desc: "口コミデータと決算資料を組み合わせて、より精度の高い企業評価を行います。面接で確認すべき質問も生成します。" },
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
本規約は日本法に準拠します。`;


function OpenWorkSampleImage() {
  const center = { x: 160, y: 430 };
  const r = 80;
  const values = [3.1, 3.5, 4.0, 4.1, 4.3, 2.7, 3.9, 3.6];
  const n = values.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, val: number) => ({
    x: center.x + r * (val / 5) * Math.cos(angle(i)),
    y: center.y + r * (val / 5) * Math.sin(angle(i)),
  });
  const gridPts = (ratio: number) =>
    values.map((_, i) => {
      const p = { x: center.x + r * ratio * Math.cos(angle(i)), y: center.y + r * ratio * Math.sin(angle(i)) };
      return `${p.x},${p.y}`;
    }).join(" ");
  const dataPath = values.map((val, i) => {
    const p = pt(i, val);
    return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
  }).join(" ") + "Z";

  return (
    <svg viewBox="0 0 320 310" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <defs>
        <clipPath id="svgClip">
          <rect width="320" height="420"/>
        </clipPath>
      </defs>
      <rect width="320" height="420" fill="#ffffff"/>

      {/* openworkヘッダー（青） */}
      <rect width="320" height="40" fill="#1565c0"/>
      <text x="12" y="26" fontSize="15" fontWeight="bold" fill="white">openwork</text>
      <rect x="230" y="9" width="52" height="22" rx="4" fill="#ffffff" fillOpacity="0.25"/>
      <text x="256" y="24" fontSize="8" fill="white" textAnchor="middle">無料登録</text>

      {/* 検索バー */}
      <rect x="8" y="48" width="304" height="26" rx="5" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1"/>
      <text x="18" y="65" fontSize="10" fill="#94a3b8">社名から検索</text>
      <line x1="0" y1="82" x2="320" y2="82" stroke="#e2e8f0" strokeWidth="1"/>

      {/* 中途採用中バッジ */}
      <rect x="56" y="90" width="60" height="15" rx="3" fill="none" stroke="#94a3b8" strokeWidth="0.8"/>
      <text x="86" y="101" fontSize="7.5" fill="#64748b" textAnchor="middle">中途採用中</text>

      {/* 会社ロゴ */}
      <rect x="12" y="108" width="40" height="40" rx="6" fill="#1565c0"/>
      <text x="32" y="133" fontSize="8.5" fontWeight="bold" fill="white" textAnchor="middle">ABCDE</text>

      {/* 会社名・星評価 */}
      <text x="60" y="124" fontSize="13" fontWeight="bold" fill="#1e293b">株式会社ABCDE</text>
      <text x="60" y="142" fontSize="11" fill="#fbbf24">★★★★☆</text>
      <line x1="0" y1="158" x2="320" y2="158" stroke="#e2e8f0" strokeWidth="1"/>

      {/* タブバー */}
      <rect x="0" y="158" width="320" height="30" fill="#f8fafc"/>
      <text x="30" y="177" fontSize="9" fontWeight="bold" fill="#1565c0" textAnchor="middle">TOP</text>
      <text x="95" y="177" fontSize="9" fill="#94a3b8" textAnchor="middle">社員クチコミ</text>
      <text x="165" y="177" fontSize="9" fill="#94a3b8" textAnchor="middle">年収</text>
      <text x="215" y="177" fontSize="9" fill="#94a3b8" textAnchor="middle">質問</text>
      <text x="270" y="177" fontSize="9" fill="#94a3b8" textAnchor="middle">採用情報</text>
      <line x1="0" y1="188" x2="320" y2="188" stroke="#e2e8f0" strokeWidth="1"/>

      {/* 社員による会社評価 */}
      <text x="160" y="208" fontSize="10" fontWeight="bold" fill="#1e293b" textAnchor="middle">社員による会社評価（1112人）</text>
      <line x1="0" y1="216" x2="320" y2="216" stroke="#e2e8f0" strokeWidth="1"/>

      {/* 総合スコア */}
      <text x="160" y="240" fontSize="11" fill="#fbbf24" textAnchor="middle">★★★★☆  3.75</text>
      <rect x="218" y="226" width="46" height="18" rx="9" fill="none" stroke="#16a34a" strokeWidth="1"/>
      <text x="241" y="239" fontSize="8" fill="#16a34a" textAnchor="middle">上位２%</text>

      {/* 待遇面の満足度 */}
      <text x="160" y="256" fontSize="9" fill="#64748b" textAnchor="middle">待遇面の満足度</text>
      <text x="160" y="270" fontSize="11" fontWeight="bold" fill="#1e293b" textAnchor="middle">3.1</text>

      {/* レーダーチャート（下で見切れる） */}
      <g clipPath="url(#svgClip)">
        {[0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <polygon key={i} points={gridPts(ratio)} fill="none" stroke="#e2e8f0" strokeWidth="0.8"/>
        ))}
        {values.map((_, i) => {
          const p = pt(i, 5);
          return <line key={i} x1={center.x} y1={center.y} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="0.8"/>;
        })}
        <path d={dataPath} fill="rgba(100,160,220,0.2)" stroke="#4a90d9" strokeWidth="1.5"/>
        {values.map((val, i) => {
          const p = pt(i, val);
          return <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#4a90d9"/>;
        })}
      </g>
    </svg>
  );
}

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

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ height: 12, borderRadius: 99, backgroundColor: "#e2e8f0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, backgroundColor: color, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
      <p style={{ textAlign: "right", fontSize: 13, color, marginTop: 4, marginBottom: 0 }}>{score}%</p>
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

function TermsModal({ onAgree }: { onAgree: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
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
          {!scrolled && <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 8, marginTop: 0 }}>下までスクロールすると同意できます</p>}
          <button onClick={onAgree} disabled={!scrolled} style={btn("#0f172a", !scrolled)}>同意してはじめる</button>
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

              <OpenWorkSampleImage />

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
  const [phase, setPhase] = useState<"splash" | "terms" | "tutorial" | "main">("splash");
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
    const timer = setTimeout(() => {
      const agreedTerms = localStorage.getItem("terms_agreed");
      const seenTutorial = localStorage.getItem("tutorial_seen");
      if (!agreedTerms) setPhase("terms");
      else if (!seenTutorial) setPhase("tutorial");
      else setPhase("main");
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  const handleAgreeTerms = () => {
    localStorage.setItem("terms_agreed", "1");
    setPhase(localStorage.getItem("tutorial_seen") ? "main" : "tutorial");
  };
  const handleCloseTutorial = () => { localStorage.setItem("tutorial_seen", "1"); setPhase("main"); };
  const handleReset = () => {
    setFile(null); setPreview(null); setData(null); setEdinetData(null);
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
    if (!file) return;
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
      { label: "AIが数値を読み取り中", done: false, active: false },
      { label: "スコアを計算中", done: false, active: false },
      { label: "根拠を生成中", done: false, active: false },
    ];
    setAnalyzeSteps([...steps]);
    try {
      steps[0] = { ...steps[0], done: true, active: false }; steps[1] = { ...steps[1], active: true }; setAnalyzeSteps([...steps]);
      const formData = new FormData(); formData.append("image", file);
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
  const handleSkipEdinet = () => { setEdinetSkipped(true); setDocData({ summary: "決算資料なし（非上場・EDINET未対応企業）" }); };
  const handlePdfAnalyze = async () => {
    if (!pdfFile || !pdfConsent) return;
    setPdfLoading(true);
    try {
      const fd = new FormData();
      fd.append("pdf", pdfFile);
      const result = await fetchJson<any>("/api/pdf-analyze", { method: "POST", body: fd });
      setPdfData(result);
      setDocData({ summary: `【非上場企業PDF分析】\n企業名: ${result.companyName || "不明"}\n決算期: ${result.fiscalYear || "不明"}\n\n${result.summary || ""}\n\nスコア: ${result.score}/100（${result.label}）\n\n良い点: ${(result.positivePoints || []).join("、")}\n懸念点: ${(result.concerns || []).join("、")}` });
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
    if (!data?.extracted || !data?.result || !docData?.summary) return;
    setJudgeLoading(true); setJudgeData(null);
    const steps: Step[] = [
      { label: "口コミデータを整理中", done: false, active: true },
      { label: "決算資料と照合中", done: false, active: false },
      { label: "総合判定を生成中", done: false, active: false },
    ];
    setJudgeSteps([...steps]);
    try {
      steps[0] = { ...steps[0], done: true, active: false }; steps[1] = { ...steps[1], active: true }; setJudgeSteps([...steps]);
      const json = await fetchJson<FinalJudgeResponse>("/api/final-judge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extracted: data.extracted, scoreResult: data.result, irSummary: docData.summary }) });
      steps[1] = { ...steps[1], done: true, active: false }; steps[2] = { ...steps[2], active: true }; setJudgeSteps([...steps]);
      await new Promise(r => setTimeout(r, 400));
      steps[2] = { ...steps[2], done: true, active: false }; setJudgeSteps([...steps]);
      setJudgeData(json);
    } catch (e: any) { setJudgeData({ error: friendlyError(e?.message || "最終判定に失敗しました。") }); setJudgeSteps([]); }
    finally { setJudgeLoading(false); }
  };
  const handleSave = async () => {
    if (!data?.extracted || !data?.result || !judgeData?.finalJudge) return;
    setSaveLoading(true); setSaveMessage("");
    try {
      const json = await fetchJson<{ saved?: boolean; error?: string }>("/api/save-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName: data?.extracted?.companyName ?? null, extracted: data.extracted, scoreResult: data.result, irSummary: docData?.summary ?? null, finalJudge: judgeData.finalJudge }) });
      setSaveMessage(json.saved ? "保存しました！" : json.error || "保存に失敗しました。");
    } catch (e: any) { setSaveMessage(friendlyError(e?.message || "保存に失敗しました。")); }
    finally { setSaveLoading(false); }
  };

  return (
    <>
      {phase === "splash" && <Splash />}
      {phase === "terms" && <TermsModal onAgree={handleAgreeTerms} />}
      {phase === "tutorial" && <Tutorial onClose={handleCloseTutorial} />}
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "16px 12px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <img src="/app-icon.png" alt="icon" style={{ width: 36, height: 36, borderRadius: 8, marginRight: 8 }} /><h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 2px" }}>ホワイト企業ナビ</h1>
              <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>口コミ情報と決算資料をもとに<br/>企業を分析する転職支援ツール</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>provided by 合同会社リベルダード</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setPhase("tutorial")} style={{ fontSize: 14, color: "#64748b", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>使い方</button>
              <Link href="/history" style={{ fontSize: 13, color: "#64748b", textDecoration: "none" }}>履歴 →</Link>
            </div>
          </div>
        </div>
        <div style={card}>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 0, marginBottom: 12 }}>OpenWorkのスクリーンショットをアップロード<br/><span style={{ fontSize: 12, color: "#94a3b8" }}>会社名・評価スコアが見える範囲で撮影</span></p>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileChange} style={{ display: "none" }} />
          <div onClick={() => inputRef.current?.click()} style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "28px 16px", textAlign: "center", cursor: "pointer", backgroundColor: preview ? "#f1f5f9" : "#f8fafc" }}>
            {preview ? (
              <img src={preview} alt="プレビュー" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "contain" }} />
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>タップして画像を選択</p><p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>会社名・評価スコアが見える範囲で撮影</p>
                <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, marginBottom: 0 }}>PNG / JPEG / WebP・5MB以内</p>
              </>
            )}
          </div>
          {file && <div style={{ marginTop: 8 }}><button onClick={() => { setFile(null); setPreview(null); setData(null); setEdinetData(null); setJudgeData(null); if (inputRef.current) inputRef.current.value = ""; }} style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", cursor: "pointer", width: "100%" }}>🔄 やり直す</button></div>}
    {file && <div style={{ marginTop: 8 }}><button onClick={handleAnalyze} disabled={loading} style={btn("#0f172a", loading)}>{loading ? "解析中..." : "このスクリーンショットを分析する"}</button></div>}
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
        {data?.result && (
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>画像解析結果</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 0, marginBottom: 8 }}>{data.result.label}</p>
            <ScoreBar score={data.result.score} />
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
            {data.explanation?.split("\n").map((line, i) => (
              <p key={i} style={{
                margin: line.startsWith("【") ? "16px 0 4px" : line.startsWith("・") ? "2px 0" : "8px 0",
                fontWeight: line.startsWith("【") ? 700 : 400,
                fontSize: line.startsWith("【") ? 15 : 14,
              }}>
                {line || "\u00A0"}
              </p>
            ))}
          </div>
            {data.extracted?.companyName && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={handleSearchEdinet} disabled={edinetLoading} style={btn("#1d4ed8", edinetLoading)}>{edinetLoading ? "決算資料を検索中..." : `「${data.extracted.companyName}」の決算資料を探す`}</button>
                <button onClick={handleSkipEdinet} style={btn("#64748b")}>非上場・決算資料なしで判定する</button>
            <div style={{ marginTop: 8, padding: "12px", backgroundColor: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 8px" }}>📄 非上場企業の決算書PDFを分析する</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 10px", lineHeight: 1.6 }}>PDFは解析後即時削除されます。機密情報のアップロードは自己責任でお願いします。</p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfConsent} onChange={e => setPdfConsent(e.target.checked)} />
                <span style={{ fontSize: 12, color: "#64748b" }}>上記に同意してPDFをアップロードします</span>
              </label>
              {pdfConsent && (
                <div>
                  <input type="file" accept="application/pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} style={{ fontSize: 12, marginBottom: 8, width: "100%" }} />
                  {pdfFile && <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>📎 {pdfFile.name}（{(pdfFile.size/1024/1024).toFixed(1)}MB）</p>}
                  <button onClick={handlePdfAnalyze} disabled={!pdfFile || pdfLoading} style={btn("#0891b2", !pdfFile || pdfLoading)}>{pdfLoading ? "分析中..." : "このPDFを分析する"}</button>
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
            {edinetData.candidates.length === 0 ? (
              <>
                <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#92400e", margin: "0 0 4px" }}>📋 EDINETに決算資料が見つかりませんでした。</p>
                  <p style={{ fontSize: 13, color: "#78350f", margin: 0, lineHeight: 1.6 }}>この企業は非上場の可能性があります。決算書PDFをお持ちの場合は、下のPDFアップロード欄からアップロードすると財務分析が可能です。</p>
                </div>
                <button onClick={handleSkipEdinet} style={btn("#64748b")}>決算資料なしで判定する</button>
              </>
            ) : (
              edinetData.candidates.map((c, i) => (
                <div key={`${c.docID}-${i}`} style={{ paddingTop: 12, paddingBottom: 12, borderBottom: i < edinetData.candidates!.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 2px" }}>{c.filerName || "名称不明"}</p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>{c.docDescription}　{c.submitDateTime?.slice(0, 10)}</p>
                  <button onClick={() => handleFetchDocument(c.docID)} disabled={docLoading} style={btn("#0891b2", docLoading)}>{docLoading ? "要約中..." : "この決算資料を要約する"}</button>
                </div>
              ))
            )}
          </div>
        )}
        {edinetSkipped && <div style={{ ...card, backgroundColor: "#f8fafc" }}><p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>ℹ️ 決算資料なしで判定します（非上場・EDINET未対応企業）</p></div>}
        {docData?.error && !edinetSkipped && <div style={{ ...card, backgroundColor: "#fef2f2" }}><p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>⚠️ {docData.error}</p></div>}
        {docData?.summary && (
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>決算資料の要約</h2>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: "#334155", whiteSpace: "pre-wrap", marginTop: 0 }}>{docData.summary}</p>
            <div style={{ marginTop: 12 }}>
              <button onClick={handleFinalJudge} disabled={judgeLoading} style={btn("#7c3aed", judgeLoading)}>{judgeLoading ? "最終判定中..." : "口コミ＋決算資料で最終判定する"}</button>
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
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>最終判定</h2>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 0, marginBottom: 4 }}>確信度: {judgeData.finalJudge.confidence}%</p>
            <ScoreBar score={judgeData.finalJudge.whiteScore} />
            <p style={{ fontSize: 14, lineHeight: 1.8, color: "#334155", whiteSpace: "pre-wrap", marginBottom: 16 }}>{judgeData.finalJudge.summary}</p>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 6, marginTop: 0 }}>✅ プラス要素</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>{judgeData.finalJudge.positives.map((item, i) => <li key={i}>{item}</li>)}</ul>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#dc2626", marginBottom: 6, marginTop: 0 }}>⚠️ リスク</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>{judgeData.finalJudge.risks.map((item, i) => <li key={i}>{item}</li>)}</ul>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>💼 財務・事業リスクの確認</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>{judgeData.finalJudge.bizQuestions.map((item, i) => <li key={i}>{item}</li>)}</ul>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>👤 上司・職場環境の見極め</h3>
            <ul style={{ paddingLeft: 18, margin: "0 0 16px", fontSize: 14, lineHeight: 1.8 }}>{judgeData.finalJudge.bossQuestions.map((item, i) => <li key={i}>{item}</li>)}</ul>
            <button onClick={handleSave} disabled={saveLoading} style={btn("#0f172a", saveLoading)}>{saveLoading ? "保存中..." : "この診断を保存する"}</button>
            {saveMessage && <p style={{ marginTop: 10, fontSize: 14, textAlign: "center", color: "#16a34a" }}>{saveMessage}</p>}
            <div style={{ marginTop: 12 }}><button onClick={handleReset} style={{ ...btn("#f1f5f9"), color: "#0f172a" }}>🔄 次の企業を分析する</button></div>
          </div>
        )}
      </main>
    </>
  );
}
