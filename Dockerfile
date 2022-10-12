FROM node:18-buster

# Bundle APP files
WORKDIR /app
COPY src .
COPY package.json .
COPY pm2.json .
COPY tsconfig.json .

# Install app dependencies
RUN yarn
ENV NPM_CONFIG_LOGLEVEL warn
RUN apt install -y wget && wget https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem && apt autoremove -y wget
RUN /app/node_modules/.bin/pm2 install typescript
ENV NETWORK main

ENTRYPOINT [ "/app/node_modules/.bin/pm2", "start", "pm2.json", "--only", "scan-api-${NETWORK}" ]
