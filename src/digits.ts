import type { Element } from "./screen";

/**
 * Large digits for the back display, built from rectangles in units of the stroke width t: a digit is the seven
 * segments of a digital clock, 4t wide and DIGIT_HEIGHT t tall, overlapping at the corners; only the lit ones are drawn.
 */
export const DIGIT_HEIGHT = 11;

/** The lit segments of each digit, 0 to 9. */
const DIGITS = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];
/** Each segment as x, y, width, height in units of t from the top left of its digit. */
const SEGMENTS: Record<string, number[]> = {
  a: [0, 0, 4, 1],
  b: [3, 0, 1, 6],
  c: [3, 5, 1, 6],
  d: [0, 10, 4, 1],
  e: [0, 5, 1, 6],
  f: [0, 0, 1, 6],
  g: [0, 5, 4, 1],
};
/** The strokes of the other characters, the same way; the comma reaches t below the digits. */
const OTHERS: Record<string, number[][]> = {
  ":": [
    [0, 3, 1, 1],
    [0, 7, 1, 1],
  ],
  ",": [[0, 10, 1, 2]],
  "+": [
    [0, 5, 3, 1],
    [1, 4, 1, 3],
  ],
};

/** The strokes of a character, each with a name that stays the same while it is lit. */
function strokes(ch: string): [string, number[]][] {
  if (ch >= "0" && ch <= "9") return [...DIGITS[Number(ch)]].map((s): [string, number[]] => [s, SEGMENTS[s]]);
  return OTHERS[ch].map((rect, i): [string, number[]] => [String(i), rect]);
}

/** The width of a character in units of t: 4 for a digit. */
function charWidth(ch: string): number {
  return ch >= "0" && ch <= "9" ? 4 : Math.max(...OTHERS[ch].map(([x, , w]) => x + w));
}

/** The width of the text in units of t, with a unit of space between the characters. */
export function bigWidth(text: string): number {
  let width = -1;
  for (const ch of text) width += charWidth(ch) + 1;
  return width;
}

/** The text (digits, ":", ",", "+") in large digits on the back display, its top left at x, y; ids start with `id`. */
export function bigText(id: string, text: string, x: number, y: number, t: number, color: string): Element[] {
  const out: Element[] = [];
  let left = x;
  let i = 0;
  for (const ch of text) {
    for (const [name, [sx, sy, w, h]] of strokes(ch)) {
      out.push({
        id: `${id}${i}${name}`,
        type: "rectangle",
        x: left + sx * t,
        y: y + sy * t,
        width: w * t,
        height: h * t,
        fill: "solid",
        fill_colors: [color],
        border_width: 0,
        display: "back",
      });
    }
    left += (charWidth(ch) + 1) * t;
    i += 1;
  }
  return out;
}
