"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function btn(color = "#0f172a", disabled = false): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    padding: "13px 20px",
    fontSize: 15,
    fontWeight: 600,
    backgroundColor: disabled ? "#94a3b8" : color,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "center",
    boxSizing: "border-box",
  };
}

export default function PrivacyPage() {
  const router = useRouter();
  const [isAgreed, setIsAgreed] = useState(false);

  useEffect(() => {
    setIsAgreed(!!localStorage.getItem("terms_agreed"));
  }, []);

  const handleAgree = () => {
    localStorage.setItem("terms_agreed", "true");
    router.push("/");
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 0 40px" }}>
      <div style={{ position: "sticky", top: 0, backgroundColor: "#fff", borderBottom: "1px solid #f1f5f9", padding: "16px 20px 12px", zIndex: 10 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>プライバシーポリシー</h1>
        <p style={{ fontSize: 15, color: "#94a3b8", margin: 0 }}>ホワイト企業ナビ</p>
        <p style={{ fontSize: 11, color: "#cbd5e1", margin: "2px 0 0" }}>provided by 合同会社リベルダード</p>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 24px" }}>最終更新日：2026年6月21日</p>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>1. はじめに</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            合同会社リベルダード（以下「運営者」）は、「ホワイト企業ナビ」（以下「本サービス」）をご利用いただくにあたって取得する情報の取り扱いについて、このプライバシーポリシーで説明します。
          </p>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>2. 取得する情報</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 12px" }}>
            本サービスでは、以下の情報を取得します。
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>アカウント情報（登録ユーザーのみ）</p>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 12px", paddingLeft: 20 }}>
            <li>メールアドレス</li>
            <li>パスワード（暗号化して保管します。運営者が平文で確認することはありません）</li>
          </ul>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>利用時に生成される情報</p>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 6px" }}>
            以下の情報は、分析実行時に自動的に生成・保存されます。
          </p>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0, paddingLeft: 20 }}>
            <li>アップロードされた画像から抽出した口コミテキスト・評価スコア</li>
            <li>EDINETから取得した財務情報のサマリー</li>
            <li>AIが生成した総合判定コメント</li>
            <li>ユーザーID（ログイン済みの場合）またはゲスト識別情報</li>
            <li>分析実行日時</li>
          </ul>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>3. 取得しない情報・保存しない情報</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 6px" }}>
            以下の情報は取得・保存しません。
          </p>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0, paddingLeft: 20 }}>
            <li>アップロードされた画像ファイルそのもの（分析後に保持しません）</li>
            <li>氏名・住所・電話番号などの個人を特定できる情報（任意で入力した場合を除く）</li>
            <li>クレジットカード番号などの決済情報（本サービスは現時点で有料課金機能がありません）</li>
          </ul>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>4. 外部サービスへの情報送信</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 12px" }}>
            本サービスでは、以下の外部サービスに情報を送信します。
          </p>

          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>Anthropic（Claude API）</p>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 12px" }}>
            アップロードされた画像と分析リクエストの内容を、Anthropic社（米国）のAI APIに送信します。
            送信された情報はAIによる分析処理に使用されます。
            Anthropic社のプライバシーポリシーは、同社の公式サイト（https://www.anthropic.com）をご参照ください。{"\n"}
            画像データはサーバーに保存されませんが、APIへの送信は行われます。この点をご理解のうえでご利用ください。
          </p>

          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>EDINET（金融庁）</p>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 12px" }}>
            企業名などの検索クエリをEDINET（https://edinet-api.fsa.go.jp）に送信し、有価証券報告書などの公開情報を取得します。個人情報はEDINETには送信しません。
          </p>

          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>Supabase</p>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            分析結果（口コミテキスト・財務サマリー・総合判定・ユーザーID・日時）は、Supabase Inc.（米国）が提供するデータベースサービスに保存されます。
            Supabase社のプライバシーポリシーは、同社の公式サイト（https://supabase.com）をご参照ください。
          </p>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>5. 情報の利用目的</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: "0 0 6px" }}>
            取得した情報は、以下の目的に使用します。
          </p>
          <ul style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0, paddingLeft: 20 }}>
            <li>本サービスの機能提供（分析結果の表示・履歴の管理）</li>
            <li>利用状況の把握とサービス改善</li>
            <li>不正利用の防止</li>
          </ul>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>6. 情報の第三者提供</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            取得した情報を、上記「外部サービスへの情報送信」に記載の事業者以外の第三者に提供することはありません。ただし、法令に基づく要請があった場合はこの限りではありません。
          </p>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>7. 情報の管理・保護</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            分析結果データは、ユーザーごとにアクセス制御（RLS：行レベルセキュリティ）を設定し、他のユーザーが閲覧できないよう管理しています。{"\n"}
            ただし、インターネット経由の通信や外部サービスを使用するシステムである性質上、完全な安全性を保証することはできません。
          </p>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>8. ユーザーの権利</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            ご自身の分析履歴の削除をご希望の場合は、下記お問い合わせ先までご連絡ください。対応できる範囲でお答えします。
          </p>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>9. Cookieとアクセス解析</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            本サービスでは、ログイン状態の維持のためにCookie（クッキー：ブラウザに保存される小さなデータ）を使用することがあります。
          </p>
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>10. プライバシーポリシーの変更</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            本ポリシーは、法令の改正やサービスの変更にともなって改定する場合があります。重要な変更がある場合は、本サービス上でお知らせします。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>お問い合わせ</h2>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", margin: 0 }}>
            個人情報の取り扱いに関するお問い合わせは、下記までご連絡ください。{"\n"}
            合同会社リベルダード{"\n"}
            メール：info@liberdade.sakura.ne.jp
          </p>
        </section>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 20 }}>
          {isAgreed ? (
            <button onClick={() => router.back()} style={btn("#64748b")}>← 戻る</button>
          ) : (
            <button onClick={handleAgree} style={btn("#0f172a")}>同意する</button>
          )}
        </div>
      </div>
    </div>
  );
}
