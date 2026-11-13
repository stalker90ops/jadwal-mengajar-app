FROM node:20-bookworm-slim

# openssl dibutuhkan Prisma; build-essential/python tidak perlu (bcrypt punya binary prebuilt)
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Install dependency (termasuk devDependencies: tailwind, typescript, prisma CLI)
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/app.db

# Database SQLite disimpan di volume agar tidak hilang saat container di-update
VOLUME ["/data"]
EXPOSE 3000

# Buat/migrasi tabel otomatis, lalu jalankan aplikasi
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start -- -H 0.0.0.0 -p ${PORT}"]
