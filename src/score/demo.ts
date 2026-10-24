import { validateScore, type Score, type ScoreEvent } from './types';

const event = (beat: number, midis: number[], beats: number): ScoreEvent => ({ beat, notes: midis.map(midi => ({ midi, beats })) });

export function demoScore(): Score {
  // Public-domain melody, original simple accompaniment.
  const phrases = [
    [60,60,67,67,69,69,67], [65,65,64,64,62,62,60],
    [67,67,65,65,64,64,62], [67,67,65,65,64,64,62],
    [60,60,67,67,69,69,67], [65,65,64,64,62,62,60],
  ];
  const right: ScoreEvent[] = [];
  phrases.forEach((p, section) => p.forEach((n, i) => right.push(event(section * 8 + i, [n], i === 6 ? 2 : 1))));
  const left: ScoreEvent[] = [];
  const chords = [[48,52,55], [48,53,57], [47,50,55], [48,52,55]];
  for (let bar = 0; bar < 12; bar++) {
    const chord = chords[bar % chords.length];
    left.push(event(bar * 4, chord, 2), event(bar * 4 + 2, [chord[0],chord[2]], 2));
  }
  return validateScore({version:1, title:'小星星', composer:'法国民谣 · 双手练习', bpm:88, timeSignature:[4,4], hands:{left,right}});
}

export function waltzScore(): Score {
  const melody = [76,75,76,75,76,71,74,72,69,60,64,69,71,64,68,71,72,64,76,75,76,75,76,71,74,72,69,60,64,69,71,64,72,71,69];
  const right = melody.map((midi, i) => event(i * 0.5, [midi], i === melody.length-1 ? 2 : 0.5));
  const left: ScoreEvent[] = [];
  for (let i=0;i<6;i++) { const root = i%2 ? 40 : 45; left.push(event(i*3,[root],1),event(i*3+1,[root+7,root+12,root+15],1),event(i*3+2,[root+7,root+12,root+15],1)); }
  return validateScore({version:1,title:'致爱丽丝 · 主题练习',composer:'L. van Beethoven · 简化伴奏',bpm:100,timeSignature:[3,4],hands:{left,right}});
}
