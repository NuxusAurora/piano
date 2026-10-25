import { HANDS, type Score, type ScoreEvent, type ScoreGesture, type PerformanceScore } from './types';
import {pulseAtOrAfter} from './meter';

// One gesture per notated beat, including silent beats and sustained-note tails.
export function beatGestures(events: readonly ScoreEvent[], timing: number|Score): ScoreGesture[] {
  if(typeof timing==='number'&&(!Number.isFinite(timing)||timing<=0))throw new Error('每拍时长必须大于 0');
  let end = 0;
  for (const event of events) for (const note of event.notes) end = Math.max(end, event.beat + note.beats);
  const result: (ScoreGesture & {following?: ScoreEvent[]})[] = [];
  for(let beat=0;events.length&&(!result.length||beat<end-1e-9);){
    result.push({beat,notes:[]});
    beat=typeof timing==='number'?result.length*timing:pulseAtOrAfter(timing,beat).nextBeat;
  }
  let index=0;
  for (const event of events) {
    while(index+1<result.length&&result[index+1].beat<=event.beat+1e-7)index++;
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
  for (const hand of HANDS) hands[hand] = beatGestures(score.hands[hand], score);
  return {...score, timeSignature: [...score.timeSignature], ...(score.meterChanges?{meterChanges:score.meterChanges.map(c=>({beat:c.beat,timeSignature:[...c.timeSignature]}))}:{}), hands};
}
