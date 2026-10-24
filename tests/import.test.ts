import test from 'node:test';
import assert from 'node:assert/strict';
import * as MidiModule from '@tonejs/midi';
const Midi = MidiModule.Midi ?? (MidiModule as unknown as { default: typeof MidiModule }).default.Midi;
import { zipSync,strToU8 } from 'fflate';
import { importBytes,parseMusicXML } from '../src/score/import';
import { demoScore } from '../src/score/demo';

const xml=`<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Import fixture</work-title></work><part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><voice>1</voice><staff>1</staff></note><note><chord/><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note><note><rest/><duration>2</duration></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff></note><backup><duration>8</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><staff>2</staff></note></measure><measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>`;
test('MusicXML staff/backup/chords/rest/alter/tempo preserve timing',()=>{
  const {score}=parseMusicXML(xml);assert.equal(score.title,'Import fixture');assert.equal(score.bpm,120);
  assert.equal(score.hands.left.length,1);assert.equal(score.hands.left[0].notes[0].midi,48);
  assert.equal(score.hands.right[0].notes.length,2);assert.equal(score.hands.right[0].notes[1].midi,63);
  assert.equal(score.hands.right[0].notes[1].spelling,'Eb4');assert.equal(score.hands.right[1].beat,2);assert.equal(score.hands.right[2].beat,4);
});
test('adjacent tie continuation sustains previous note instead of consuming a press',()=>{
  const tied=xml.replace('<note><rest/><duration>2</duration></note>','').replace('<duration>4</duration><staff>1</staff>','<duration>6</duration><staff>1</staff>').replace('<step>G</step>','<step>C</step>').replace('<duration>6</duration><staff>1</staff>','<duration>6</duration><tie type="stop"/><voice>1</voice><staff>1</staff>');
  const {score}=parseMusicXML(tied);assert.equal(score.hands.right[0].notes[0].beats,4);assert.equal(score.hands.right.length,2);
});
test('unsupported repeats and malformed XML reject with an actionable error',()=>{
  assert.throws(()=>parseMusicXML(xml.replace('</measure>','<barline><repeat direction="backward"/></barline></measure>')),/反复/);
  assert.throws(()=>parseMusicXML('<x/>'),/score-partwise/);
  assert.throws(()=>parseMusicXML('<score-partwise><part></score-partwise>'),/结构损坏/);
});
test('compressed MXL resolves the container rootfile',()=>{
  const zipped=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="sheet.xml"/></rootfiles></container>'),'sheet.xml':strToU8(xml)});
  assert.equal(importBytes('sheet.mxl',zipped).score.title,'Import fixture');
});
test('MIDI onsets form chords and split independent hands',()=>{
  const midi=new Midi();midi.header.setTempo(100);const l=midi.addTrack(),r=midi.addTrack();
  l.addNote({midi:48,time:0,duration:1});r.addNote({midi:72,time:0,duration:.3});r.addNote({midi:76,time:0,duration:.3});
  const {score}=importBytes('fixture.mid',midi.toArray());assert.equal(score.hands.left.length,1);assert.equal(score.hands.right[0].notes.length,2);assert.equal(score.bpm,100);
});
test('native score roundtrip and image rejection',()=>{
  assert.deepEqual(importBytes('test.piano.json',strToU8(JSON.stringify(demoScore()))).score,demoScore());
  assert.throws(()=>importBytes('score.png',new Uint8Array()),/Codex/);
});
