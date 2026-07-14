import { redis, keys, COMMAND_TTL } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  if (!token || token !== process.env.EXTENSION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await redis.get<string>(keys.userByExtSecret(token));
  if (!userId) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  await redis.set(
    keys.session(userId),
    JSON.stringify({
      id: userId,
      userId,
      connectedAt: Date.now(),
      lastPollAt: Date.now(),
      userAgent: req.headers.get("user-agent"),
    }),
    { ex: 300 }
  );

  const commandId = await redis.rpop(keys.pendingQueue);
  if (!commandId) {
    return NextResponse.json({ commands: [] });
  }

  const raw = await redis.get<string>(keys.command(commandId));
  if (!raw) {
    return NextResponse.json({ commands: [] });
  }

  const command = JSON.parse(raw);
  
  if (command.userId !== userId) {
    await redis.lpush(keys.pendingQueue, commandId);
    return NextResponse.json({ commands: [] });
  }

  command.status = "executing";
  await redis.set(keys.command(commandId), JSON.stringify(command), {
    ex: COMMAND_TTL,
  });

  return NextResponse.json({ commands: [command] });
}
