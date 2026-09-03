import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoCoach FE",
  description: "React and Next.js project interview coach"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

