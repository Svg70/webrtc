# Dockerfile с использованием NPM для сборки mediasoup
FROM node:20

# 1) Устанавливаем системные зависимости для сборки mediasoup-worker
# Этот шаг не меняется, так как зависимости нужны для C++ компилятора.
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    pkg-config \
    libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2) Копируем манифесты. Вместо pnpm-lock.yaml используем package-lock.json.
# Убедитесь, что у вас есть сгенерированный файл package-lock.json после 'npm install'.
COPY package.json package-lock.json ./

# 3) Устанавливаем зависимости с помощью npm ci.
# 'npm ci' (Clean Install) - это более быстрая и строгая версия 'npm install', идеальная для Docker.
# Она использует package-lock.json для точного воспроизведения зависимостей.
# Переменная заставляет mediasoup собираться из исходников.
ENV npm_config_build_from_source=true
RUN npm ci

# 4) Копируем исходники и собираем приложение
COPY . .
RUN npm run build


# 5) Открываем порт и стартуем в продакшен-режиме
EXPOSE 5001
CMD ["npm", "run", "start:prod"]