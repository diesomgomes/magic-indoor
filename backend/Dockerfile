FROM node:22-alpine

WORKDIR /app

# Instala dependencias primeiro (cache de layer entre builds)
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

# Copia o resto do projeto, mantendo a mesma estrutura relativa que server.js espera
# (index.html/login.html/assets na raiz, backend/src um nivel abaixo)
COPY backend/src ./backend/src
COPY index.html login.html ./
COPY assets ./assets

EXPOSE 3000
WORKDIR /app/backend
CMD ["node", "src/server.js"]
