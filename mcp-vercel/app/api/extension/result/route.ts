import { redis, keys } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  if (!token || token !== process.env.EXTENSION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await redis.get<string>(keys.userByExtSecret(token));
  if (!userId) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { commandId, result, error } = await req.json();

  const raw = await redis.get<string>(keys.command(commandId));
  if (!raw) {
    return NextResponse.json({ error: "Command not found" }, { status: 404 });
  }

  const command = JSON.parse(raw);
  
  if (command.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  command.status = error ? "failed" : "completed";
  command.result = result;
  command.error = error;
  
  await redis.set(keys.command(commandId), JSON.stringify(command), {
    ex: 120,
  });

  return NextResponse.json({ success: true });
}
