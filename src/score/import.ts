import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';
import * as MidiModule from '@tonejs/midi';
// Node loads the package's UMD main; Vite resolves its ESM module.
const Midi = MidiModule.Midi ?? (MidiModule as unknown as { default: typeof MidiModule }).default.Midi;
import { validateScore, type Score, type ScoreEvent, type Hand, type Pitch, type TimeSignature, type MeterChange } from './types';

type XNode = Record<string, unknown>;
const tag = (n: XNode): string => Object.keys(n).find(k => k !== ':@') ?? '';
const children = (n: XNode): XNode[] => (Array.isArray(n[tag(n)]) ? n[tag(n)] : []) as XNode[];
const all = (n: XNode, name: string): XNode[] => children(n).filter(c => tag(c) === name);
const one = (n: XNode, name: string): XNode | undefined => all(n,name)[0];
function value(n?: XNode): string {
  if (!n) return '';
  return children(n).map(c => c['#text'] ?? '').join('');
}
const val = (n: XNode, name: string): string => value(one(n,name));
const attr = (n: XNode, name: string): string => String((n[':@'] as Record<string, unknown> | undefined)?.['@_'+name] ?? '');
const number = (n: XNode, name: string, fallback = 0): number => val(n,name) === '' ? fallback : Number(val(n,name));

export type Imported = { score: Score; warnings: string[] };

export function parseMusicXML(xml: string): Imported {
  if (xml.includes('<!ENTITY')) throw new Error('不支持包含自定义实体的 XML');
  if (XMLValidator.validate(xml) !== true) throw new Error('MusicXML 文件结构损坏，请重新导出');
  const nodes = new XMLParser({ ignoreAttributes:false, preserveOrder:true, parseTagValue:false }).parse(xml) as XNode[];
  const root = nodes.find(n => tag(n) === 'score-partwise');
  if (!root) throw new Error('需要 score-partwise 格式的 MusicXML');
  const title = val(one(root,'work') ?? {},'work-title') || val(root,'movement-title') || '导入的曲谱';
  const creators = all(one(root,'identification') ?? {},'creator');
  const composer = value(creators.find(c => attr(c,'type') === 'composer') ?? creators[0]);
  const parts = all(root,'part');
  const hands: Record<Hand, ScoreEvent[]> = {left:[],right:[]};
  const warnings = new Set<string>();
  let bpm = 90, tempoFound = false;
  let timeSignature: [number,number] = [4,4];
  let initialTime = false;
  let pickupBeats:number|undefined;
  const meters=new Map<number,TimeSignature>();
  const noteSteps: Record<string,number> = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  parts.forEach((part, partIndex) => {
    let division = 1, barStart = 0, meter = 4, staffCount = 1, bass = false;
    const ties = new Map<string,{ note:Pitch; end:number }>();
    for (const measure of all(part,'measure')) {
      let cursor = 0, furthest = 0, previousOnset = 0;
      for (const child of children(measure)) {
        const name = tag(child);
        if (name === 'attributes') {
          division = number(child,'divisions',division);
          if (!(division > 0)) throw new Error('MusicXML divisions 无效');
          staffCount = number(child,'staves',staffCount);
          const clef = one(child,'clef');
          if (clef) bass = val(clef,'sign') === 'F';
          const time = one(child,'time');
          if (time) {
            const sig: [number,number] = [number(time,'beats',4),number(time,'beat-type',4)];
            if (!initialTime) { timeSignature = sig; initialTime = true; }
            const existing=meters.get(barStart);
            if(existing&&(existing[0]!==sig[0]||existing[1]!==sig[1]))throw new Error('各声部同一位置的拍号不一致');
            meters.set(barStart,sig);
            meter = sig[0] * 4 / sig[1];
          }
        } else if (name === 'direction') {
          const sound = one(child,'sound');
          const metronome = one(one(child,'direction-type') ?? {},'metronome');
          const raw = Number(sound && attr(sound,'tempo')) || number(metronome ?? {},'per-minute');
          if (raw > 0) {
            if (!tempoFound) { bpm = raw; tempoFound = true; }
            else if (raw !== bpm) warnings.add('当前使用首个速度，变速段请按自己的节奏演奏');
          }
        } else if (name === 'backup') cursor -= number(child,'duration') / division;
        else if (name === 'forward') { cursor += number(child,'duration') / division; furthest = Math.max(furthest,cursor); }
        else if (name === 'barline') {
          if (one(child,'repeat') || one(child,'ending')) throw new Error('含反复或跳房子，请交给 Codex 展开并转换成 piano.json');
        } else if (name === 'note') {
          if (one(child,'grace')) { warnings.add('装饰音未作为独立按键，需精确版本可由 Codex 转谱'); continue; }
          const chord = !!one(child,'chord');
          const duration = number(child,'duration') / division;
          const start = chord ? previousOnset : cursor;
          if (!chord) { previousOnset = cursor; cursor += duration; }
          furthest = Math.max(furthest,start+duration,cursor);
          const pitch = one(child,'pitch');
          if (!pitch || duration <= 0 || one(child,'rest')) continue;
          const step = val(pitch,'step');
          const alter = number(pitch,'alter');
          if (!(step in noteSteps) || !Number.isInteger(alter)) throw new Error('不支持该音高或微分音');
          const octave = number(pitch,'octave');
          const midi = (octave+1)*12+noteSteps[step]+alter;
          const hand: Hand = staffCount >= 2 ? (number(child,'staff',1) >= 2 ? 'left' : 'right') : bass ? 'left' : parts.length > 1 && partIndex > 0 ? 'left' : 'right';
          const beat = barStart+start;
          const key = `${hand}:${val(child,'voice')}:${midi}`;
          const tieTypes = all(child,'tie').map(t => attr(t,'type'));
          const previous = ties.get(key);
          let note: Pitch;
          if (tieTypes.includes('stop') && previous && Math.abs(previous.end-beat)<0.001) {
            previous.note.beats += duration;
            note = previous.note;
          } else {
            const spelling = step + (alter===1?'#':alter===-1?'b':'') + octave;
            note = {midi,beats:duration,...(Math.abs(alter)<=1?{spelling}:{})};
            hands[hand].push({beat,notes:[note]});
          }
          if (tieTypes.includes('start')) ties.set(key,{note,end:beat+duration}); else ties.delete(key);
        }
      }
      if(barStart===0&&attr(measure,'implicit')==='yes'&&furthest>0&&furthest<meter){
        if(pickupBeats!==undefined&&Math.abs(pickupBeats-furthest)>1e-7)throw new Error('各声部弱起时长不一致');
        pickupBeats=furthest;
      }
      barStart += attr(measure,'implicit') === 'yes' ? furthest : Math.max(meter,furthest);
    }
  });
  const meterChanges:MeterChange[]=[];
  let previous=timeSignature;
  for(const [beat,sig] of [...meters].sort((a,b)=>a[0]-b[0]))if(beat>0&&(sig[0]!==previous[0]||sig[1]!==previous[1])){
    meterChanges.push({beat,timeSignature:sig});previous=sig;
  }
  return {score:validateScore({version:1,title,composer,bpm,timeSignature,...(pickupBeats!==undefined?{pickupBeats}:{}),...(meterChanges.length?{meterChanges}:{}),hands}),warnings:[...warnings]};
}

export function parseMIDI(bytes: Uint8Array, title: string): Imported {
  const midi = new Midi(bytes);
  const tracks = midi.tracks.filter(t => t.notes.length && !t.instrument.percussion);
  const hands: Record<Hand,ScoreEvent[]> = {left:[],right:[]};
  let rightTrack = 0;
  if (tracks.length===2) rightTrack = tracks[1].notes.reduce((s,n)=>s+n.midi,0)/tracks[1].notes.length > tracks[0].notes.reduce((s,n)=>s+n.midi,0)/tracks[0].notes.length ? 1 : 0;
  tracks.forEach((t,i) => t.notes.forEach(n => {
    const hand: Hand = tracks.length===2 ? (i===rightTrack?'right':'left') : n.midi<60?'left':'right';
    hands[hand].push({beat:n.ticks/midi.header.ppq,notes:[{midi:n.midi,beats:n.durationTicks/midi.header.ppq}]});
  }));
  const signatures=midi.header.timeSignatures;
  const sig = signatures[0]?.ticks===0 ? signatures[0].timeSignature : [4,4];
  const meterChanges=signatures.filter(s=>s.ticks>0).map(s=>({beat:s.ticks/midi.header.ppq,timeSignature:s.timeSignature}));
  return {score:validateScore({version:1,title:midi.name||title,composer:'',bpm:midi.header.tempos[0]?.bpm??90,timeSignature:sig,...(meterChanges.length?{meterChanges}:{}),hands}),warnings:['MIDI 左右手按双轨音区或中央 C 自动分配，请试听确认',...(midi.header.tempos.length>1?['当前使用首个速度']:[])]};
}

export function importBytes(name: string, bytes: Uint8Array): Imported {
  if (bytes.byteLength > 12*1024*1024) throw new Error('曲谱文件最大 12 MB');
  const lower = name.toLowerCase();
  if (lower.endsWith('.mid') || lower.endsWith('.midi')) return parseMIDI(bytes,name.replace(/\.[^.]+$/,''));
  if (lower.endsWith('.mxl')) {
    // Bound expansion before allocation (ZIP central directory metadata).
    const files = unzipSync(bytes,{filter:f=>f.originalSize<=12*1024*1024 && /\.xml$|\.musicxml$/i.test(f.name)});
    const container = files['META-INF/container.xml'];
    const path = container ? /full-path=["']([^"']+)["']/.exec(strFromU8(container))?.[1] : undefined;
    const source = path ? files[path] : Object.entries(files).find(([p])=>!p.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(p))?.[1];
    if (!source) throw new Error('压缩谱内未找到 MusicXML，或文件超过 12 MB');
    return parseMusicXML(strFromU8(source));
  }
  const text = new TextDecoder().decode(bytes);
  if (lower.endsWith('.json')) return {score:validateScore(JSON.parse(text)),warnings:[]};
  if (lower.endsWith('.xml') || lower.endsWith('.musicxml')) return parseMusicXML(text);
  throw new Error('支持 .piano.json、MusicXML、MXL、MIDI；图片/PDF 请发到聊天中由 Codex 转谱');
}
