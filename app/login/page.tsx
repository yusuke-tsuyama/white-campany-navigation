"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("ログイン用リンクをメールに送りました。");
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        backgroundColor: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          ホワイト企業ナビ
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
          メールアドレスでログイン・新規登録
        </p>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 16,
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        <button
          onClick={handleLogin}
          disabled={!email.trim() || loading}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "14px",
            fontSize: 16,
            fontWeight: 600,
            backgroundColor: loading || !email.trim() ? "#94a3b8" : "#0f172a",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            cursor: loading || !email.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "送信中..." : "ログインリンクを送る"}
        </button>
        {message && (
          <p
            style={{
              marginTop: 16,
              fontSize: 14,
              color: "#0f172a",
              backgroundColor: "#f1f5f9",
              padding: "12px 14px",
              borderRadius: 8,
            }}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
