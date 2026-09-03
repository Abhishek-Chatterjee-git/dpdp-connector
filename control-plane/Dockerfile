FROM node:24-alpine
WORKDIR /app

# Copy root and package manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY control-plane/package.json ./control-plane/

RUN npm install

# Copy source code
COPY shared ./shared
COPY control-plane ./control-plane

# Build shared & control-plane
RUN npm --workspace=shared run build
RUN npm --workspace=control-plane run build

EXPOSE 4000
CMD ["node", "--experimental-sqlite", "control-plane/dist/index.js"]
