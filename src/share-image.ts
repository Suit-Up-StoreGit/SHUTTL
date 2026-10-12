import { LEAGUES } from "./domain.ts";

function wrapped(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxLines = 2,
) {
  const words = Array.from(value.matchAll(/\S+\s*/gu), (m) => m[0]);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(line + word).width > width && line) {
      lines.push(line.trim());
      line = "";
    }
    line += word;
    // Unicode-safe wrapping also handles an unbroken long name.
    while (ctx.measureText(line).width > width) {
      let chunk = "";
      for (const char of Array.from(line)) {
        if (ctx.measureText(chunk + char).width > width) break;
        chunk += char;
      }
      lines.push(chunk);
      line = line.slice(chunk.length);
    }
  }
  if (line) lines.push(line.trim());
  lines.slice(0, maxLines).forEach((l, i) => {
    if (i === maxLines - 1 && lines.length > maxLines) {
      while (ctx.measureText(l + "…").width > width)
        l = Array.from(l).slice(0, -1).join("");
      l += "…";
    }
    ctx.fillText(l, x, y + i * lineHeight);
  });
}

export async function ratingImage(payload: any, shape: "story" | "feed") {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = shape === "story" ? 1920 : 1080;
  const ctx = canvas.getContext("2d")!,
    story = shape === "story",
    top = story ? 430 : 225,
    height = story ? 1010 : 545;
  ctx.fillStyle = "#f6f7f2";
  ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.fillStyle = "#14372c";
  ctx.font = "800 46px Manrope";
  ctx.fillText("SHUTTL.", 75, 115);
  ctx.font = "650 24px Manrope";
  ctx.fillStyle = "#52635b";
  ctx.fillText("PLAYER-CONFIRMED / BADMINTON", 75, 165);
  const title =
    payload.template === "best"
      ? "A PERSONAL BEST."
      : payload.template === "reveal"
        ? "MY STARTING POINT."
        : payload.template === "promotion"
          ? "A LEAGUE MILESTONE."
          : "MY GAME. ON RECORD.";
  ctx.fillStyle = "#14372c";
  ctx.font = `700 ${story ? 68 : 34}px Manrope`;
  wrapped(ctx, title, 75, story ? 300 : 205, 930, 84);
  const passportMaterial = ctx.createLinearGradient(
    75,
    top,
    1005,
    top + height,
  );
  passportMaterial.addColorStop(0, "#244a38");
  passportMaterial.addColorStop(0.46, "#14372c");
  passportMaterial.addColorStop(1, "#0e2921");
  ctx.fillStyle = passportMaterial;
  ctx.beginPath();
  ctx.roundRect(75, top, 930, height, 36);
  ctx.fill();
  ctx.strokeStyle = "#d4e8ab38";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(77, top + 2, 926, height - 4, 34);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(75, top, 930, height, 36);
  ctx.clip();
  ctx.strokeStyle = "#bdd1aa";
  ctx.globalAlpha = 0.13;
  ctx.lineWidth = 2;
  ctx.translate(880, top + 160);
  ctx.rotate(0.45);
  ctx.strokeRect(-200, -120, 410, 700);
  ctx.strokeRect(-155, -60, 320, 580);
  ctx.beginPath();
  ctx.moveTo(-200, 230);
  ctx.lineTo(210, 230);
  ctx.moveTo(5, -120);
  ctx.lineTo(5, 580);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#d4e8ab";
  ctx.font = "650 29px Manrope";
  ctx.fillText(payload.category.toUpperCase() + " / RATING", 128, top + 80);
  ctx.fillStyle = "#f4f7ec";
  ctx.font = `600 ${story ? 248 : 210}px Barlow`;
  ctx.fillText(
    Number(payload.score).toLocaleString("en-SG"),
    120,
    top + (story ? 365 : 295),
    650,
  );
  const league = LEAGUES.find((l) => l.name === payload.league);
  const slug = league?.slug;
  if (slug) {
    ctx.save();
    const sealCenterY = top + (story ? 251 : 196);
    const sealLight = ctx.createRadialGradient(
      873,
      sealCenterY,
      18,
      873,
      sealCenterY,
      92,
    );
    sealLight.addColorStop(0, league!.color + "45");
    sealLight.addColorStop(1, league!.color + "00");
    ctx.fillStyle = sealLight;
    ctx.beginPath();
    ctx.arc(873, sealCenterY, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f4f7ec30";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(873, sealCenterY, 74, 0, Math.PI * 2);
    ctx.stroke();
    const gem = new Image();
    gem.src = "/leagues/" + slug + ".svg";
    await new Promise<void>((resolve) => {
      gem.onload = () => resolve();
      gem.onerror = () => resolve();
    });
    if (gem.complete && gem.naturalWidth)
      ctx.drawImage(gem, 812, top + (story ? 190 : 135), 122, 122);
    ctx.restore();
  }
  ctx.font = "650 42px Manrope";
  ctx.fillText(payload.league, 128, top + (story ? 455 : 365));
  ctx.fillStyle = "#c8dab4";
  ctx.font = "500 26px Manrope";
  ctx.fillText(payload.status + " estimate", 128, top + (story ? 525 : 424));
  ctx.strokeStyle = "#668461";
  ctx.beginPath();
  ctx.moveTo(128, top + (story ? 575 : 450));
  ctx.lineTo(950, top + (story ? 575 : 450));
  ctx.stroke();
  ctx.font = "500 25px Manrope";
  ctx.fillText(
    "From confirmed results. Earned on court.",
    128,
    top + (story ? 640 : 480),
  );
  const date = new Intl.DateTimeFormat("en-SG", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(payload.asOf));
  ctx.fillText(
    (payload.template && payload.template !== "passport"
      ? "Match played / "
      : "Snapshot / ") +
      date +
      " UTC",
    128,
    top + (story ? 688 : 520),
  );
  if (story) {
    ctx.font = "650 36px Manrope";
    ctx.fillStyle = "#f4f7ec";
    wrapped(
      ctx,
      payload.name || "A number worth earning.",
      128,
      top + 790,
      815,
      48,
    );
    ctx.font = "500 25px Manrope";
    ctx.fillStyle = "#c8dab4";
    if (payload.district)
      wrapped(
        ctx,
        payload.district + " · declared district",
        128,
        top + 905,
        815,
        34,
      );
  }
  ctx.fillStyle = "#14372c";
  ctx.font = "600 30px Manrope";
  if (!story && payload.name) wrapped(ctx, payload.name, 75, 824, 930, 38, 1);
  const footer = story ? 1575 : payload.name ? 879 : 870;
  ctx.font = "600 28px Manrope";
  wrapped(
    ctx,
    payload.template === "reveal"
      ? "Five results. A starting point, not a finish line."
      : payload.template === "best"
        ? "Your highest visible estimate in this category."
        : payload.template === "promotion"
          ? `${payload.previousLeague} → ${payload.league}. Earned through confirmed play.`
          : "Play. Confirm. See your progress.",
    75,
    footer,
    930,
    40,
  );
  ctx.font = "500 22px Manrope";
  ctx.fillStyle = "#52635b";
  wrapped(
    ctx,
    "A dated estimate, not a certified skill level or a whole-neighbourhood ranking.",
    75,
    footer + 82,
    930,
    32,
  );
  if (payload.title) {
    ctx.font = "600 23px Manrope";
    const eligibility = `${payload.title.eligible.toLocaleString("en")} eligible players`;
    const eligibilityWidth = ctx.measureText(eligibility).width;
    const titleY = story ? 1760 : 1034;
    wrapped(
      ctx,
      payload.title.label + " · " + payload.title.pool,
      75,
      titleY,
      930 - eligibilityWidth - 28,
      30,
      1,
    );
    ctx.fillText(eligibility, 1005 - eligibilityWidth, titleY);
  }
  if (story) {
    ctx.font = "750 25px Manrope";
    ctx.fillText("YOUR COURT. YOUR STORY.", 75, 1835);
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Image could not be created.")),
      "image/png",
    ),
  );
}
