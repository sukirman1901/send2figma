import { Redis } from "@upstash/redis";

if (!process.env.UPSTASH_REDIS_REST_URL) {
  throw new Error("UPSTASH_REDIS_REST_URL is required");
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const COMMAND_TTL = 120;

export const keys = {
  command: (id: string) => `cmd:${id}`,
  pendingQueue: "pending_commands",
  session: (userId: string) => `session:${userId}`,
  userByApiKey: (key: string) => `user:apikey:${key}`,
  userByExtSecret: (secret: string) => `user:extsecret:${secret}`,
};
