import { HANDS, type Hand, type Score, type ScoreEvent, type ScoreGesture, type PerformanceScore } from './types';
import { beatGestures } from './beat';

// Merge both original staves into complete gestures without mutating the source.
function mergedOnsets(score: Score): ScoreEvent[] {
  const events = HANDS.flatMap(hand => score.hands[hand]).sort((a, b) => a.beat - b.beat);
  const result: ScoreEvent[] = [];
  for (const event of events) {
    let group = result.at(-1);
    if (!group || Math.abs(group.beat - event.beat) >= 0.0001) {
      group = { beat: event.beat, notes: [] };
      result.push(group);
    }
    for (const note of event.notes) {
      const previous = group.notes.find(n => n.midi === note.midi);
      if (previous) previous.beats = Math.max(previous.beats, note.beats);
      else group.notes.push({ ...note });
    }
  }
  return result;
}

// One press per melody onset. Accompaniment between melody notes follows in time.
// An introductory passage before the first melody note belongs to the first press.
export function fullSong(score: Score): ScoreGesture[] {
  const primary = score.hands.right.length ? score.hands.right : score.hands.left;
  const onsets = mergedOnsets(score);
  const gestures: (ScoreGesture & {following: ScoreEvent[]})[] = primary.map((event, index) => ({
    beat: index === 0 ? Math.min(event.beat, onsets[0].beat) : event.beat, notes: [], following: [],
  }));
  let index = 0;
  for (const event of onsets) {
    while (index + 1 < primary.length && event.beat >= primary[index + 1].beat - 0.0001) index++;
    const gesture = gestures[index];
    if (Math.abs(event.beat - gesture.beat) < 0.0001) gesture.notes = event.notes;
    else gesture.following.push(event);
  }
  return gestures;
}

export function duetScore(left: Score, right: Score, byBeat = false): PerformanceScore {
  return {
    version: 1, title: '双曲独奏', composer: '', bpm: left.bpm,
    timeSignature: [...left.timeSignature],
    ...(left.pickupBeats!==undefined?{pickupBeats:left.pickupBeats}:{}),
    ...(left.meterChanges?{meterChanges:left.meterChanges.map(c=>({beat:c.beat,timeSignature:[...c.timeSignature]}))}:{}),
    hands: {
      left: byBeat ? beatGestures(mergedOnsets(left), left) : fullSong(left),
      right: byBeat ? beatGestures(mergedOnsets(right), right) : fullSong(right),
    },
  };
}

// Translate the next complete-song onset back to the original grand-staff cursors.
export function sourceProgress(score: Score, nextBeat = Infinity): Record<Hand, number> {
  const indices = { left: 0, right: 0 };
  for (const hand of HANDS) {
    const events = score.hands[hand];
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].beat < nextBeat - 0.0001) lo = mid + 1;
      else hi = mid;
    }
    indices[hand] = lo;
  }
  return indices;
}
