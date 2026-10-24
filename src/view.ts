import type { Trigger } from './performance';
import { PianoEffects } from './effects';
import { HANDS, noteName, scoreEnd, type Hand, type Score } from './score/types';

const svgNS='http://www.w3.org/2000/svg';
function el(name:string, attrs:Record<string,string|number>={}, text?:string): SVGElement {
  const e=document.createElementNS(svgNS,name);
  for(const [key,v]of Object.entries(attrs))e.setAttribute(key,String(v));
  if(text!==undefined)e.textContent=text;
  return e;
}
const line=(x1:number,y1:number,x2:number,y2:number,color='#51485e')=>el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':0.8});
const black=(midi:number)=>[1,3,6,8,10].includes(midi%12);

export class ScoreView {
  private score?:Score;
  private indices:Record<Hand,number>={left:0,right:0};
  private focus=0;
  private offset=0;
  private target=0;
  private group?:SVGElement;
  onSeek?:(beat:number)=>void;
  constructor(private host:HTMLElement) {}
  load(score:Score) {this.score=score;this.focus=0;this.offset=0;this.target=0;this.indices={left:0,right:0};this.render();}
  update(indices:Record<Hand,number>, focus?:number, immediate=false) {
    this.indices=indices;
    if(focus!==undefined) {this.focus=focus;this.target=Math.max(0,focus-2)*76;if(immediate)this.offset=this.target;}
    this.render();
  }
  frame() {
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.offset += (this.target-this.offset)*(reduced?1:0.12);
    if(Math.abs(this.target-this.offset)<0.1)this.offset=this.target;
    this.group?.setAttribute('transform',`translate(${-this.offset},0)`);
  }
  private render() {
    if(!this.score)return;
    const score=this.score, meter=score.timeSignature[0]*4/score.timeSignature[1];
    const from=Math.max(0,Math.floor((this.focus-12)/meter)*meter);
    const width=Math.max(620,this.host.clientWidth*236/(this.host.clientHeight||236));
    const svg=el('svg',{viewBox:`0 0 ${width} 236`,role:'group','aria-label':'左右手五线谱，可点击小节定位'}) as SVGSVGElement;
    const defs=el('defs'),clip=el('clipPath',{id:'score-clip'});clip.append(el('rect',{x:110,y:0,width:width-110,height:236}));defs.append(clip);svg.append(defs);
    for(const base of [54,154])for(let n=0;n<5;n++)svg.append(line(0,base+n*10,width,base+n*10,'#4b4357'));
    const clipped=el('g',{'clip-path':'url(#score-clip)'}),group=el('g',{transform:`translate(${-this.offset},0)`});clipped.append(group);svg.append(clipped);
    for(let b=from;b<=Math.min(scoreEnd(score)+meter,from+48);b+=meter) {
      const x=150+b*76;
      group.append(line(x,54,x,194,'#5b506b'));
      if(b<scoreEnd(score))group.append(el('text',{x:x+7,y:27,fill:'#a599b3','font-size':11,'font-family':'Consolas, monospace'},String(Math.floor(b/meter)+1).padStart(2,'0')));
      const hit=el('rect',{x,y:30,width:meter*76,height:180,fill:'transparent',class:'measure-hit',tabindex:0,role:'button','aria-label':`定位到第 ${Math.floor(b/meter)+1} 小节`});
      hit.addEventListener('click',()=>this.onSeek?.(b));hit.addEventListener('keydown',e=>{const k=e as KeyboardEvent;if(k.key==='Enter'){k.preventDefault();this.onSeek?.(b);}});if(b<scoreEnd(score))group.append(hit);
    }
    for(const hand of HANDS) {
      const base=hand==='right'?54:154;
      const bottom=hand==='right'?30:18; // diatonic E4 / G2 bottom staff line
      let occupiedUntil=0;
      for(const event of score.hands[hand]) {
        if(event.beat>occupiedUntil+0.01) {
          const gap=event.beat-occupiedUntil;
          if(occupiedUntil>=from-1 && occupiedUntil<=from+48)group.append(el('text',{x:172+occupiedUntil*76,y:base+30,'font-family':'"Segoe UI Symbol",serif','font-size':28,fill:'#ab9ebc'},gap>=4?'𝄻':gap>=2?'𝄼':gap>=1?'𝄽':'𝄾'));
        }
        occupiedUntil=Math.max(occupiedUntil,event.beat+Math.max(...event.notes.map(n=>n.beats)));
      }
      score.hands[hand].forEach((event,index)=>{
        if(event.beat<from-1 || event.beat>from+48)return;
        const x=172+event.beat*76;
        const isNext=index===this.indices[hand],past=index<this.indices[hand];
        const color=isNext?'#e3bdff':past?'#756687':'#e4dfed';
        const g=el('g',{'data-hand':hand,'data-index':index,class:isNext?'score-note next':'score-note',fill:color});
        let minY=Infinity,maxY=-Infinity;
        const pitches=event.notes.map(n=>{
          const spelling=n.spelling??noteName(n.midi);
          const match=/^([A-G])([#b]?)(-?\d)$/.exec(spelling)!;
          const step=Number(match[3])*7+['C','D','E','F','G','A','B'].indexOf(match[1]);
          return {n,y:base+40-(step-bottom)*5,accidental:match[2]};
        });
        for(const {n,y,accidental} of pitches) {
          minY=Math.min(minY,y);maxY=Math.max(maxY,y);
          for(let ly=base-10;ly>=y-1;ly-=10)g.append(line(x-10,ly,x+10,ly,color));
          for(let ly=base+50;ly<=y+1;ly+=10)g.append(line(x-10,ly,x+10,ly,color));
          g.append(el('ellipse',{cx:x,cy:y,rx:7,ry:4.7,transform:`rotate(-18 ${x} ${y})`,fill:n.beats>=2?'#111016':color,stroke:color,'stroke-width':1.7}));
          if(accidental)g.append(el('text',{x:x-23,y:y+5,'font-size':19},accidental==='#'?'♯':'♭'));
          const dotted=[0.1875,0.375,0.75,1.5,3,6].some(v=>Math.abs(n.beats-v)<0.001);
          if(dotted)g.append(el('circle',{cx:x+14,cy:y-2,r:1.8}));
        }
        const actualDuration=Math.min(...event.notes.map(n=>n.beats));
        const triplet=[1/6,1/3,2/3,4/3].some(v=>Math.abs(v-actualDuration)<0.001);
        const duration=triplet?actualDuration*1.5:actualDuration;
        if(triplet)g.append(el('text',{x:x-3,y:minY-39,'font-size':11},'3'));
        if(duration<4) {
          g.append(line(x+6,maxY,x+6,minY-30,color));
          if(duration<1)for(let flag=0;flag<Math.min(3,Math.max(1,Math.round(Math.log2(1/duration))));flag++)g.append(el('path',{d:`M ${x+6} ${minY-30+flag*7} q 16 8 6 21 q 4 -11 -6 -14`,fill:color}));
        }
        if(isNext) {
          g.append(el('line',{x1:x,y1:base-19,x2:x,y2:base+57,stroke:'#d5a2ff','stroke-width':1,opacity:0.55}));
          g.append(el('circle',{cx:x,cy:base-22,r:3,fill:'#dfb6ff'}));
        }
        group.append(g);
      });
    }
    // Fixed clefs and meter mask the scrolling staff.
    svg.append(el('rect',{x:0,y:29,width:110,height:190,fill:'#111016'}));
    for(const base of [54,154])for(let n=0;n<5;n++)svg.append(line(0,base+n*10,110,base+n*10,'#4b4357'));
    svg.append(el('text',{x:21,y:96,'font-size':65,'font-family':'"Segoe UI Symbol", serif',fill:'#d5cede'},'𝄞'));
    svg.append(el('text',{x:25,y:191,'font-size':51,'font-family':'"Segoe UI Symbol", serif',fill:'#d5cede'},'𝄢'));
    for(const y of [72,172]) {svg.append(el('text',{x:84,y,'font-size':20,'font-family':'Georgia',fill:'#d5cede'},String(score.timeSignature[0])));svg.append(el('text',{x:84,y:y+20,'font-size':20,'font-family':'Georgia',fill:'#d5cede'},String(score.timeSignature[1])));}
    this.host.replaceChildren(svg);this.group=group;
  }
}

export class KeyboardView {
  private keys=new Map<number,HTMLButtonElement>();
  private positions=new Map<number,number>();
  private activeUntil=new Map<number,number>();
  private effects:PianoEffects;
  onPress?:(hand:Hand)=>void;
  constructor(private host:HTMLElement,canvas:HTMLCanvasElement) {
    this.effects=new PianoEffects(canvas);
    const whites=Array.from({length:88},(_,i)=>i+21).filter(n=>!black(n));
    let whiteIndex=0;
    for(let midi=21;midi<=108;midi++) {
      const isBlack=black(midi),position=isBlack?(whiteIndex-0.31)/whites.length:whiteIndex/whites.length;
      const key=document.createElement('button');
      key.className=`piano-key ${isBlack?'black':'white'}`;
      key.style.left=`${position*100}%`;key.style.width=`${(isBlack?0.62:1)/whites.length*100}%`;
      key.dataset.midi=String(midi);key.setAttribute('aria-label',noteName(midi));key.tabIndex=-1;
      if(midi%12===0) {const label=document.createElement('span');label.textContent=noteName(midi);key.append(label);}
      key.addEventListener('pointerdown',e=>{e.preventDefault();this.onPress?.(midi<60?'left':'right');});
      this.host.append(key);this.keys.set(midi,key);this.positions.set(midi,position*100+(isBlack?0.31:0.5)/whites.length*100);
      if(!isBlack)whiteIndex++;
    }
  }
  emit(trigger:Trigger,bpm:number) {
    const now=performance.now();
    for(const n of trigger.event.notes) {
      this.activeUntil.set(n.midi,Math.max(now+n.beats*60000/bpm,this.activeUntil.get(n.midi)??0));
      this.keys.get(n.midi)?.classList.add('pressed');
      this.effects.emit({x:(this.positions.get(n.midi)??50)/100,beats:n.beats,midi:n.midi,hand:trigger.hand},bpm,now);
    }
  }
  frame(now:number) {for(const [midi,until]of this.activeUntil)if(now>=until){this.keys.get(midi)?.classList.remove('pressed');this.activeUntil.delete(midi);}this.effects.frame(now);}
  clear() {this.effects.clear();for(const key of this.keys.values())key.classList.remove('pressed');this.activeUntil.clear();}
  dispose() {this.clear();this.effects.dispose();}
}
