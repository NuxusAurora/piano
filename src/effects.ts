import { bubbleDuration } from './performance';
import type { Hand } from './score/types';

export type LightNote = { x:number; beats:number; hand:Hand; midi:number };
type Sprite = {image:HTMLCanvasElement;width:number;height:number};
type Trail = LightNote & {born:number;duration:number;height:number;sprite?:Sprite};
type Spark = {x:number;y:number;vx:number;vy:number;born:number;life:number;size:number;violet:boolean};
type Strike = {x:number;born:number};

export function lightGeometry(beats:number,bpm:number) {
  return {duration:bubbleDuration(beats,bpm)*1000,height:Math.min(180,Math.max(14,beats*48))};
}
export function trailBottom(age:number,duration:number,height:number) {
  return height-Math.max(0,age)/duration*(height+180);
}

export class PianoEffects {
  private ctx:CanvasRenderingContext2D|null;
  private width=1;
  private height=1;
  private trails:Trail[]=[];
  private sparks:Spark[]=[];
  private strikes:Strike[]=[];
  private sprites=new Map<string,Sprite>();
  private wave=new Uint8Array(1);
  private floor?:CanvasGradient;
  private lastFrame=0;
  private lastCount=-1;
  private dirty=true;
  private hadActive=false;
  private observer:ResizeObserver;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private canvas:HTMLCanvasElement,private random:()=>number=Math.random) {
    this.ctx=canvas.getContext('2d');
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  }
  private resize() {
    if(!this.ctx)return;
    const rect=this.canvas.getBoundingClientRect();
    const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const scale=Math.min(1.25,devicePixelRatio||1);
    if(width===this.width&&height===this.height&&this.canvas.width===Math.round(width*scale))return;
    this.width=width;this.height=height;
    this.canvas.width=Math.round(width*scale);this.canvas.height=Math.round(height*scale);
    this.ctx.setTransform(scale,0,0,scale,0,0);
    this.sprites.clear();for(const note of this.trails)note.sprite=undefined;
    this.wave=new Uint8Array(Math.ceil(width/6)+1);
    this.floor=this.ctx.createLinearGradient(0,height-44,0,height);
    this.floor.addColorStop(0,'rgba(255,151,83,0)');this.floor.addColorStop(1,'rgba(255,159,93,.16)');
    this.dirty=true;
  }
  private sprite(key:string,width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void):Sprite|undefined {
    const cached=this.sprites.get(key);if(cached)return cached;
    const image=document.createElement('canvas');image.width=Math.ceil(width);image.height=Math.ceil(height);
    const ctx=image.getContext('2d');if(!ctx)return;
    paint(ctx);const sprite={image,width,height};
    // Arbitrary imported durations must not grow the cache indefinitely.
    if(this.sprites.size>=48)this.sprites.delete(this.sprites.keys().next().value!);
    this.sprites.set(key,sprite);return sprite;
  }
  private noteSprite(note:LightNote,height:number) {
    const width=Math.max(7,Math.min(30,this.width/52*.84)),pad=22;
    return this.sprite(`note:${note.hand}:${height}`,width+pad*2,height+pad*2,ctx=>{
      ctx.shadowColor=note.hand==='left'?'#ff4055':'#268aff';ctx.shadowBlur=18;
      const fill=ctx.createLinearGradient(pad,pad,pad+width,pad+height);
      fill.addColorStop(0,note.hand==='left'?'#ffb3bb':'#a9d4ff');fill.addColorStop(.2,note.hand==='left'?'#ff6678':'#54adff');
      fill.addColorStop(.7,note.hand==='left'?'#e51d39':'#1768e5');fill.addColorStop(1,note.hand==='left'?'#ff8695':'#7cbcff');
      ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(pad,pad,width,height,Math.min(5,width*.27));ctx.fill();
      ctx.shadowBlur=0;ctx.strokeStyle=note.hand==='left'?'#ffc6cc':'#c3e3ff';ctx.lineWidth=.9;ctx.stroke();
      ctx.globalAlpha=.65;ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(pad+1.5,pad+2,Math.max(1,width*.13),height-4,2);ctx.fill();
    });
  }
  private glow(violet:boolean,strike=false) {
    const size=strike?96:20,r=size/2;
    return this.sprite(strike?'strike':violet?'violet':'gold',size,size,ctx=>{
      const gradient=ctx.createRadialGradient(r,r,0,r,r,r);
      gradient.addColorStop(0,strike?'rgba(255,241,216,.9)':'rgba(255,249,235,1)');
      gradient.addColorStop(.25,violet?'rgba(205,145,255,.8)':'rgba(255,183,105,.7)');
      gradient.addColorStop(1,violet?'rgba(174,92,255,0)':'rgba(246,119,69,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);
    });
  }
  emit(note:LightNote,bpm:number,now=performance.now()) {
    if(!this.ctx)return;
    const geometry=lightGeometry(note.beats,bpm);
    this.trails.push({...note,born:now,...geometry,sprite:this.noteSprite(note,geometry.height)});
    this.strikes.push({x:note.x,born:now});
    if(!this.reduced.matches)for(let i=0;i<9;i++)this.sparks.push({
      x:note.x,y:0,vx:(this.random()-.5)*.18,vy:-.04-this.random()*.20,
      born:now,life:400+this.random()*850,size:.6+this.random()*1.6,violet:i%3===0,
    });
    this.trails=this.trails.slice(-128);this.sparks=this.sparks.slice(-288);this.strikes=this.strikes.slice(-48);this.dirty=true;
  }
  frame(now:number) {
    const ctx=this.ctx;if(!ctx)return;
    const w=this.width,h=this.height,dt=this.lastFrame?Math.min(40,now-this.lastFrame):16;
    this.lastFrame=now;
    this.trails=this.trails.filter(n=>now-n.born<n.duration);
    this.strikes=this.strikes.filter(n=>now-n.born<550);
    this.sparks=this.sparks.filter(s=>now-s.born<s.life);
    const moving=!this.reduced.matches;
    if(!moving)this.sparks=[];
    const active=Boolean(this.trails.length||this.sparks.length||this.strikes.length);
    if(!active&&!this.dirty&&!this.hadActive)return;
    this.dirty=false;this.hadActive=active;ctx.clearRect(0,0,w,h);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    for(let i=0;i<26;i++){
      const x=((i*173.13)%1)*w,y=h-((i*79.73+(moving&&active?now*.007:0))%(h+30));
      ctx.fillStyle=`rgba(174,130,218,${.10+(i%4)*.055})`;ctx.beginPath();ctx.arc(x,y,.7+(i%3)*.5,0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='lighter';
    for(const n of this.trails){
      const age=now-n.born,progress=age/n.duration,bottom=moving?trailBottom(age,n.duration,h):h-8;
      if(bottom< -30)continue;
      const sprite=n.sprite??(n.sprite=this.noteSprite(n,n.height));if(!sprite)continue;
      ctx.globalAlpha=moving?Math.min(1,Math.max(0,(1-progress)*2.4)):Math.max(0,1-progress);
      ctx.drawImage(sprite.image,n.x*w-sprite.width/2,bottom-n.height-22);
    }
    ctx.globalAlpha=1;
    if(this.floor){ctx.fillStyle=this.floor;ctx.fillRect(0,h-44,w,44);}
    const strike=this.glow(false,true),gold=this.glow(false),violet=this.glow(true);
    this.wave.fill(1);
    for(const s of this.strikes){
      const p=(now-s.born)/550,x=s.x*w,r=14+p*34;
      if(strike){ctx.globalAlpha=1-p;ctx.drawImage(strike.image,x-r,h-r,r*2,r*2);}
      const center=Math.round(x/6);this.wave.fill(3,Math.max(0,center-7),Math.min(this.wave.length,center+8));
    }
    ctx.globalAlpha=1;ctx.strokeStyle='#ffd6ac';ctx.lineWidth=1;ctx.beginPath();
    const phase=moving&&active?now*.004:0;
    for(let i=0;i<this.wave.length;i++){
      const x=i*6,y=h-1-Math.abs(Math.sin(x*.23+phase)*Math.sin(x*.09-phase*1.7))*this.wave[i];
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
    for(const s of this.sparks){
      s.x+=s.vx*dt/w;s.y+=s.vy*dt;s.vy+=.000045*dt;
      ctx.globalAlpha=Math.max(0,1-(now-s.born)/s.life);
      const sprite=s.violet?violet:gold,size=s.size*6;
      if(sprite)ctx.drawImage(sprite.image,s.x*w-size/2,h+s.y-size/2,size,size);
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(this.lastCount!==this.trails.length){this.canvas.dataset.noteCount=String(this.trails.length);this.lastCount=this.trails.length;}
  }
  clear() {
    this.trails=[];this.sparks=[];this.strikes=[];this.lastFrame=0;this.lastCount=0;this.dirty=true;this.hadActive=false;
    this.canvas.dataset.noteCount='0';this.ctx?.clearRect(0,0,this.width,this.height);
  }
  dispose(){this.clear();this.observer.disconnect();this.sprites.clear();this.floor=undefined;this.ctx=null;}
}
