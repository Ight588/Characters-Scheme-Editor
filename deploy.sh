#!/usr/bin/env bash
# ============================================================================
# Ручной деплой на GitHub Pages (ветка gh-pages, метод "Deploy from a branch")
#
# Использование:
#   ./deploy.sh <имя-репозитория>     # проектный сайт: https://<user>.github.io/<repo>/
#   ./deploy.sh <user>.github.io      # личный сайт:    https://<user>.github.io/
#   ./deploy.sh                       # имя берётся из git remote origin
#
# Что делает:
#   1. Определяет имя репозитория и вычисляет basePath
#   2. Собирает статический экспорт (next build -> out/)
#   3. Публикует содержимое out/ в ветку gh-pages удалённого репозитория
#
# Перед первым запуском:
#   git remote add origin git@github.com:<user>/<repo>.git
# После деплоя проверьте: Settings -> Pages -> Source = "Deploy from a branch",
# Branch = gh-pages, папка / (root).
# ============================================================================
set -euo pipefail

REPO="${1:-}"

# Если имя не передано — пробуем вытащить из remote origin
if [ -z "$REPO" ]; then
  URL="$(git config --get remote.origin.url || true)"
  if [ -n "$URL" ]; then
    REPO="$(basename "$URL" .git)"
  fi
fi

if [ -z "$REPO" ]; then
  echo "✗ Не удалось определить имя репозитория."
  echo "  Использование: ./deploy.sh <имя-репозитория>"
  echo "  (или задайте remote: git remote add origin git@github.com:<user>/<repo>.git)"
  exit 1
fi

# basePath: пустой только для репозиториев-личных страниц вида <user>.github.io
if [[ "$REPO" == *.github.io ]]; then
  export NEXT_PUBLIC_BASE_PATH=""
  SITE_URL="https://<ваш-аккаунт>.github.io/"
else
  export NEXT_PUBLIC_BASE_PATH="/$REPO"
  SITE_URL="https://<ваш-аккаунт>.github.io/$REPO/"
fi

echo "▶ Репозиторий: $REPO"
echo "▶ basePath: '${NEXT_PUBLIC_BASE_PATH}'"

# Сборка
rm -rf out
bun install
bun run build

[ -f out/index.html ] || { echo "✗ out/index.html не найден — сборка не удалась"; exit 1; }

# Страховка: GitHub не должен обрабатывать Pages через Jekyll
touch out/.nojekyll

REPO_URL="$(git config --get remote.origin.url || true)"
if [ -z "$REPO_URL" ]; then
  echo "⚠ git remote 'origin' не задан — сборка готова в out/, но пушить некуда."
  echo "  Добавьте remote и повторите:"
  echo "    git remote add origin git@github.com:<ваш-аккаунт>/$REPO.git"
  echo "    ./deploy.sh $REPO"
  exit 0
fi

# Публикация: out/ становится отдельным временным git-репозиторием с веткой gh-pages
echo "▶ Публикация в ветку gh-pages → $REPO_URL"
git -C out init -q -b gh-pages
git -C out add -A
git -C out commit -qm "Deploy: $(date -u '+%Y-%m-%d %H:%M UTC')"
git -C out remote add origin "$REPO_URL"
git -C out push -qf origin gh-pages

echo "✅ Готово! Сайт (через 1–2 минуты): $SITE_URL"
echo "   Если сайт не открылся — проверьте Settings → Pages → Source: Deploy from a branch → gh-pages / (root)"
