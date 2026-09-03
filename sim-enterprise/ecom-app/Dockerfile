FROM node:24-alpine
WORKDIR /app

# Copy root and package manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY sim-enterprise/ecom-app/package.json ./sim-enterprise/ecom-app/

RUN npm install

# Copy source code
COPY shared ./shared
COPY sim-enterprise/ecom-app ./sim-enterprise/ecom-app

# Build shared & ecom-app
RUN npm --workspace=shared run build
RUN npm --workspace=sim-enterprise/ecom-app run build

EXPOSE 3000
CMD ["node", "--experimental-sqlite", "sim-enterprise/ecom-app/dist/index.js"]
