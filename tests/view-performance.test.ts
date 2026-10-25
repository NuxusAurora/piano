import test from 'node:test';
import assert from 'node:assert/strict';
import {ScoreView} from '../src/view';
import {demoScore} from '../src/score/demo';

class Node {
  children:Node[]=[];
  attrs=new Map<string,string>();
  clientWidth=1200;clientHeight=180;
  writes=0;
  textContent='';
  setAttribute(name:string,value:string){this.attrs.set(name,value);this.writes++;}
  append(...nodes:Node[]){this.children.push(...nodes);}
  replaceChildren(...nodes:Node[]){this.children=nodes;}
  addEventListener(){}
}
function withDOM(check:(host:Node,created:()=>number)=>void) {
  const previous={document:globalThis.document,matchMedia:globalThis.matchMedia};
  let count=0;
  Object.assign(globalThis,{document:{createElementNS:()=>{count++;return new Node();}},matchMedia:()=>({matches:false})});
  try{check(new Node(),()=>count);}finally{Object.assign(globalThis,previous);}
}
function walk(node:Node):Node[]{return [node,...node.children.flatMap(walk)];}

test('playing within a rendered window reuses the SVG and allocates no notation nodes',()=>withDOM((host,created)=>{
  const view=new ScoreView(host as unknown as HTMLElement);view.load(demoScore());
  const root=host.children[0],count=created();
  for(let i=1;i<5;i++){view.update({left:i,right:i},i*.5);view.frame();}
  assert.ok(host.children[0]===root,'a note press must not rebuild the score');
  assert.equal(created(),count,'note progression should only recolor existing notation');
}));
test('immediate seek and backward window changes preserve cursor and note colors',()=>withDOM(host=>{
  const view=new ScoreView(host as unknown as HTMLElement);view.load(demoScore());
  view.update({left:2,right:4},4,true);
  assert.ok(walk(host).some(n=>n.attrs.get('transform')==='translate(-152,0)'));
  const first=host.children[0];view.update({left:10,right:18},20);view.frame();
  assert.ok(first!==host.children[0],'scrolling into a new window should replace only its notation');
  const note=walk(host).find(n=>n.attrs.get('data-hand')==='right'&&n.attrs.get('data-index')==='18');
  assert.equal(note?.attrs.get('color'),'#e3bdff');
  view.update({left:0,right:0},0,true);
  const restart=walk(host).find(n=>n.attrs.get('data-hand')==='right'&&n.attrs.get('data-index')==='0');
  assert.equal(restart?.attrs.get('color'),'#e3bdff');
}));
test('resize invalidates geometry without changing the independent hand progress',()=>withDOM(host=>{
  const view=new ScoreView(host as unknown as HTMLElement);view.load(demoScore());
  view.update({left:1,right:3},2,true);const root=host.children[0];
  host.clientWidth=800;view.resize();view.frame();assert.ok(root!==host.children[0]);
  for(const [hand,index]of [['left','1'],['right','3']]){
    const note=walk(host).find(n=>n.attrs.get('data-hand')===hand&&n.attrs.get('data-index')===index);
    assert.equal(note?.attrs.get('color'),'#e3bdff');
  }
}));
test('an idle score does not rewrite SVG transforms every animation frame',()=>withDOM(host=>{
  const view=new ScoreView(host as unknown as HTMLElement);view.load(demoScore());view.frame();
  const writes=()=>walk(host).reduce((sum,n)=>sum+n.writes,0),before=writes();
  for(let i=0;i<60;i++)view.frame();
  assert.equal(writes(),before,'an unchanged score should stay idle');
}));
test('separate song views own distinct clipping paths and retain independent notation',()=>withDOM(host=>{
  const other=new Node(),a=new ScoreView(host as unknown as HTMLElement),b=new ScoreView(other as unknown as HTMLElement);
  a.load(demoScore());b.load(demoScore());
  const clipA=walk(host).find(n=>n.attrs.has('id'))?.attrs.get('id');
  const clipB=walk(other).find(n=>n.attrs.has('id'))?.attrs.get('id');
  assert.notEqual(clipA,clipB);
  a.update({left:2,right:4},4,true);
  const next=walk(other).find(n=>n.attrs.get('data-hand')==='right'&&n.attrs.get('data-index')==='0');
  assert.equal(next?.attrs.get('class'),'score-note next');
}));

test('pickup and meter changes use original measure numbers, hit widths and current fixed meter',()=>withDOM(host=>{
  const score=demoScore();score.timeSignature=[12,8];score.pickupBeats=1.5;score.meterChanges=[{beat:7.5,timeSignature:[3,4]}];
  const view=new ScoreView(host as unknown as HTMLElement);view.load(score);
  const hits=()=>walk(host).filter(n=>n.attrs.get('class')==='measure-hit');
  assert.equal(hits()[0].attrs.get('aria-label'),'定位到弱起');
  assert.equal(hits()[0].attrs.get('width'),'114');
  assert.equal(hits().find(n=>n.attrs.get('data-beat')==='7.5')?.attrs.get('aria-label'),'定位到第 2 小节');
  assert.equal(hits().find(n=>n.attrs.get('data-beat')==='7.5')?.attrs.get('width'),'228');
  const root=host.children[0];view.update({left:0,right:0},7.5,true);
  assert.equal(host.children[0],root,'changing the fixed meter should not rebuild notation');
  assert.deepEqual(walk(host).filter(n=>n.attrs.has('data-meter')).map(n=>n.textContent),['3','4','3','4']);
  view.update({left:0,right:0},0,true);
  assert.deepEqual(walk(host).filter(n=>n.attrs.has('data-meter')).map(n=>n.textContent),['12','8','12','8']);
}));
