FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY data.mjs providers.mjs pdf.mjs server.mjs ./
COPY public ./public
COPY config ./config
COPY scripts/pdf_text.py ./scripts/pdf_text.py
ENV HOST=0.0.0.0 PORT=4173 FINN_DB=/data/finn.sqlite
USER node
EXPOSE 4173
CMD ["node","server.mjs"]

