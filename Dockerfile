# Nova Merchandising — React Router SSR demo
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/package.json /app/server.js ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
USER node
EXPOSE 3000
# NOVA_DELIVERY_URL/USER/PASSWORD, DEMO_BRANCH and SHOPIFY_* come from the environment (the platform's secrets)
CMD ["npm", "run", "start"]
