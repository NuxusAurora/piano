import test from 'node:test';
import assert from 'node:assert/strict';
import { Performance, handForCode, bubbleDuration } from '../src/performance';
import { demoScore } from '../src/score/demo';
import { validateScore } from '../src/score/types';

test('physical 6/Y/G/B boundary includes boundary in left hand',()=>{
  for(const key of ['Digit6','KeyY','KeyG','KeyB','Backquote','KeyA'])assert.equal(handForCode(key),'left');
  for(const key of ['Digit7','KeyU','KeyH','KeyN','Slash','Quote'])assert.equal(handForCode(key),'right');
  for(const key of ['Space','ShiftLeft','ControlLeft','ArrowRight','Enter'])assert.equal(handForCode(key),null);
});
test('one simultaneous gesture consumes one chord; both hands independent',()=>{
  let now=0;const engine=new Performance(demoScore(),()=>now);
  const first=engine.press('KeyA');assert.equal(first?.event.notes.length,3);
  now=20;assert.equal(engine.press('KeyS'),null);
  assert.equal(engine.press('KeyJ')?.index,0);
  assert.deepEqual(engine.snapshot(),{left:1,right:1});
  now=60;assert.equal(engine.press('KeyD')?.index,1);
});
test('held key and OS repeat cannot advance; release enables a new gesture',()=>{
  let now=0;const engine=new Performance(demoScore(),()=>now);
  engine.press('KeyJ');now=100;
  assert.equal(engine.press('KeyJ',true),null);assert.equal(engine.press('KeyJ'),null);
  engine.release('KeyJ');assert.equal(engine.press('KeyJ')?.index,1);
});
test('reset, seek and blur cleanup isolate held state and return copied cursors',()=>{
  const engine=new Performance(demoScore(),()=>0);engine.press('KeyJ');engine.clearInput();assert.equal(engine.press('KeyJ')?.index,1);
  const snapshot=engine.snapshot();snapshot.right=100;assert.equal(engine.snapshot().right,2);
  engine.seek(8);assert.equal(engine.next('right')?.beat,8);assert.equal(engine.next('left')?.beat,8);
  engine.reset();assert.deepEqual(engine.snapshot(),{left:0,right:0});assert.equal(engine.press('KeyJ')?.index,0);
});
test('an eighth travels in half the time of a quarter, BPM scales both',()=>{
  assert.equal(bubbleDuration(1,120),2*bubbleDuration(.5,120));assert.equal(bubbleDuration(1,60),2*bubbleDuration(1,120));
});
test('rest gaps do not consume presses, tied/chord durations remain independent',()=>{
  const score=validateScore({version:1,title:'test',composer:'',bpm:120,timeSignature:[4,4],hands:{left:[],right:[{beat:2,notes:[{midi:60,beats:.5},{midi:64,beats:2}]}]}});
  const engine=new Performance(score);assert.equal(engine.advance('left'),null);assert.equal(engine.advance('right')?.event.beat,2);assert.equal(engine.complete,true);
});
test('malformed score fails atomically; duplicate onset voices combine',()=>{
  const score=demoScore();score.hands.right.push({beat:0,notes:[{midi:64,beats:1}]});
  assert.equal(validateScore(score).hands.right[0].notes.length,2);
  score.hands.right[0].notes[0].midi=200;assert.throws(()=>validateScore(score),/88/);
  assert.throws(()=>validateScore({...demoScore(),bpm:NaN}),/BPM/);
});
test('two engines are isolated; demo advancement does not lose dense notes to chord window',()=>{
  const a=new Performance(demoScore(),()=>0),b=new Performance(demoScore(),()=>0);
  a.advance('right');a.advance('right');assert.equal(a.snapshot().right,2);assert.equal(b.snapshot().right,0);
});
