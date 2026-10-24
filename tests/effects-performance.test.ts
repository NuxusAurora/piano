import test from 'node:test';
import assert from 'node:assert/strict';
import {PianoEffects} from '../src/effects';

test('steady-state effects reuse painted sprites and avoid per-particle live blur',()=>{
  const previous={document:globalThis.document,matchMedia:globalThis.matchMedia,ResizeObserver:globalThis.ResizeObserver,devicePixelRatio:globalThis.devicePixelRatio};
  let created=0,blurs=0,disconnected=false;
  const gradient={addColorStop(){}};
  const ctx=new Proxy({} as CanvasRenderingContext2D,{
    get(_target,key){if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>gradient;return ()=>{};},
    set(_target,key,value){if(key==='shadowBlur'&&Number(value)>0)blurs++;return true;},
  });
  const canvas=()=>({width:0,height:0,dataset:{},getContext:()=>ctx,getBoundingClientRect:()=>({width:1200,height:350})});
  Object.assign(globalThis,{document:{createElement:()=>{created++;return canvas();}},matchMedia:()=>({matches:false}),devicePixelRatio:1,
    ResizeObserver:class{observe(){}disconnect(){disconnected=true;}}});
  try{
    const element=canvas();const effects=new PianoEffects(element as unknown as HTMLCanvasElement,()=>.5);
    for(let i=0;i<16;i++)effects.emit({x:.2+i*.02,beats:1,hand:'left',midi:48+i},120,1000);
    effects.frame(1100);const count=created;blurs=0;
    effects.frame(1116);effects.frame(1132);
    assert.equal(blurs,0,'GPU blur should be baked into sprites, not calculated on each frame');
    assert.equal(created,count,'steady-state frames must reuse offscreen sprites');
    effects.dispose();assert.equal(disconnected,true);assert.equal(element.dataset['noteCount' as keyof typeof element.dataset],'0');
  }finally{Object.assign(globalThis,previous);}
});
