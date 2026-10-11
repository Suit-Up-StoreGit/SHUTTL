import { Worker } from "node:worker_threads";
export class RatingRunner {
  private worker: Worker | null = null;
  private stopped = false;
  private retries = 0;
  private restart: ReturnType<typeof setTimeout> | null = null;
  status = "starting";
  lastHeartbeat: number | null = null;
  private path: string;
  private validated: boolean;
  constructor(path: string, validated: boolean) {
    this.path = path;
    this.validated = validated;
    this.start();
  }
  private start() {
    if (this.stopped) return;
    const worker = new Worker(new URL("./rating-worker.ts", import.meta.url), {
      workerData: { path: this.path, validated: this.validated },
    });
    this.worker = worker;
    worker.on("message", (message) => {
      this.lastHeartbeat = message.time;
      this.status = message.kind === "worker-error" ? "degraded" : "running";
    });
    worker.on("error", () => {
      this.status = "degraded";
    });
    worker.on("exit", () => {
      if (this.worker === worker) this.worker = null;
      if (this.stopped) return;
      this.status = "degraded";
      if (this.retries++ < 3)
        this.restart = setTimeout(() => this.start(), 2000);
    });
  }
  async close() {
    this.stopped = true;
    if (this.restart) clearTimeout(this.restart);
    const worker = this.worker;
    if (!worker) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        void worker.terminate().finally(resolve);
      }, 10000);
      worker.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      worker.postMessage("stop");
    });
    this.worker = null;
    this.status = "stopped";
  }
}
