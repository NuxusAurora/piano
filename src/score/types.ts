export type Hand = 'left' | 'right';
export type Pitch = { midi: number; beats: number; spelling?: string };
export type ScoreEvent = { beat: number; notes: Pitch[] };
export type TimeSignature = [number, number];
export type MeterChange = { beat: number; timeSignature: TimeSignature };
export type Score = {
  version: 1;
  title: string;
  composer: string;
  bpm: number;
  timeSignature: TimeSignature;
  pickupBeats?: number;
  meterChanges?: MeterChange[];
  hands: Record<Hand, ScoreEvent[]>;
};
// Internal playback plan; imported/exported scores retain the original event format.
export type ScoreGesture = ScoreEvent & { following?: readonly ScoreEvent[] };
export type PerformanceScore = Omit<Score, 'hands'> & { hands: Record<Hand, ScoreGesture[]> };
export const HANDS: Hand[] = ['left', 'right'];

const validSignature=(s:unknown):s is TimeSignature=>Array.isArray(s)&&s.length===2&&Number.isInteger(s[0])&&s[0]>=1&&s[0]<=32&&[2,4,8,16].includes(s[1]);

export function validateScore(input: unknown): Score {
  if (!input || typeof input !== 'object') throw new Error('曲谱必须是 JSON 对象');
  const s = input as Score;
  if (s.version !== 1 || typeof s.title !== 'string' || !s.title.trim()) throw new Error('曲谱缺少 version: 1 或标题');
  if (!Number.isFinite(s.bpm) || s.bpm < 20 || s.bpm > 300) throw new Error('速度应为 20–300 BPM');
  if (!validSignature(s.timeSignature)) throw new Error('拍号无效');
  let meter=s.timeSignature[0]*4/s.timeSignature[1],start=s.pickupBeats??0;
  if (s.pickupBeats!==undefined&&(!Number.isFinite(start)||start<=0||start>=meter)) throw new Error('弱起时长必须大于 0 且小于首个完整小节');
  let changes:MeterChange[]|undefined;
  if (s.meterChanges!==undefined) {
    if(!Array.isArray(s.meterChanges)||s.meterChanges.length>10000)throw new Error('变拍号列表无效');
    let previous=0;
    changes=s.meterChanges.map(c=>{
      if(!c||!Number.isFinite(c.beat)||c.beat<=previous||c.beat>100000||!validSignature(c.timeSignature))throw new Error('变拍号位置或拍号无效，位置必须严格递增');
      const measures=(c.beat-start)/meter;
      if(measures<0||Math.abs(measures-Math.round(measures))>1e-7)throw new Error('变拍号必须位于小节边界');
      previous=start=c.beat;meter=c.timeSignature[0]*4/c.timeSignature[1];
      return {beat:c.beat,timeSignature:[...c.timeSignature] as TimeSignature};
    });
  }
  let count = 0;
  const hands = {} as Record<Hand, ScoreEvent[]>;
  for (const hand of HANDS) {
    if (!Array.isArray(s.hands?.[hand])) throw new Error('曲谱需包含 hands.left 和 hands.right');
    if (s.hands[hand].length > 20000) throw new Error('曲谱过长，每只手最多 20000 组');
    hands[hand] = s.hands[hand].map(e => {
      if (!Number.isFinite(e.beat) || e.beat < 0 || e.beat > 100000) throw new Error('音符位置无效');
      if (!Array.isArray(e.notes) || e.notes.length < 1 || e.notes.length > 32) throw new Error('每组需包含 1–32 个音符');
      const notes = e.notes.map(n => {
        if (!Number.isInteger(n.midi) || n.midi < 21 || n.midi > 108) throw new Error('音高应在 88 键钢琴范围 A0–C8');
        if (!Number.isFinite(n.beats) || n.beats <= 0 || n.beats > 128) throw new Error('时值必须大于 0，单位为四分音符拍');
        return { midi: n.midi, beats: n.beats, ...(typeof n.spelling === 'string' && /^[A-G][#b]?-?\d$/.test(n.spelling) ? {spelling: n.spelling} : {}) };
      });
      count++;
      return { beat: e.beat, notes };
    }).sort((a, b) => a.beat - b.beat);
    // One onset is one gesture, including several voices at the same beat.
    hands[hand] = hands[hand].reduce<ScoreEvent[]>((out, e) => {
      const last = out.at(-1);
      if (last && Math.abs(last.beat - e.beat) < 0.0001) {
        for (const n of e.notes) {
          const old = last.notes.find(p => p.midi === n.midi);
          if (old) old.beats = Math.max(old.beats, n.beats); else last.notes.push(n);
        }
        if (last.notes.length > 32) throw new Error('同一时刻的和弦超过 32 个音符');
      } else out.push(e);
      return out;
    }, []);
  }
  if (!count) throw new Error('曲谱没有可演奏的音符');
  return { version: 1, title: s.title.trim().slice(0, 160), composer: typeof s.composer === 'string' ? s.composer.slice(0, 160) : '', bpm: s.bpm, timeSignature: [...s.timeSignature], ...(s.pickupBeats!==undefined?{pickupBeats:s.pickupBeats}:{}), ...(changes?{meterChanges:changes}:{}), hands };
}

export function scoreEnd(score: Score): number {
  return Math.max(...HANDS.map(h => Math.max(0, ...score.hands[h].map(e => e.beat + Math.max(...e.notes.map(n => n.beats))))));
}

export function noteName(midi: number): string {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
}
