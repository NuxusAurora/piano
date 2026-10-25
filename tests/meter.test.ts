import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScore, type Score} from '../src/score/types';
import {measureAt, measureCount, measuresBetween, pulseAtOrAfter} from '../src/score/meter';
import {beatScore} from '../src/score/beat';
import {duetScore} from '../src/score/duet';
import {importBytes, parseMusicXML} from '../src/score/import';
import {Performance} from '../src/performance';
import * as MidiModule from '@tonejs/midi';
const Midi=MidiModule.Midi??(MidiModule as unknown as {default:typeof MidiModule}).default.Midi;

function fixture():Score {
  return {version:1,title:'Pickup and meter change',composer:'',bpm:195,timeSignature:[12,8],pickupBeats:1.5,
    meterChanges:[{beat:7.5,timeSignature:[3,4]}],hands:{left:[{beat:0,notes:[{midi:45,beats:13.5}]}],right:[
      {beat:.5,notes:[{midi:57,beats:.5}]}, {beat:7,notes:[{midi:60,beats:.5}]},
      {beat:7.5,notes:[{midi:64,beats:1}]}, {beat:8+1/6,notes:[{midi:67,beats:1/3}]},
      {beat:12.5,notes:[{midi:62,beats:1}]},
    ]}};
}
test('native import and JSON export preserve optional meter changes and pickup, with isolated metadata',()=>{
  const source=fixture(),result=importBytes('mixed.piano.json',new TextEncoder().encode(JSON.stringify(source))).score;
  assert.deepEqual(result,source);
  const validated=validateScore(source);validated.meterChanges![0].timeSignature[0]=5;
  assert.deepEqual(source.meterChanges![0].timeSignature,[3,4]);
  const old=fixture();delete old.pickupBeats;delete old.meterChanges;
  assert.deepEqual(validateScore(old),old);
});
test('meter validation rejects ambiguous timing instead of flattening it silently',()=>{
  for(const pickup of [0,-1,6,NaN])assert.throws(()=>validateScore({...fixture(),pickupBeats:pickup}),/弱起/);
  for(const changes of [null,{},[{beat:7,timeSignature:[3,4]}],[{beat:7.5,timeSignature:[3,3]}],
    [{beat:7.5,timeSignature:[3,4]},{beat:7.5,timeSignature:[4,4]}],[{beat:0,timeSignature:[3,4]}]]) {
    assert.throws(()=>validateScore({...fixture(),meterChanges:changes}),/拍号|小节/);
  }
});
test('measure numbers, click targets and pulses share exact pickup and change boundaries',()=>{
  const score=fixture();
  assert.equal(measureAt(score,0).number,0);
  assert.equal(measureAt(score,1.5).number,1);
  assert.deepEqual(measureAt(score,7.5),{number:2,beat:7.5,beats:3,timeSignature:[3,4],pickup:false});
  assert.equal(measureAt(score,10.5).number,3);assert.equal(measureCount(score),3);
  assert.deepEqual(measuresBetween(score,6,13.5).map(m=>[m.number,m.beat,m.beats]),[[1,1.5,6],[2,7.5,3],[3,10.5,3]]);
  assert.deepEqual(pulseAtOrAfter(score,1),{beat:1,nextBeat:1.5,accent:false});
  assert.deepEqual(pulseAtOrAfter(score,7),{beat:7,nextBeat:7.5,accent:false});
  assert.deepEqual(pulseAtOrAfter(score,7.5),{beat:7.5,nextBeat:8.5,accent:true});
  assert.deepEqual(pulseAtOrAfter(score,8),{beat:8.5,nextBeat:9.5,accent:false});
  assert.equal(pulseAtOrAfter(score,10.5).accent,true);
});
test('point mode changes beat subdivision exactly at the boundary without losing triplets or sustaining attacks',()=>{
  const source=fixture(),before=structuredClone(source),result=beatScore(source);
  assert.deepEqual(result.hands.right.map(e=>e.beat),[0,.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8.5,9.5,10.5,11.5,12.5]);
  assert.equal(result.hands.right[15].following?.[0].beat,8+1/6);
  assert.equal(result.hands.left.filter(e=>e.notes.length).length,1);
  const engine=new Performance(result);for(const hand of ['left','right'] as const)while(engine.advance(hand)){}
  assert.ok(engine.complete);engine.seek(7.5);assert.equal(engine.next('right')?.beat,7.5);
  assert.deepEqual(source,before);
  const other=fixture();other.timeSignature=[4,4];delete other.pickupBeats;delete other.meterChanges;
  const duet=duetScore(source,other,true);
  assert.equal(duet.hands.left[15].beat,7.5);assert.equal(duet.hands.right[8].beat,8);
});
test('MusicXML imports a pickup and time change without losing global offsets',()=>{
  const attributes=(n:number,d:number)=>`<attributes><divisions>2</divisions><time><beats>${n}</beats><beat-type>${d}</beat-type></time></attributes>`;
  const note=(duration:number)=>`<note><pitch><step>D</step><octave>4</octave></pitch><duration>${duration}</duration></note>`;
  const xml=`<score-partwise><part id="P1"><measure number="0" implicit="yes">${attributes(12,8)}${note(3)}</measure><measure number="1">${note(12)}</measure><measure number="2">${attributes(3,4)}${note(6)}</measure></part></score-partwise>`;
  const score=parseMusicXML(xml).score;
  assert.equal(score.pickupBeats,1.5);assert.deepEqual(score.meterChanges,[{beat:7.5,timeSignature:[3,4]}]);
  assert.deepEqual(score.hands.right.map(e=>e.beat),[0,1.5,7.5]);
});

test('successive meter changes can return to the opening meter and reject conflicting XML parts',()=>{
  const score=fixture();score.meterChanges!.push({beat:13.5,timeSignature:[12,8]},{beat:19.5,timeSignature:[2,4]});
  assert.equal(measureAt(validateScore(score),19.5).number,5);
  assert.deepEqual(pulseAtOrAfter(score,19.5),{beat:19.5,nextBeat:20.5,accent:true});
  const part=(id:string,n:number)=>`<part id="${id}"><measure><attributes><time><beats>${n}</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>`;
  assert.throws(()=>parseMusicXML(`<score-partwise>${part('a',3)}${part('b',4)}</score-partwise>`),/拍号不一致/);
});
test('MIDI retains meter changes at the original global tick positions',()=>{
  const midi=new Midi(),ppq=midi.header.ppq;
  midi.header.timeSignatures=[{ticks:0,timeSignature:[12,8]},{ticks:6*ppq,timeSignature:[3,4]}];midi.header.update();
  midi.addTrack().addNote({midi:62,ticks:0,durationTicks:9*ppq});
  const result=importBytes('mixed.mid',midi.toArray()).score;
  assert.deepEqual(result.timeSignature,[12,8]);assert.deepEqual(result.meterChanges,[{beat:6,timeSignature:[3,4]}]);
});
