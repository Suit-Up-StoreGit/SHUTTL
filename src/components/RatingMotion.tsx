import { useEffect, useRef, useState } from "react";
export function RatingMotion({
  before,
  after,
}: {
  before: number | null;
  after: number;
}) {
  const [display, setDisplay] = useState(after),
    [running, setRunning] = useState(false),
    frame = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    setDisplay(after);
    setRunning(false);
    return () => cancelAnimationFrame(frame.current);
  }, [before, after]);
  function replay() {
    if (
      before === null ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(after);
      return;
    }
    cancelAnimationFrame(frame.current);
    setRunning(true);
    const start = performance.now();
    function step(time: number) {
      const fraction = Math.min(1, (time - start) / 600);
      setDisplay(
        Math.round(before! + (after - before!) * (1 - (1 - fraction) ** 3)),
      );
      if (fraction < 1) frame.current = requestAnimationFrame(step);
      else setRunning(false);
    }
    frame.current = requestAnimationFrame(step);
  }
  return (
    <>
      <strong>
        <span className="sr-only">
          Published rating {after.toLocaleString("en")}
        </span>
        <span aria-hidden="true">{display.toLocaleString("en")}</span>
      </strong>
      {before !== null && (
        <button
          className="text-button replay-change"
          disabled={running}
          onClick={replay}
          aria-label="Replay the visible rating change"
        >
          Replay change
        </button>
      )}
    </>
  );
}
