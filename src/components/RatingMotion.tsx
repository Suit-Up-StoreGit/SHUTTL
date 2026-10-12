import { useEffect, useId, useRef, useState } from "react";

const motionQuery = "(prefers-reduced-motion: reduce)";
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(motionQuery).matches;

export function RatingMotion({
  before,
  after,
}: {
  before: number | null;
  after: number;
}) {
  const [motion, setMotion] = useState({
    before,
    after,
    value: after,
    running: false,
  });
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const frame = useRef(0);
  const preferenceId = useId();
  // A refreshed published value appears immediately, even before effect cleanup.
  const current = motion.before === before && motion.after === after;
  const display = current ? motion.value : after;
  const running = current && motion.running;
  const hasVisibleChange = before !== null && before !== after;

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    setMotion({ before, after, value: after, running: false });
    return () => cancelAnimationFrame(frame.current);
  }, [before, after]);

  useEffect(() => {
    const preference = window.matchMedia(motionQuery);
    function changed() {
      setReducedMotion(preference.matches);
      if (preference.matches) {
        cancelAnimationFrame(frame.current);
        setMotion({ before, after, value: after, running: false });
      }
    }
    changed();
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, [before, after]);

  function replay() {
    if (!hasVisibleChange || prefersReducedMotion()) {
      cancelAnimationFrame(frame.current);
      setMotion({ before, after, value: after, running: false });
      return;
    }
    cancelAnimationFrame(frame.current);
    setMotion({ before, after, value: after, running: true });
    const start = performance.now();
    function step(time: number) {
      if (prefersReducedMotion()) {
        setMotion({ before, after, value: after, running: false });
        return;
      }
      const fraction = Math.min(1, (time - start) / 480);
      setMotion({
        before,
        after,
        value: Math.round(
          before! + (after - before!) * (1 - (1 - fraction) ** 3),
        ),
        running: fraction < 1,
      });
      if (fraction < 1) frame.current = requestAnimationFrame(step);
    }
    frame.current = requestAnimationFrame(step);
  }
  return (
    <div
      className="rating-motion"
      data-motion={reducedMotion ? "reduced" : running ? "replaying" : "still"}
    >
      <strong>
        <span className="sr-only">
          Published rating {after.toLocaleString("en")}
        </span>
        <span aria-hidden="true">{display.toLocaleString("en")}</span>
      </strong>
      {hasVisibleChange && (
        <>
          <button
            className="text-button replay-change"
            disabled={running || reducedMotion}
            onClick={replay}
            aria-label="Replay the visible rating change"
            aria-describedby={reducedMotion ? preferenceId : undefined}
          >
            Replay change
          </button>
          {reducedMotion && (
            <span className="motion-preference-label" id={preferenceId}>
              Motion is paused by your device setting.
            </span>
          )}
        </>
      )}
    </div>
  );
}
