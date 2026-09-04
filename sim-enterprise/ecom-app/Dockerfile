FROM node:24-alpine
WORKDIR /app

# Copy root and workspace package manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY sim-enterprise/ecom-app/package.json ./sim-enterprise/ecom-app/

RUN npm install

# Copy source code and static web assets
COPY shared ./shared
COPY sim-enterprise/ecom-app ./sim-enterprise/ecom-app

# Build TypeScript to JavaScript
RUN npm --workspace=shared run build
RUN npm --workspace=sim-enterprise/ecom-app run build

# Default environment variables
ENV ECOM_PORT=3000
ENV ADMIN_PORT=3001
ENV DB_PATH=/app/data/enterprise_data.sqlite
ENV NODE_ENV=production

# Expose Customer Storefront (3000) and Enterprise Admin Portal (3001)
EXPOSE 3000 3001

# Persistent database storage mount
VOLUME ["/app/data"]

CMD ["node", "--experimental-sqlite", "sim-enterprise/ecom-app/dist/index.js"]
