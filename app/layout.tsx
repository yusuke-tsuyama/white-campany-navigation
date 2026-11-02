import React from "react";
import type { Metadata } from "next";
import "./globals.css";

const TITLE = "ホワイト企業ナビ";
const DESCRIPTION = "口コミと決算資料から、応募前に確認したいことと面接での質問例を整理します。企業の良し悪しは判定しません。";
const SITE_URL = "https://white-company-navi.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: "/app-icon.png",
    apple: "/app-icon.png",
  },
  // noteなどにURLを貼ったときの表示（カード）に使う
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    type: "website",
    locale: "ja_JP",
    images: [{ url: "/icons/icon-512x512.png", width: 512, height: 512, alt: TITLE }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/icons/icon-512x512.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
