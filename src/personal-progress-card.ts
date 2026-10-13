import { progressTrace } from "./home-growth.ts";
import { dateLabel } from "./api.ts";

export async function personalProgressCard({
  data,
  rating,
  category,
  period,
  name,
  timezone,
}: {
  data: any;
  rating: any;
  category: string;
  period: string;
  name: string | null;
  timezone: string;
}): Promise<Blob> {
  await Promise.all([
    document.fonts.load("600 100px Barlow"),
    document.fonts.load("600 32px Manrope"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f6ef";
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.fillStyle = "#14372c";
  ctx.fillRect(0, 0, 1080, 420);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#d4e8ab";
  ctx.lineWidth = 2;
  ctx.strokeRect(770, 44, 235, 332);
  ctx.strokeRect(790, 64, 195, 292);
  for (const y of [145, 210, 275]) {
    ctx.beginPath();
    ctx.moveTo(770, y);
    ctx.lineTo(1005, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(888, 64);
  ctx.lineTo(888, 145);
  ctx.moveTo(888, 275);
  ctx.lineTo(888, 356);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#d4e8ab";
  ctx.font = "600 30px Manrope";
  ctx.fillText("SHUTTL. / PERSONAL PROGRESS", 64, 80);
  ctx.font = "500 28px Manrope";
  ctx.fillText(
    category.toUpperCase() +
      " · " +
      (period === "all" ? "CAREER SNAPSHOT" : `LAST ${period} DAYS`),
    64,
    137,
  );
  const title = name || "My progress";
  ctx.font = "600 44px Manrope";
  const fit = (value: string, max: number) => {
    let text = value;
    while (text.length && ctx.measureText(text).width > max)
      text = text.slice(0, -1);
    return text === value ? text : text.slice(0, -1) + "…";
  };
  ctx.fillStyle = "#f5f6ef";
  ctx.fillText(fit(title, 920), 64, 206);
  ctx.font = "600 124px Barlow";
  ctx.fillText(
    rating.score === null ? "BUILDING" : rating.score.toLocaleString("en-SG"),
    64,
    348,
  );
  ctx.font = "500 27px Manrope";
  ctx.fillText(`${rating.status} · ${rating.count} confirmed results`, 64, 392);
  ctx.fillStyle = "#14372c";
  ctx.font = "600 36px Manrope";
  ctx.fillText("The shape of your recorded play", 64, 490);
  const trace = progressTrace(data.trajectory || [], 900, 218, 150);
  ctx.strokeStyle = "#d6ded0";
  ctx.lineWidth = 2;
  for (let i = 0; i < (trace && trace.points.length > 1 ? 3 : 0); i++) {
    ctx.beginPath();
    ctx.moveTo(72, 570 + i * 109);
    ctx.lineTo(1000, 570 + i * 109);
    ctx.stroke();
  }
  ctx.font = "500 25px Manrope";
  ctx.fillStyle = "#365a4a";
  if (trace?.points.length === 1) {
    const reveal = data.trajectory[0].count === 5;
    ctx.font = "600 32px Manrope";
    ctx.fillText(
      reveal ? "Your starting point" : "One point in this period",
      72,
      567,
    );
    ctx.font = "600 96px Barlow";
    ctx.fillText(String(trace.low), 72, 692);
    ctx.font = "500 25px Manrope";
    ctx.fillText(
      reveal
        ? "First published estimate · five confirmed matches"
        : "Recorded estimate after a confirmed match",
      72,
      752,
    );
    ctx.fillText(
      reveal
        ? "Your next confirmed match adds the next point."
        : "Choose a longer period to see more history.",
      72,
      794,
    );
  } else if (trace) {
    ctx.fillText(
      `${trace.low}–${trace.high} · chart scale ${Math.round(trace.scaleLow)}–${Math.round(trace.scaleHigh)}`,
      72,
      544,
    );
    ctx.strokeStyle = "#527d56";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    trace.points.forEach((p, i) =>
      i ? ctx.lineTo(80 + p.x, 570 + p.y) : ctx.moveTo(80 + p.x, 570 + p.y),
    );
    ctx.stroke();
    for (const p of [trace.points[0], trace.points.at(-1)!]) {
      ctx.beginPath();
      ctx.arc(80 + p.x, 570 + p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else
    ctx.fillText(
      "Visible ratings begin after five confirmed matches.",
      72,
      658,
    );
  if (data.count) {
    ctx.fillText(dateLabel(data.firstPlayed, timezone), 72, 839);
    const end = dateLabel(data.lastPlayed, timezone);
    ctx.fillText(end, 1000 - ctx.measureText(end).width, 839);
  }
  const facts = [
    [String(data.count), "confirmed matches"],
    [
      data.count ? `${data.wins}–${data.count - data.wins}` : "—",
      "wins / losses",
    ],
    [
      data.delta === null ? "—" : `${data.delta > 0 ? "+" : ""}${data.delta}`,
      "visible rating change",
    ],
  ];
  facts.forEach(([value, label], i) => {
    const x = 72 + i * 320;
    ctx.font = "600 72px Barlow";
    ctx.fillStyle = "#14372c";
    ctx.fillText(value, x, 968);
    ctx.font = "500 23px Manrope";
    ctx.fillStyle = "#365a4a";
    ctx.fillText(label, x, 1010);
  });
  ctx.fillStyle = "#e7ecdd";
  ctx.fillRect(64, 1060, 952, 164);
  ctx.fillStyle = "#14372c";
  ctx.font = "600 28px Manrope";
  ctx.fillText("Earned on court. Kept in context.", 88, 1108);
  ctx.font = "500 23px Manrope";
  ctx.fillText(
    "One result is evidence, not a verdict. Estimates can change",
    88,
    1154,
  );
  ctx.fillText(
    "after corrections. No points for streaks or checking in.",
    88,
    1187,
  );
  ctx.fillStyle = "#365a4a";
  ctx.font = "500 23px Manrope";
  ctx.fillText(
    data.limited
      ? "Limited published-history snapshot."
      : "Selected period’s published history.",
    72,
    1272,
  );
  ctx.fillText(
    "Your current estimate is shown above; the chart covers the period.",
    72,
    1310,
  );
  ctx.fillText(
    data.demo
      ? "Fictional demo results · personal progress preview"
      : "Personal progress · player-confirmed estimates",
    72,
    1348,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error("This browser could not create your progress card."),
            ),
      "image/png",
    ),
  );
}
