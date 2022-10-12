FROM node:18-buster

# Bundle APP files
WORKDIR /app
COPY src ./src
COPY package.json .
COPY pm2.json .
COPY tsconfig.json .

# Install app dependencies
RUN yarn install
ENV NPM_CONFIG_LOGLEVEL warn
RUN apt install -y wget && wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem && apt autoremove -y wget

ENV API_NETWORK main
ENV API_PORT 4000

ENTRYPOINT [ "/app/node_modules/.bin/ts-node", "/app/src/main.ts" ]