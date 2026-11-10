FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY data.mjs providers.mjs exchange.mjs gemini.mjs guidance.mjs insights.mjs news.mjs pdf.mjs server.mjs ./
COPY public ./public
COPY config ./config
COPY scripts/pdf_text.py ./scripts/pdf_text.py
COPY docker-entrypoint.sh ./
ENV HOST=0.0.0.0 PORT=4173 FINN_DB=/data/finn.sqlite
EXPOSE 4173
ENTRYPOINT ["sh","/app/docker-entrypoint.sh"]
CMD ["node","server.mjs"]
