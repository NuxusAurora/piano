export type Hand = 'left' | 'right';
export type Pitch = { midi: number; beats: number; spelling?: string };
export type ScoreEvent = { beat: number; notes: Pitch[] };
export type Score = {
  version: 1;
  title: string;
  composer: string;
  bpm: number;
  timeSignature: [number, number];
  hands: Record<Hand, ScoreEvent[]>;
};
export const HANDS: Hand[] = ['left', 'right'];

export function validateScore(input: unknown): Score {
  if (!input || typeof input !== 'object') throw new Error('曲谱必须是 JSON 对象');
  const s = input as Score;
  if (s.version !== 1 || typeof s.title !== 'string' || !s.title.trim()) throw new Error('曲谱缺少 version: 1 或标题');
  if (!Number.isFinite(s.bpm) || s.bpm < 20 || s.bpm > 300) throw new Error('速度应为 20–300 BPM');
  if (!Array.isArray(s.timeSignature) || s.timeSignature.length !== 2 || !Number.isInteger(s.timeSignature[0]) || s.timeSignature[0] < 1 || s.timeSignature[0] > 32 || ![2, 4, 8, 16].includes(s.timeSignature[1])) throw new Error('拍号无效');
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
  return { version: 1, title: s.title.trim().slice(0, 160), composer: typeof s.composer === 'string' ? s.composer.slice(0, 160) : '', bpm: s.bpm, timeSignature: s.timeSignature, hands };
}

export function scoreEnd(score: Score): number {
  return Math.max(...HANDS.map(h => Math.max(0, ...score.hands[h].map(e => e.beat + Math.max(...e.notes.map(n => n.beats))))));
}

export function noteName(midi: number): string {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
}
