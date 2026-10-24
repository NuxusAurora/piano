import { HANDS, type Hand, type Score, type ScoreEvent } from './score/types';

const rows = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];
export const KEY_ROWS = rows;
const boundaries = [6, 5, 4, 4];
export function handForCode(code: string): Hand | null {
  for (let r = 0; r < rows.length; r++) {
    const i = rows[r].indexOf(code);
    if (i !== -1) return i <= boundaries[r] ? 'left' : 'right';
  }
  return null;
}
export function bubbleDuration(beats: number, bpm: number): number { return Math.max(0.01, beats * 60 / bpm * 3); }
export type Trigger = { hand: Hand; event: ScoreEvent; index: number };

export class Performance {
  private indices: Record<Hand, number> = { left: 0, right: 0 };
  private held = new Set<string>();
  private last: Record<Hand, number> = { left: -Infinity, right: -Infinity };
  constructor(readonly score: Score, private clock: () => number = () => performance.now(), readonly chordWindow = 45) {}
  snapshot(): Record<Hand, number> { return { ...this.indices }; }
  get complete(): boolean { return HANDS.every(h => this.indices[h] >= this.score.hands[h].length); }
  next(hand: Hand): ScoreEvent | undefined { return this.score.hands[hand][this.indices[hand]]; }
  press(code: string, repeat = false): Trigger | null {
    const hand = handForCode(code);
    if (!hand || repeat || this.held.has(code)) return null;
    this.held.add(code);
    return this.trigger(hand);
  }
  release(code: string) { this.held.delete(code); }
  trigger(hand: Hand): Trigger | null {
    const now = this.clock();
    if (now - this.last[hand] < this.chordWindow) return null;
    const event = this.next(hand);
    if (!event) return null;
    this.last[hand] = now;
    return this.advance(hand);
  }
  advance(hand: Hand): Trigger | null {
    const event=this.next(hand);
    return event ? {hand,event,index:this.indices[hand]++} : null;
  }
  clearInput() { this.held.clear(); this.last = { left: -Infinity, right: -Infinity }; }
  seek(beat: number) {
    for (const h of HANDS) {
      const i = this.score.hands[h].findIndex(e => e.beat >= beat - 0.0001);
      this.indices[h] = i < 0 ? this.score.hands[h].length : i;
    }
    this.clearInput();
  }
  reset() { this.seek(0); }
}
