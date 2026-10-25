import { HANDS, type Hand, type PerformanceScore, type ScoreGesture, type ScoreEvent } from './score/types';

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
export type Trigger = { hand: Hand; event: ScoreGesture; index: number };

type FollowingPlan = { trigger: Trigger; events: readonly ScoreEvent[]; index: number; bpm: number; origin: number };
export class Accompaniment {
  private plans: Partial<Record<Hand, FollowingPlan>> = {};
  constructor(private clock: () => number = () => performance.now()) {}
  pendingFor(hand: Hand): boolean { return Boolean(this.plans[hand]); }
  get pending(): boolean { return HANDS.some(hand => Boolean(this.plans[hand])); }
  queue(trigger: Trigger, bpm: number, origin = this.clock()) {
    // A faster next melody press completes the previous accompaniment instead of losing notes.
    const previous = this.plans[trigger.hand];
    const remaining = previous ? previous.events.slice(previous.index).map(event => ({
      trigger: {...previous.trigger, event}, bpm: previous.bpm,
    })) : [];
    delete this.plans[trigger.hand];
    if (trigger.event.following?.length) this.plans[trigger.hand] = {
      trigger, bpm, origin, events: trigger.event.following, index: 0,
    };
    return remaining;
  }
  takeDue(now = this.clock()): {trigger: Trigger; bpm: number; at: number}[] {
    const due: {trigger: Trigger; bpm: number; at: number}[] = [];
    for (const hand of HANDS) {
      const plan = this.plans[hand];
      if (!plan) continue;
      while (plan.index < plan.events.length) {
        const event = plan.events[plan.index];
        const at = plan.origin + (event.beat - plan.trigger.event.beat) * 60000 / plan.bpm;
        if (at > now) break;
        due.push({trigger: {...plan.trigger, event}, bpm: plan.bpm, at});
        plan.index++;
      }
      if (plan.index === plan.events.length) delete this.plans[hand];
    }
    return due.sort((a, b) => a.at - b.at);
  }
  clear() { this.plans = {}; }
}

export class Performance {
  private indices: Record<Hand, number> = { left: 0, right: 0 };
  private held = new Set<string>();
  private last: Record<Hand, number> = { left: -Infinity, right: -Infinity };
  constructor(readonly score: PerformanceScore, private clock: () => number = () => performance.now(), readonly chordWindow = 45) {}
  snapshot(): Record<Hand, number> { return { ...this.indices }; }
  get complete(): boolean { return HANDS.every(h => this.indices[h] >= this.score.hands[h].length); }
  next(hand: Hand): ScoreGesture | undefined { return this.score.hands[hand][this.indices[hand]]; }
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
    for (const h of HANDS) this.seekHand(h, beat);
  }
  seekHand(hand: Hand, beat: number) {
    const i = this.score.hands[hand].findIndex(e => e.beat >= beat - 0.0001);
    this.indices[hand] = i < 0 ? this.score.hands[hand].length : i;
    this.clearInput();
  }
  reset() { this.seek(0); }
}
