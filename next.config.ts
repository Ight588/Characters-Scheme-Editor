import type { NextConfig } from "next";

// Базовый путь для GitHub Pages: "/<имя-репозитория>".
// Задаётся переменной окружения NEXT_PUBLIC_BASE_PATH при сборке (см. deploy.sh).
// Для репозиториев вида "<user>.github.io" путь не нужен — переменная пустая.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Статический экспорт: результат сборки — готовая к публикации папка out/
  output: "export",
  trailingSlash: true,
  // next/image без сервера не работает — картинки в приложении и так рисуются на холсте
  images: { unoptimized: true },
  // Пути к ассетам (JS/CSS) должны учитывать префикс репозитория
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
