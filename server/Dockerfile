FROM node:22-alpine
WORKDIR /app
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev
COPY . .
WORKDIR /app/server
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
