FROM node:22-slim
WORKDIR /app

# Instala as dependencias usadas pelo portal (PDF e e-mail)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copia o restante do portal
COPY . .

RUN test -f /app/public/index.html \
 && test -f /app/public/app.js \
 && test -f /app/public/styles.css \
 && test -f /app/contract-pdf.js \
 && test -f /app/contract-template.txt \
 && test -f /app/public/assets/estruturas/estrutura-moda.png \
 && test -f /app/public/assets/estruturas/estrutura-bem-estar-decoracao.png \
 && test -f /app/public/assets/estruturas/estrutura-bolsas-sapatos.png \
 && test -f /app/public/assets/estruturas/estrutura-acessorios.png \
 || (echo "ERRO DE BUILD: arquivos essenciais do portal nao foram enviados para a raiz correta do GitHub." && exit 1)

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_ROOT=/storage

EXPOSE 8080
VOLUME ["/storage"]

CMD ["node", "server.js"]
