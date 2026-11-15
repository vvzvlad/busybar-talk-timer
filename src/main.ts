import { device } from "@shared/device";
import { DIGIT_HEIGHT, bigText, bigWidth } from "./digits";
import { createScreen, type Element } from "./screen";
import { loadValues } from "./settings";
import manifest from "./appmeta/manifest.json";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

const MINUTE_MS = 60 * 1000;

/** Length of a talk before the wheel changes it, minutes: the default of settings.json, for a bar that returns no settings. */
const DEFAULT_MINUTES = 10;
const MIN_MINUTES = 1;
const MAX_MINUTES = 99;

/** The band turns yellow and then red when this many minutes are left: the defaults of settings.json. */
const DEFAULT_YELLOW = 2;
const DEFAULT_RED = 1;

const GREEN = "#00C000FF";
const YELLOW = "#FFC000FF";
const RED = "#FF0000FF";
const BLACK = "#000000FF";
const WHITE = "#FFFFFFFF";

/** The band's colour in each stage of the time left: green, yellow, red, and past zero. */
const BANDS = [GREEN, YELLOW, RED, RED];
/** What a running talk does as it enters yellow, red and past zero: the LED blinks this colour, the sound plays. */
const SIGNALS = [
  { led: YELLOW, sound: "sounds/yellow.snd" },
  { led: RED, sound: "sounds/red.snd" },
  { led: RED, sound: "sounds/zero.snd" },
];

/** The back display without the status bar's 12 px on the right, and the largest stroke of its digits, px. */
const BACK_WIDTH = 148;
const BACK_HEIGHT = 80;
const BACK_STROKE = 6;

type Phase = "ready" | "running" | "paused";
type Settings = { minutes: number; yellowMs: number; redMs: number; sound: boolean };

/** Reads the talk length, the yellow and red thresholds and the sound switch. */
async function loadSettings(): Promise<Settings> {
  const values = (await loadValues()) ?? {};
  const minutes = (key: string, fallback: number) => (typeof values[key] === "number" ? (values[key] as number) : fallback);
  return {
    minutes: minutes("length_min", DEFAULT_MINUTES),
    yellowMs: minutes("yellow_min", DEFAULT_YELLOW) * MINUTE_MS,
    redMs: minutes("red_min", DEFAULT_RED) * MINUTE_MS,
    sound: typeof values.sound === "boolean" ? values.sound : true,
  };
}

/** The stage of the time left: 0 green, 1 yellow, 2 red, 3 past zero. */
function stageOf(leftMs: number, settings: Settings): number {
  return leftMs <= 0 ? 3 : leftMs <= settings.redMs ? 2 : leftMs <= settings.yellowMs ? 1 : 0;
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Whole seconds as "mm:ss". */
function clock(seconds: number): string {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/**
 * The front display: the time in black digits over a band of the phase's colour, the full 72x16. The back display:
 * the same time in white digits as large as fit, for the room or a host behind the bar.
 */
function frame(leftMs: number, settings: Settings): Element[] {
  const color = BANDS[stageOf(leftMs, settings)];
  // Before zero the time left, rounded up so that a fresh talk shows its full length; past zero the overtime with a +.
  const text = leftMs > 0 ? clock(Math.ceil(leftMs / 1000)) : `+${clock(Math.floor(-leftMs / 1000))}`;
  const units = bigWidth(text);
  const t = Math.min(BACK_STROKE, Math.floor(BACK_WIDTH / units));
  return [
    { id: "band", type: "rectangle", x: 0, y: 0, width: 72, height: 16, fill: "solid", fill_colors: [color], border_width: 0, z_index: 1 },
    { id: "time", type: "text", text, font: "extra_large", color: BLACK, x: 36, y: 8, align: "center", z_index: 2 },
    ...bigText("big", text, Math.floor((BACK_WIDTH - units * t) / 2), Math.floor((BACK_HEIGHT - DIGIT_HEIGHT * t) / 2), t, WHITE),
  ];
}

/**
 * Entry point, called at the end of the file: the device runs this script from top to bottom and starts nothing by itself.
 */
function main(): void {
  const report = (err: unknown) => console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);
  const screen = createScreen(APP, report);

  /** Read once, at the start; until then the app draws nothing and takes no input. */
  let settings: Settings | null = null;
  let minutes = DEFAULT_MINUTES;
  let phase: Phase = "ready";
  /** Time left while not running, ms; below zero past the end. */
  let left = minutes * 60 * 1000;
  /** When the time runs out, while running (Date.now() ms). */
  let endAt = 0;
  /** The last stage the talk has signalled; a talk starts at the stage it starts in, so only the stages it enters signal. */
  let signalled = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const remaining = () => (phase === "running" ? endAt - Date.now() : left);
  const draw = (led?: string) => {
    if (!stopped && settings) screen.draw(frame(remaining(), settings), led);
  };

  // Clearing a timer that was never set makes the firmware log a warning, so only a pending one is cleared.
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  /** Redraws whenever the shown second changes, while running; entering yellow, red or overtime blinks and sounds. */
  function tick(): void {
    timer = undefined;
    if (phase !== "running" || !settings) return;
    const ms = endAt - Date.now();
    const stage = stageOf(ms, settings);
    let led: string | undefined;
    if (stage > signalled) {
      signalled = stage;
      led = SIGNALS[stage - 1].led;
      if (settings.sound) void device.AudioPlay({ application_name: APP, path: SIGNALS[stage - 1].sound }).catch(report);
    }
    draw(led);
    // Counting down the shown second changes at each whole second left; past zero at each whole second over.
    const wait = ms > 0 ? ms % 1000 || 1000 : 1000 - (-ms % 1000);
    timer = setTimeout(tick, wait + 5);
  }

  // The listener keeps the app alive; a long Back is handled by the firmware and quits it.
  const unbind = listen("input", (event) => {
    if (stopped || !settings) return;
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
        if (phase === "ready") signalled = stageOf(left, settings);
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

  void loadSettings()
    .then((loaded) => {
      settings = loaded;
      minutes = loaded.minutes;
      left = minutes * MINUTE_MS;
      draw();
    })
    .catch(report);
}

main();
