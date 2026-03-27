import Redis from "ioredis";

function createRedis(): Redis {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new Redis(url, {
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
  }

  return new Redis({
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });
}

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis = globalForRedis.redis ?? createRedis();

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err);
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
