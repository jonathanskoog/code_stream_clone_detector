FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npx", "ts-node", "monitor.ts"]