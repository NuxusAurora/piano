import { HANDS, type Score, type ScoreEvent, type ScoreGesture, type PerformanceScore } from './types';

// One gesture per notated beat, including silent beats and sustained-note tails.
export function beatGestures(events: readonly ScoreEvent[], beatLength: number): ScoreGesture[] {
  let end = 0;
  for (const event of events) for (const note of event.notes) end = Math.max(end, event.beat + note.beats);
  const count = events.length ? Math.max(1, Math.ceil(end / beatLength - 1e-9)) : 0;
  const result: (ScoreGesture & {following?: ScoreEvent[]})[] = Array.from({length: count}, (_, i) => ({beat: i * beatLength, notes: []}));
  for (const event of events) {
    const index = Math.min(count - 1, Math.floor((event.beat + 1e-7) / beatLength));
    const step = result[index], copy = {beat: event.beat, notes: event.notes.map(note => ({...note}))};
    if (Math.abs(event.beat - step.beat) < 1e-7) step.notes.push(...copy.notes);
    else {
      if (!step.following) step.following = [];
      step.following.push(copy);
    }
  }
  return result;
}

export function beatScore(score: Score): PerformanceScore {
  const hands = {} as PerformanceScore['hands'];
  for (const hand of HANDS) hands[hand] = beatGestures(score.hands[hand], 4 / score.timeSignature[1]);
  return {...score, timeSignature: [...score.timeSignature], hands};
}
