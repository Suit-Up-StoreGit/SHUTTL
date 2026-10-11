import { workerData, parentPort } from "node:worker_threads";
import { Database } from "./database.ts";
import { Service } from "./service.ts";
import { PushWorker, pushConfiguration, createPushSender } from "./push.ts";
const db = new Database(workerData.path),
  service = new Service(db, workerData.validated);
const config = pushConfiguration(),
  push = new PushWorker(db, config ? createPushSender(config) : null);
let stopping = false;
parentPort!.on("message", async (message) => {
  if (message === "stop") {
    stopping = true;
    clearInterval(timer);
    await push.close().catch(() => {});
    db.close();
    parentPort!.close();
  }
});
const timer = setInterval(() => {
  if (stopping) return;
  try {
    service.work();
    void push
      .work()
      .catch(() =>
        parentPort!.postMessage({ kind: "worker-error", time: Date.now() }),
      );
    parentPort!.postMessage({ kind: "heartbeat", time: Date.now() });
  } catch {
    parentPort!.postMessage({ kind: "worker-error", time: Date.now() });
  }
}, 250);
parentPort!.postMessage({ kind: "ready", time: Date.now() });
