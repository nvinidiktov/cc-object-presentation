#!/bin/bash
# ─── Деплой CC Object Presentation на VPS (Ubuntu/Debian) ─────────────────────
set -e

echo ""
echo "=== CC Object Presentation — Установка ==="
echo ""

# 1. Node.js 20 LTS
if ! command -v node &>/dev/null; then
  echo "[1/5] Устанавливаю Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "[1/5] Node.js уже установлен: $(node -v)"
fi

# 2. pnpm
if ! command -v pnpm &>/dev/null; then
  echo "[2/5] Устанавливаю pnpm..."
  npm install -g pnpm@9
else
  echo "[2/5] pnpm уже установлен: $(pnpm -v)"
fi

# 3. Зависимости Puppeteer (Chrome headless)
echo "[3/5] Устанавливаю зависимости для Chrome..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
  libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils wget \
  libxshmfence1 libxss1 2>/dev/null || true

# 4. Зависимости приложения
echo "[4/5] Устанавливаю зависимости приложения..."
cd /opt/cc-presentation
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 5. Собираю клиент
echo "[5/5] Собираю frontend..."
pnpm build

echo ""
echo "=== Установка завершена! ==="
echo ""
echo "Запуск: cd /opt/cc-presentation && pnpm start"
echo "Или через systemd: systemctl start cc-presentation"
echo ""
