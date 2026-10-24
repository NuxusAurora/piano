import { bubbleDuration } from './performance';
import type { Hand } from './score/types';

export type LightNote = { x:number; beats:number; hand:Hand; midi:number };
type Trail = LightNote & { born:number; duration:number; height:number };
type Spark = { x:number; y:number; vx:number; vy:number; born:number; life:number; size:number; violet:boolean };
type Strike = { x:number; born:number; hand:Hand };

export function lightGeometry(beats:number,bpm:number) {
  return { duration:bubbleDuration(beats,bpm)*1000, height:Math.min(180,Math.max(14,beats*48)) };
}

// Fractions of keyboard width survive resize without moving to a different key.
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
  private lastFrame=0;
  private lastCount=-1;
  private observer:ResizeObserver;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private canvas:HTMLCanvasElement,private random:()=>number=Math.random) {
    this.ctx=canvas.getContext('2d');
    this.observer=new ResizeObserver(()=>this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  private resize() {
    const rect=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    const scale=Math.min(2,devicePixelRatio||1);
    this.canvas.width=Math.round(this.width*scale);this.canvas.height=Math.round(this.height*scale);
    this.ctx?.setTransform(scale,0,0,scale,0,0);
  }
  emit(note:LightNote,bpm:number,now=performance.now()) {
    if(!this.ctx)return;
    this.trails.push({...note,born:now,...lightGeometry(note.beats,bpm)});
    this.strikes.push({x:note.x,born:now,hand:note.hand});
    if(!this.reduced.matches)for(let i=0;i<18;i++)this.sparks.push({
      x:note.x,y:0,vx:(this.random()-.5)*.18,vy:-.04-this.random()*.20,
      born:now,life:400+this.random()*850,size:.6+this.random()*1.6,violet:i%3===0,
    });
    this.trails=this.trails.slice(-256);this.sparks=this.sparks.slice(-900);this.strikes=this.strikes.slice(-64);
  }
  frame(now:number) {
    const ctx=this.ctx;if(!ctx)return;
    const w=this.width,h=this.height,dt=this.lastFrame?Math.min(40,now-this.lastFrame):16;
    this.lastFrame=now;ctx.clearRect(0,0,w,h);
    this.trails=this.trails.filter(n=>now-n.born<n.duration);
    this.strikes=this.strikes.filter(n=>now-n.born<550);
    this.sparks=this.sparks.filter(s=>now-s.born<s.life);
    const moving=!this.reduced.matches;

    // Quiet floating specks, confined to the stage rather than the score.
    ctx.shadowBlur=0;
    for(let i=0;i<26;i++) {
      const x=((i*173.13)%1)*w;
      const y=(h-((i*79.73+(moving?now*.007:0))%(h+30)));
      ctx.fillStyle=`rgba(174,130,218,${.10+(i%4)*.055})`;
      ctx.beginPath();ctx.arc(x,y,.7+(i%3)*.5,0,Math.PI*2);ctx.fill();
    }

    ctx.globalCompositeOperation='screen';
    for(const n of this.trails) {
      const age=now-n.born,progress=age/n.duration;
      const barWidth=Math.max(7,Math.min(30,w/52*.84));
      const x=n.x*w-barWidth/2;
      const bottom=moving?trailBottom(age,n.duration,h):h-8;
      const top=bottom-n.height;
      if(bottom< -30)continue;
      const opacity=moving?Math.min(1,Math.max(0,(1-progress)*2.4)):Math.max(0,1-progress);
      const tint=n.hand==='left'?'#a985ff':'#efb4ff';
      ctx.globalAlpha=opacity;
      ctx.shadowColor=tint;ctx.shadowBlur=20;
      const fill=ctx.createLinearGradient(x,top,x+barWidth,bottom);
      fill.addColorStop(0,'#fff7ff');fill.addColorStop(.2,n.hand==='left'?'#c4b9ff':'#f3c0f7');
      fill.addColorStop(.7,n.hand==='left'?'#7864f5':'#ba73e8');fill.addColorStop(1,'#e6c7ff');
      ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,top,barWidth,n.height,Math.min(5,barWidth*.27));ctx.fill();
      ctx.shadowBlur=5;ctx.strokeStyle='#fce9ff';ctx.lineWidth=.9;ctx.stroke();
      ctx.shadowBlur=0;ctx.globalAlpha=opacity*.65;
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(x+1.5,top+2,Math.max(1,barWidth*.13),n.height-4,2);ctx.fill();
    }
    ctx.globalAlpha=1;ctx.shadowBlur=0;

    // The bright contact line and key strikes share the same keyboard origin.
    const glow=ctx.createLinearGradient(0,h-44,0,h);
    glow.addColorStop(0,'rgba(255,151,83,0)');glow.addColorStop(1,'rgba(255,159,93,.16)');
    ctx.fillStyle=glow;ctx.fillRect(0,h-44,w,44);
    for(const s of this.strikes) {
      const p=(now-s.born)/550,x=s.x*w,r=14+p*34;
      const halo=ctx.createRadialGradient(x,h,0,x,h,r);
      halo.addColorStop(0,`rgba(255,241,216,${(1-p)*.9})`);
      halo.addColorStop(.3,`rgba(255,172,110,${(1-p)*.6})`);halo.addColorStop(1,'rgba(246,119,69,0)');
      ctx.fillStyle=halo;ctx.fillRect(x-r,h-r,r*2,r*2);
    }
    ctx.shadowColor='#ff9c5c';ctx.shadowBlur=12;ctx.strokeStyle='#ffd6ac';ctx.lineWidth=1;
    ctx.beginPath();
    const phase=moving?now*.004:0;
    for(let x=0;x<=w;x+=3) {
      const amp=this.strikes.some(s=>Math.abs(s.x*w-x)<40)?3.1:.9;
      const y=h-1-Math.abs(Math.sin(x*.23+phase)*Math.sin(x*.09-phase*1.7))*amp;
      if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();ctx.shadowBlur=0;
    for(const s of this.sparks) {
      s.x+=s.vx*dt/w;s.y+=s.vy*dt;s.vy+=.000045*dt;
      const opacity=Math.max(0,1-(now-s.born)/s.life);
      ctx.fillStyle=s.violet?`rgba(215,154,255,${opacity*.8})`:`rgba(255,210,159,${opacity})`;
      ctx.shadowColor=s.violet?'#b46bff':'#ffd49a';ctx.shadowBlur=5;
      ctx.beginPath();ctx.arc(s.x*w,h+s.y,s.size,0,Math.PI*2);ctx.fill();
    }
    ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
    if(this.lastCount!==this.trails.length){this.canvas.dataset.noteCount=String(this.trails.length);this.lastCount=this.trails.length;}
  }
  clear() {
    this.trails=[];this.sparks=[];this.strikes=[];this.lastFrame=0;this.lastCount=0;
    this.canvas.dataset.noteCount='0';this.ctx?.clearRect(0,0,this.width,this.height);
  }
  dispose() {this.clear();this.observer.disconnect();this.ctx=null;}
}
