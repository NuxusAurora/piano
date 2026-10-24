import test from 'node:test';
import assert from 'node:assert/strict';
import { lightGeometry,trailBottom } from '../src/effects';

test('glowing bars preserve exact eighth/quarter velocity and musical duration',()=>{
  const eighth=lightGeometry(.5,120),quarter=lightGeometry(1,120),half=lightGeometry(2,120);
  assert.equal(eighth.duration,750);assert.equal(quarter.duration,1500);
  assert.equal(quarter.duration,eighth.duration*2);
  assert.ok(half.height>quarter.height && quarter.height>eighth.height);
  const h=400,age=200;
  assert.ok(Math.abs((h-trailBottom(age,eighth.duration,h))/(h-trailBottom(age,quarter.duration,h))-2)<1e-10);
});
test('resize reprojects the same progress; a BPM change affects new bars',()=>{
  const original=lightGeometry(1,60),faster=lightGeometry(1,120);
  assert.equal(original.duration,faster.duration*2);
  assert.equal(trailBottom(0,original.duration,200),200);
  const p=.35;
  for(const height of [150,400,900])assert.ok(Math.abs((height-trailBottom(p*original.duration,original.duration,height))/(height+180)-p)<1e-10);
  assert.equal(original.duration,3000);
});
