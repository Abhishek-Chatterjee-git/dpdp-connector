FROM node:24-alpine
WORKDIR /app

# Copy root and package manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY agent/package.json ./agent/

RUN npm install

# Copy source code
COPY shared ./shared
COPY agent ./agent

# Build shared & agent
RUN npm --workspace=shared run build
RUN npm --workspace=agent run build

EXPOSE 5000
CMD ["node", "--experimental-sqlite", "agent/dist/index.js"]
