FROM node:22-slim
WORKDIR /app
COPY . .
RUN test -f /app/public/index.html \
 && test -f /app/public/app.js \
 && test -f /app/public/styles.css \
 && test -f /app/public/assets/estruturas/estrutura-moda.png \
 && test -f /app/public/assets/estruturas/estrutura-bem-estar-decoracao.png \
 && test -f /app/public/assets/estruturas/estrutura-bolsas-sapatos.png \
 && test -f /app/public/assets/estruturas/estrutura-acessorios.png \
 || (echo "ERRO DE BUILD: arquivos essenciais do portal nao foram enviados para a raiz correta do GitHub." && exit 1)
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_ROOT=/storage
EXPOSE 3000
VOLUME ["/storage"]
CMD ["node", "server.js"]
