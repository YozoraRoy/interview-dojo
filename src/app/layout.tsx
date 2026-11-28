import type { Metadata } from "next";
import { TopNav } from "@/components/layout/TopNav.tsx";
import { I18nProvider } from "@/components/providers/I18nProvider.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "interview-dojo — 日文商務／技術模擬面試",
  description: "本地／雲端混搭 AI 日文模擬面試道場",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <I18nProvider>
          <TopNav />
          <main>{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
