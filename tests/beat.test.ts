import test from 'node:test';
import assert from 'node:assert/strict';
import {beatGestures, beatScore} from '../src/score/beat';
import {duetScore} from '../src/score/duet';
import {Performance, Accompaniment} from '../src/performance';
import type {Score} from '../src/score/types';

function source():Score {
  return {version:1,title:'Beat steps',composer:'',bpm:120,timeSignature:[4,4],hands:{
    left:[{beat:.5,notes:[{midi:48,beats:.5}]},{beat:2,notes:[{midi:52,beats:2}]}],
    right:[{beat:0,notes:[{midi:72,beats:.5}]},{beat:.5,notes:[{midi:74,beats:.25}]},{beat:.75,notes:[{midi:76,beats:.25}]},{beat:3,notes:[{midi:77,beats:1}]}],
  }};
}

test('one gesture advances one beat, retaining subdivisions and silent/sustained beats',()=>{
  const score=beatScore(source());
  assert.deepEqual(score.hands.right.map(e=>e.beat),[0,1,2,3]);
  assert.deepEqual(score.hands.right[0].following?.map(e=>e.beat),[.5,.75]);
  assert.equal(score.hands.right[1].notes.length,0);
  assert.equal(score.hands.left[0].notes.length,0);
  assert.equal(score.hands.left[2].notes[0].beats,2);
  assert.equal(score.hands.left[3].notes.length,0,'sustain is not retriggered');
});

test('independent hands count beats, retain held-key filtering and reset/seek behavior',()=>{
  let now=0;const engine=new Performance(beatScore(source()),()=>now);
  assert.equal(engine.press('KeyJ')?.event.beat,0);
  now=100;assert.equal(engine.press('KeyJ'),null);
  engine.release('KeyJ');assert.equal(engine.press('KeyJ')?.event.beat,1);
  assert.deepEqual(engine.snapshot(),{left:0,right:2});
  engine.seekHand('left',2);assert.deepEqual(engine.snapshot(),{left:2,right:2});
  engine.reset();assert.deepEqual(engine.snapshot(),{left:0,right:0});
});

test('beat length follows the denominator and empty staff stays complete',()=>{
  const score=source();score.timeSignature=[6,8];score.hands.left=[];
  const result=beatScore(score),engine=new Performance(result);
  assert.deepEqual(result.hands.right.map(e=>e.beat),[0,.5,1,1.5,2,2.5,3,3.5]);
  assert.equal(engine.next('left'),undefined);
  for(let i=0;i<8;i++)engine.advance('right');
  assert.equal(engine.complete,true);
});

test('dual songs retain both staves in every beat and use each song meter independently',()=>{
  const left=source(),right=source();right.timeSignature=[6,8];
  const score=duetScore(left,right,true);
  assert.equal(score.hands.left.length,4);assert.equal(score.hands.right.length,8);
  assert.deepEqual(score.hands.left[0].following?.find(e=>e.beat===.5)?.notes.map(n=>n.midi),[48,74]);
  assert.equal(score.hands.left[2].notes[0].midi,52);
});

test('a silent beat schedules its later onset; faster next press fills pending subdivisions and clear cancels them',()=>{
  let now=0;const engine=new Performance(beatScore(source())),following=new Accompaniment(()=>now);
  following.queue(engine.advance('left')!,120);
  assert.deepEqual(following.takeDue(249),[]);
  assert.equal(following.takeDue(250)[0].trigger.event.notes[0].midi,48);
  following.queue(engine.advance('right')!,120);
  const filled=following.queue(engine.advance('right')!,120);
  assert.deepEqual(filled.map(e=>e.trigger.event.beat),[.5,.75]);
  engine.reset();following.queue(engine.advance('left')!,120);following.clear();
  now=1000;assert.deepEqual(following.takeDue(),[]);
});

test('beat preparation never alters original score data and handles floating boundaries and very short notes',()=>{
  const score=source(),before=structuredClone(score),steps=beatScore(score);
  steps.hands.right[0].notes[0].midi=60;
  assert.deepEqual(score,before);
  assert.equal(beatGestures([{beat:0,notes:[{midi:60,beats:1e-10}]}],1).length,1);
  assert.equal(beatGestures([{beat:0,notes:[{midi:60,beats:3.0000000000000004}]}],1).length,3);
});
