import webpush from "web-push";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const subject = process.argv[2] || "";
if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject))
  throw new Error(
    "Provide your real notification contact as a mailto address or HTTPS URL.",
  );
const path = resolve("data/vapid.env");
if (existsSync(path))
  throw new Error(
    "The private VAPID configuration already exists. Keep the existing keys for subscribed devices.",
  );
mkdirSync(resolve("data"), { recursive: true });
const keys = webpush.generateVAPIDKeys();
writeFileSync(
  path,
  `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=${subject}\n`,
  { mode: 0o600 },
);
console.log(
  "Private notification configuration saved under data/vapid.env. Load it on your trusted host. Keys were not printed.",
);
