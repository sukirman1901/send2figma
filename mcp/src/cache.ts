import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function cacheRoot(): string {
  return process.env.S2F_MCP_CACHE || join(homedir(), ".send2figma-mcp", "cache");
}

export async function ensureCacheDir(id?: string): Promise<string> {
  const dir = id ? join(cacheRoot(), id) : join(cacheRoot(), randomUUID());
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeBase64File(
  dir: string,
  filename: string,
  base64: string
): Promise<string> {
  const path = join(dir, filename);
  await writeFile(path, Buffer.from(base64, "base64"));
  return path;
}
