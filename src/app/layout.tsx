import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "华启商城",
  description: "湘潭本地批发配送与线上零售商城",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
