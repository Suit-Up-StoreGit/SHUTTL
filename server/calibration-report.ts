import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { calibrationStudy } from "./calibration.ts";
if (!process.argv[2])
  throw new Error(
    "Provide a private JSON dataset and frozen plan. No demo data is substituted.",
  );
const source = readFileSync(process.argv[2], "utf8"),
  { predictions, ...report } = calibrationStudy(JSON.parse(source));
console.log(
  JSON.stringify(
    {
      ...report,
      inputSha256: createHash("sha256").update(source).digest("hex"),
      scope:
        "Aggregate report; raw participant/match references and per-match forecasts are omitted. Declared real-play provenance is not independent verification.",
    },
    null,
    2,
  ),
);
