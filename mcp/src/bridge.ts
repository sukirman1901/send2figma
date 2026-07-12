import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { WebSocketServer, type WebSocket } from "ws";

export type BridgeRequest = {
  id: string;
  type: "req";
  method: string;
  params?: Record<string, unknown>;
};

export type BridgeResponse = {
  id: string;
  type: "res";
  ok: boolean;
  result?: unknown;
  error?: string;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Cursor may restart MCP quickly; free stale listeners from our previous process. */
export function freeStaleMcpPort(port: number) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return;
    for (const pidStr of out.split("\n")) {
      const pid = Number(pidStr);
      if (!pid || pid === process.pid) continue;
      let cmd = "";
      try {
        cmd = execSync(`ps -p ${pid} -o command=`, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        continue;
      }
      if (
        cmd.includes("mcp/dist/index") ||
        cmd.includes("send2figma-web-clone") ||
        cmd.includes("send2figma-mcp")
      ) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* nothing listening */
  }
}

export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private extension: WebSocket | null = null;
  private pending = new Map<string, Pending>();

  constructor(
    private readonly port: number,
    private readonly token: string
  ) {}

  private listenOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
      this.wss = wss;

      const onListening = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        try {
          wss.close();
        } catch {
          /* ignore */
        }
        this.wss = null;
        reject(err);
      };
      const cleanup = () => {
        wss.off("listening", onListening);
        wss.off("error", onError);
      };

      wss.once("listening", onListening);
      wss.once("error", onError);

      wss.on("connection", (ws) => {
        let authed = false;

        ws.on("message", (raw) => {
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(String(raw));
          } catch {
            ws.close(4000, "invalid_json");
            return;
          }

          if (!authed) {
            if (msg.type === "auth" && msg.token === this.token) {
              authed = true;
              if (this.extension && this.extension !== ws) {
                try {
                  this.extension.close(4001, "replaced");
                } catch {
                  /* ignore */
                }
              }
              this.extension = ws;
              ws.send(JSON.stringify({ type: "auth_ok" }));
              return;
            }
            ws.send(JSON.stringify({ type: "auth_fail", error: "invalid_token" }));
            ws.close(4003, "unauthorized");
            return;
          }

          if (msg.type === "res" && typeof msg.id === "string") {
            const p = this.pending.get(msg.id);
            if (!p) return;
            clearTimeout(p.timer);
            this.pending.delete(msg.id);
            if (msg.ok) p.resolve(msg.result);
            else p.reject(new Error(String(msg.error || "bridge_error")));
          }
        });

        ws.on("close", () => {
          if (this.extension === ws) this.extension = null;
        });
      });
    });
  }

  async start(): Promise<void> {
    freeStaleMcpPort(this.port);
    await sleep(200);

    let lastErr: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await this.listenOnce();
        return;
      } catch (err) {
        lastErr = err;
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === "EADDRINUSE") {
          freeStaleMcpPort(this.port);
          await sleep(250 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Failed to bind ws://127.0.0.1:${this.port}`);
  }

  get connected(): boolean {
    return !!(this.extension && this.extension.readyState === 1);
  }

  async request(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 60000
  ): Promise<unknown> {
    if (!this.extension || this.extension.readyState !== 1) {
      throw new Error(
        "Extension not connected. Open Chrome with Send2Figma loaded, set the MCP token in Options, and ensure this MCP server is running."
      );
    }

    const id = randomUUID();
    const payload: BridgeRequest = { id, type: "req", method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge timeout after ${timeoutMs}ms (${method})`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.extension!.send(JSON.stringify(payload));
    });
  }

  async close(): Promise<void> {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("bridge_closed"));
    }
    this.pending.clear();
    if (this.extension) {
      try {
        this.extension.close();
      } catch {
        /* ignore */
      }
      this.extension = null;
    }
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
      this.wss = null;
    });
  }
}
