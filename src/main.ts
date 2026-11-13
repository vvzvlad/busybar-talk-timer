import { createScreen, type Element } from "./screen";
import manifest from "./appmeta/manifest.json";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

/** Length of a talk before the wheel changes it, minutes. */
const DEFAULT_MINUTES = 10;
const MIN_MINUTES = 1;
const MAX_MINUTES = 99;

/** The band turns yellow and then red when this much time is left. */
const YELLOW_MS = 2 * 60 * 1000;
const RED_MS = 60 * 1000;

const GREEN = "#00C000FF";
const YELLOW = "#FFC000FF";
const RED = "#FF0000FF";
const BLACK = "#000000FF";

type Phase = "ready" | "running" | "paused";

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Whole seconds as "mm:ss". */
function clock(seconds: number): string {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** The front display: the time in black digits over a band of the phase's colour, the full 72x16. */
function frame(leftMs: number): Element[] {
  const color = leftMs <= RED_MS ? RED : leftMs <= YELLOW_MS ? YELLOW : GREEN;
  // Before zero the time left, rounded up so that a fresh talk shows its full length; past zero the overtime with a +.
  const text = leftMs > 0 ? clock(Math.ceil(leftMs / 1000)) : `+${clock(Math.floor(-leftMs / 1000))}`;
  return [
    { id: "band", type: "rectangle", x: 0, y: 0, width: 72, height: 16, fill: "solid", fill_colors: [color], border_width: 0, z_index: 1 },
    { id: "time", type: "text", text, font: "extra_large", color: BLACK, x: 36, y: 8, align: "center", z_index: 2 },
  ];
}

/**
 * Entry point, called at the end of the file: the device runs this script from top to bottom and starts nothing by itself.
 */
function main(): void {
  const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);
  const screen = createScreen(APP, report);

  let minutes = DEFAULT_MINUTES;
  let phase: Phase = "ready";
  /** Time left while not running, ms; below zero past the end. */
  let left = minutes * 60 * 1000;
  /** When the time runs out, while running (Date.now() ms). */
  let endAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const remaining = () => (phase === "running" ? endAt - Date.now() : left);
  const draw = () => {
    if (!stopped) screen.draw(frame(remaining()));
  };

  // Clearing a timer that was never set makes the firmware log a warning, so only a pending one is cleared.
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  /** Redraws whenever the shown second changes, while running. */
  function tick(): void {
    timer = undefined;
    if (phase !== "running") return;
    draw();
    const ms = endAt - Date.now();
    // Counting down the shown second changes at each whole second left; past zero at each whole second over.
    const wait = ms > 0 ? ms % 1000 || 1000 : 1000 - (-ms % 1000);
    timer = setTimeout(tick, wait + 5);
  }

  // The listener keeps the app alive; a long Back is handled by the firmware and quits it.
  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "encoder") {
      // The length is set before the start only.
      if (phase !== "ready") return;
      minutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes + event.delta));
      left = minutes * 60 * 1000;
      draw();
    } else if (event.action !== "short") {
      return;
    } else if (event.key === "start") {
      if (phase === "running") {
        left = endAt - Date.now();
        phase = "paused";
        stopTimer();
        draw();
      } else {
        endAt = Date.now() + left;
        phase = "running";
        tick();
      }
    } else if (event.key === "ok") {
      // OK resets a paused talk to the set length.
      if (phase !== "paused") return;
      phase = "ready";
      left = minutes * 60 * 1000;
      draw();
    } else if (event.key === "back") {
      // Back leaves the app: with the timer cleared and the handler detached, nothing keeps it alive.
      stopped = true;
      stopTimer();
      // Not detached from inside the handler itself: the unbind would stop the app while this handler still runs.
      setTimeout(unbind, 0);
    }
  });

  draw();
}

main();
