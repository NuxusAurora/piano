import test from 'node:test';
import assert from 'node:assert/strict';
import { duetScore, fullSong, sourceProgress } from '../src/score/duet';
import { Performance, Accompaniment } from '../src/performance';
import { demoScore, waltzScore } from '../src/score/demo';
import { type Score } from '../src/score/types';

function source():Score {
  return {version:1,title:'Complete song',composer:'',bpm:90,timeSignature:[3,4],hands:{
    left:[{beat:0,notes:[{midi:48,beats:2},{midi:60,beats:2}]},{beat:2,notes:[{midi:50,beats:1}]}],
    right:[{beat:0,notes:[{midi:60,beats:1,spelling:'C4'},{midi:64,beats:.5}]},{beat:.5,notes:[{midi:67,beats:.5}]},{beat:4,notes:[{midi:72,beats:3}]}],
  }};
}

test('melody controls press count while the complete accompaniment remains in timed following events',()=>{
  const original=source(),before=structuredClone(original),events=fullSong(original);
  assert.deepEqual(events.map(e=>e.beat),[0,.5,4]);
  assert.deepEqual(events[1].following,[{beat:2,notes:[{midi:50,beats:1}]}]);
  assert.deepEqual(events[0].notes.map(n=>[n.midi,n.beats]),[[48,2],[60,2],[64,.5]]);
  assert.deepEqual(original,before);
  events[0].notes[0].beats=10;assert.deepEqual(original,before);
});

test('each physical hand advances its entire chosen song and can finish without stopping the other',()=>{
  const left=source(),right=waltzScore(),score=duetScore(left,right);
  let now=0;const engine=new Performance(score,()=>now);
  assert.deepEqual(engine.press('KeyA')?.event.notes,fullSong(left)[0].notes);
  now=20;assert.equal(engine.press('KeyS'),null);
  assert.deepEqual(engine.press('KeyJ')?.event.notes,fullSong(right)[0].notes);
  while(engine.next('left'))engine.advance('left');
  assert.equal(engine.complete,false);assert.equal(engine.advance('left'),null);
  assert.equal(engine.snapshot().right,1);
  while(engine.next('right'))engine.advance('right');
  assert.equal(engine.complete,true);
  engine.reset();assert.deepEqual(engine.snapshot(),{left:0,right:0});
});

test('same source can be assigned to both hands with isolated events and cursors',()=>{
  const source=demoScore(),score=duetScore(source,source),engine=new Performance(score);
  engine.advance('left');assert.deepEqual(engine.snapshot(),{left:1,right:0});
  assert.notEqual(score.hands.left[0].notes[0],score.hands.right[0].notes[0]);
  assert.deepEqual(score.hands.left,score.hands.right);
});

test('single-side seek preserves other progress and clears held/chord inputs',()=>{
  const engine=new Performance(duetScore(source(),source()),()=>0);
  engine.press('KeyA');engine.press('KeyJ');engine.seekHand('left',.5);
  assert.deepEqual(engine.snapshot(),{left:1,right:1});
  assert.equal(engine.press('KeyA')?.event.beat,.5);
  engine.seek(4);assert.deepEqual(engine.snapshot(),{left:2,right:2});
});

test('grand-staff cursors follow full-song onsets including one-staff gaps and completion',()=>{
  const score=source();
  assert.deepEqual(sourceProgress(score,0),{left:0,right:0});
  assert.deepEqual(sourceProgress(score,.5),{left:1,right:1});
  assert.deepEqual(sourceProgress(score,2),{left:1,right:2});
  assert.deepEqual(sourceProgress(score),{left:2,right:3});
});

test('accompaniment follows original beat offsets at the trigger tempo without consuming melody presses',()=>{
  let now=1000;
  const engine=new Performance(duetScore(source(),source())),following=new Accompaniment(()=>now);
  engine.advance('left');const step=engine.advance('left')!;following.queue(step,120);
  assert.equal(following.pending,true);assert.deepEqual(following.takeDue(),[]);
  now=1749;assert.deepEqual(following.takeDue(),[]);
  now=1750;const due=following.takeDue();
  assert.equal(due.length,1);assert.equal(due[0].trigger.event.notes[0].midi,50);
  assert.equal(due[0].bpm,120);assert.equal(due[0].at,1750);
  assert.deepEqual(engine.snapshot(),{left:2,right:0});assert.equal(following.pending,false);
});

test('fast next melody press completes its own pending accompaniment without dropping notes; clear cancels both',()=>{
  const score=duetScore(source(),source()),engine=new Performance(score),following=new Accompaniment(()=>0);
  engine.advance('left');engine.advance('right');
  following.queue(engine.advance('left')!,60);following.queue(engine.advance('right')!,60);
  const remaining=following.queue(engine.advance('left')!,60);
  assert.deepEqual(remaining.map(d=>[d.trigger.hand,d.trigger.event.notes[0].midi]),[['left',50]]);
  const due=following.takeDue(2000);assert.deepEqual(due.map(d=>d.trigger.hand),['right']);
  following.queue({hand:'left',event:score.hands.left[1],index:1},60);
  following.queue({hand:'right',event:score.hands.right[1],index:1},60);
  following.clear();assert.equal(following.pending,false);assert.deepEqual(following.takeDue(10000),[]);
});

test('intro and final accompaniment remain complete; missing right staff falls back to left rhythm',()=>{
  const original=source();original.hands.right=[{beat:1,notes:[{midi:72,beats:1}]}];
  const steps=fullSong(original);assert.equal(steps.length,1);assert.equal(steps[0].beat,0);
  assert.deepEqual(steps[0].following?.map(e=>e.beat),[1,2]);
  const engine=new Performance(duetScore(original,original)),following=new Accompaniment(()=>0);
  following.queue(engine.advance('left')!,60);following.queue(engine.advance('right')!,60);
  assert.equal(engine.complete,true);assert.equal(following.pending,true);
  assert.deepEqual(following.takeDue(2000).map(e=>e.trigger.event.beat),[1,1,2,2]);
  assert.equal(following.pending,false);
  original.hands.right=[];assert.deepEqual(fullSong(original).map(e=>e.beat),[0,2]);
});
