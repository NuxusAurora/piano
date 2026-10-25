import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBytes} from '../src/score/import';
import {scoreEnd, type ScoreEvent, type ScoreGesture} from '../src/score/types';
import {measureAt, measureCount} from '../src/score/meter';
import {beatScore} from '../src/score/beat';
import {duetScore} from '../src/score/duet';
import {Performance} from '../src/performance';

const bytes=readFileSync(new URL('../public/scores/加勒比海盗.piano.json',import.meta.url));
const raw=JSON.parse(bytes.toString('utf8'));
const {score,warnings}=importBytes('加勒比海盗.piano.json',bytes);
function pitches(events:readonly ScoreEvent[]){
  const map=new Map<string,number>();
  for(const e of events)for(const n of e.notes){const key=`${e.beat.toFixed(7)}:${n.midi}`;map.set(key,Math.max(n.beats,map.get(key)??0));}
  return [...map].sort((a,b)=>a[0].localeCompare(b[0]));
}
const expanded=(events:ScoreGesture[])=>events.flatMap(e=>[e,...e.following??[]]);
test('Pirate three-page score imports with 79 full bars, pickup and exact meter boundary',()=>{
  assert.deepEqual(warnings,[]);assert.equal(raw.source.measures.length,80);
  assert.equal(score.bpm,195);assert.equal(score.pickupBeats,1.5);
  assert.equal(scoreEnd(score),283.5);assert.equal(measureCount(score),79);
  for(const bar of raw.source.measures){
    const measure=measureAt(score,bar.beat);assert.equal(measure.number,bar.number);assert.equal(measure.beats,bar.beats);
  }
  for(const hand of ['left','right'] as const){
    const events=score.hands[hand];
    for(let i=0;i<events.length;i++){
      if(i)assert.ok(events[i].beat>events[i-1].beat);
      assert.equal(new Set(events[i].notes.map(n=>n.midi)).size,events[i].notes.length);
      for(const n of events[i].notes)assert.ok(events[i].beat+n.beats<=283.5+1e-7);
    }
  }
});
test('Pirate point mode and whole-song mode preserve every original pitch, onset and duration',()=>{
  const point=beatScore(score),duet=duetScore(score,score),duetPoint=duetScore(score,score,true);
  const all=pitches([...score.hands.left,...score.hands.right]);
  for(const hand of ['left','right'] as const){
    assert.deepEqual(pitches(expanded(point.hands[hand])),pitches(score.hands[hand]));
    assert.deepEqual(pitches(expanded(duet.hands[hand])),all);
    assert.deepEqual(pitches(expanded(duetPoint.hands[hand])),all);
    assert.equal(point.hands[hand].filter(e=>e.beat<91.5).length,183);
  }
  for(const prepared of [score,point,duet,duetPoint]){
    const engine=new Performance(prepared);
    for(const hand of ['left','right'] as const)while(engine.advance(hand)){}
    assert.ok(engine.complete);engine.reset();assert.deepEqual(engine.snapshot(),{left:0,right:0});
    engine.seek(91.5);assert.equal(engine.next('right')?.beat,91.5);
  }
});
test('Pirate accidentals and long ties survive the change and closing passage',()=>{
  const start=(n:number)=>raw.source.measures[n].beat;
  const at=(hand:'left'|'right',n:number,offset=0)=>score.hands[hand].find(e=>Math.abs(e.beat-start(n)-offset)<1e-7)!;
  assert.deepEqual(at('right',16,2.5).notes.map(n=>n.spelling),['C#5']);
  assert.deepEqual(at('right',22).notes.map(n=>n.spelling),['C#4','E4']);
  assert.deepEqual(at('right',70,1).notes.map(n=>n.spelling),['B3']);
  assert.deepEqual(at('right',74,2+1/3).notes.map(n=>n.spelling),['F4']);
  assert.deepEqual(at('left',70).notes.map(n=>n.beats),[12,12]);
  assert.deepEqual(at('left',74).notes.map(n=>n.beats),[6,6]);
  assert.deepEqual(at('right',78).notes.map(n=>n.spelling),['D6','F6','A6']);
});
