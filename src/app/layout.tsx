import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-main",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Редактор схем персонажей",
  description:
    "Веб-приложение для наглядных схем персонажей: бесконечный холст, карточки, стрелки, изображения. Экспорт в PNG, PDF и рабочий JSON-файл.",
  keywords: ["редактор схем", "персонажи", "карточки", "холст", "схема отношений"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
