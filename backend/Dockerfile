# This stage installs our modules
FROM mhart/alpine-node:12
WORKDIR /app
COPY pnpm-lock.yaml package.json ./

# If you have native dependencies, you'll need extra tools
# RUN apk add --no-cache make gcc g++ python

RUN npm i -g pnpm
RUN pnpm i --prod --frozen-lockfile

# Then we copy over the modules from above onto a `slim` image
FROM mhart/alpine-node:slim-12

# If possible, run your container using `docker run --init`
# Otherwise, you can use `tini`:
# RUN apk add --no-cache tini
# ENTRYPOINT ["/sbin/tini", "--"]

WORKDIR /app
# Copy from the module install stage
COPY --from=0 /app .
COPY . .

HEALTHCHECK --timeout=1s \
  CMD wget -qO- http://localhost:8888/healthcheck || exit 1

CMD ["node", "index.js"]
