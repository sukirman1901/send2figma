import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { redis, keys, COMMAND_TTL } from "@/lib/redis";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { PendingCommand } from "@/lib/types";

async function sendCommand(tool: string, params: Record<string, unknown>) {
  const commandId = randomUUID();
  const command: PendingCommand = {
    id: commandId,
    userId: "current-user",
    tool,
    params,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + COMMAND_TTL * 1000,
  };

  await redis.set(keys.command(commandId), JSON.stringify(command), {
    ex: COMMAND_TTL,
  });
  await redis.lpush(keys.pendingQueue, commandId);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const raw = await redis.get<string>(keys.command(commandId));
    if (!raw) throw new Error("Command expired");
    const updated: PendingCommand = JSON.parse(raw);

    if (updated.status === "completed") {
      await redis.del(keys.command(commandId));
      return updated.result;
    }
    if (updated.status === "failed") {
      await redis.del(keys.command(commandId));
      throw new Error(updated.error || "Command failed");
    }
  }

  await redis.del(keys.command(commandId));
  throw new Error("Command timed out waiting for Chrome extension");
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "inspect_section",
      {
        title: "Inspect Section",
        description: "Deep inspect a DOM section with layout, typography, colors, accessibility, transitions",
        inputSchema: {
          selector: z.string(),
          tabId: z.number().optional(),
          maxChildren: z.number().default(80),
        },
      },
      async ({ selector, tabId, maxChildren }) => {
        return { content: [{ type: "text" as const, text: JSON.stringify(await sendCommand("inspect", { selector, tabId, maxChildren })) }] };
      }
    );

    server.registerTool(
      "capture_screenshot",
      {
        title: "Capture Screenshot",
        description: "Capture PNG screenshot of active tab or element",
        inputSchema: {
          mode: z.enum(["visible", "fullPage", "node"]).default("visible"),
          tabId: z.number().optional(),
          selector: z.string().optional(),
        },
      },
      async ({ mode, tabId, selector }) => {
        return { content: [{ type: "text" as const, text: JSON.stringify(await sendCommand("screenshot", { mode, tabId, selector })) }] };
      }
    );

    server.registerTool(
      "list_tabs",
      {
        title: "List Tabs",
        description: "List all open Chrome tabs",
        inputSchema: {},
      },
      async () => {
        return { content: [{ type: "text" as const, text: JSON.stringify(await sendCommand("list_tabs", {})) }] };
      }
    );

    server.registerTool(
      "extract_tokens",
      {
        title: "Extract Design Tokens",
        description: "Extract design tokens (colors, fonts, spacing) from page",
        inputSchema: {
          tabId: z.number().optional(),
        },
      },
      async ({ tabId }) => {
        return { content: [{ type: "text" as const, text: JSON.stringify(await sendCommand("extract_tokens", { tabId })) }] };
      }
    );

    server.registerTool(
      "get_interaction_css",
      {
        title: "Get Interaction CSS",
        description: "Get :hover/:focus/:active CSS rules",
        inputSchema: {
          selector: z.string(),
          tabId: z.number().optional(),
        },
      },
      async ({ selector, tabId }) => {
        return { content: [{ type: "text" as const, text: JSON.stringify(await sendCommand("interaction_css", { selector, tabId })) }] };
      }
    );

    server.registerTool(
      "bundle_for_recreate",
      {
        title: "Bundle for Recreate",
        description: "Full bundle: inspect + interaction + images + tokens + screenshot",
        inputSchema: {
          selector: z.string(),
          tabId: z.number().optional(),
          framework: z.enum(["next", "react", "html"]).default("next"),
          sectionName: z.string().optional(),
        },
      },
      async ({ selector, tabId, framework, sectionName }) => {
        return { content: [{ type: "text" as const, text: JSON.stringify(await sendCommand("bundle", { selector, tabId, framework, sectionName })) }] };
      }
    );
  },
  { redisUrl: process.env.UPSTASH_REDIS_REST_URL },
  { basePath: "/api", maxDuration: 120 }
);

const verifyToken = async (req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  
  const userId = await redis.get<string>(keys.userByApiKey(bearerToken));
  if (!userId) return undefined;
  
  return {
    token: bearerToken,
    scopes: ["read", "write"],
    clientId: userId,
    extra: { userId },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
