import {scoreEnd, type Score, type TimeSignature} from './types';

const epsilon=1e-7;
type MeterScore=Pick<Score,'timeSignature'|'meterChanges'|'pickupBeats'>;
export type Measure={number:number;beat:number;beats:number;timeSignature:TimeSignature;pickup:boolean};
export const measureLength=(signature:TimeSignature)=>signature[0]*4/signature[1];

// Positions and durations are always quarter-note units; only the notation grid changes.
export function measureAt(score:MeterScore, position:number):Measure {
  const beat=Math.max(0,position),pickup=score.pickupBeats??0;
  if(pickup&&beat<pickup-epsilon)return {number:0,beat:0,beats:pickup,timeSignature:score.timeSignature,pickup:true};
  let start=pickup,number=1,signature=score.timeSignature;
  for(const change of score.meterChanges??[]) {
    if(change.beat>beat+epsilon)break;
    number+=Math.round((change.beat-start)/measureLength(signature));
    start=change.beat;signature=change.timeSignature;
  }
  const beats=measureLength(signature),index=Math.max(0,Math.floor((beat-start+epsilon)/beats));
  return {number:number+index,beat:start+index*beats,beats,timeSignature:signature,pickup:false};
}

export function measureCount(score:Score):number {
  return measureAt(score,Math.max(0,scoreEnd(score)-epsilon*2)).number;
}

export function measuresBetween(score:MeterScore,from:number,to:number):Measure[] {
  const result:Measure[]=[];
  let measure=measureAt(score,from);
  while(measure.beat<to-epsilon){result.push(measure);measure=measureAt(score,measure.beat+measure.beats);}
  return result;
}

// Includes silent beats, and resets the pulse origin after a pickup or meter change.
export function pulseAtOrAfter(score:MeterScore,position:number):{beat:number;nextBeat:number;accent:boolean} {
  let measure=measureAt(score,position),unit=4/measure.timeSignature[1];
  let beat=measure.beat+Math.max(0,Math.ceil((position-measure.beat-epsilon)/unit))*unit;
  if(beat>=measure.beat+measure.beats-epsilon){measure=measureAt(score,measure.beat+measure.beats);beat=measure.beat;unit=4/measure.timeSignature[1];}
  return {beat,nextBeat:Math.min(beat+unit,measure.beat+measure.beats),accent:!measure.pickup&&Math.abs(beat-measure.beat)<epsilon};
}
