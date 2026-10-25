import type { Trigger } from './performance';
import { PianoEffects } from './effects';
import { HANDS, noteName, scoreEnd, type Hand, type Score } from './score/types';
import {measureAt, measuresBetween} from './score/meter';

const svgNS='http://www.w3.org/2000/svg';
function el(name:string, attrs:Record<string,string|number>={}, text?:string): SVGElement {
  const e=document.createElementNS(svgNS,name);
  for(const [key,v]of Object.entries(attrs))e.setAttribute(key,String(v));
  if(text!==undefined)e.textContent=text;
  return e;
}
const line=(x1:number,y1:number,x2:number,y2:number,color='#51485e')=>el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':0.8});
const black=(midi:number)=>[1,3,6,8,10].includes(midi%12);
function lowerBound(events:readonly {beat:number}[],beat:number) {
  let lo=0,hi=events.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].beat<beat)lo=mid+1;else hi=mid;}
  return lo;
}

export class ScoreView {
  private score?:Score;
  private indices:Record<Hand,number>={left:0,right:0};
  private focus=0;
  private offset=0;
  private target=0;
  private group?:SVGElement;
  private end=0;
  private width=0;
  private renderedWidth=-1;
  private renderedFrom=-1;
  private pending=false;
  private meterNodes:SVGElement[]=[];
  private shownMeter='';
  private motion=matchMedia('(prefers-reduced-motion: reduce)');
  private rests:Record<Hand,{beat:number;beats:number}[]>={left:[],right:[]};
  private notes:Record<Hand,Map<number,{node:SVGElement;state:number}>>={left:new Map(),right:new Map()};
  private cursors:Partial<Record<Hand,{node:SVGElement;position:string}>>={};
  private readonly clipId:string;
  private static sequence=0;
  onSeek?:(beat:number)=>void;
  constructor(private host:HTMLElement) {this.clipId=`score-clip-${ScoreView.sequence++}`;}
  load(score:Score) {
    this.score=score;this.end=scoreEnd(score);this.focus=0;this.offset=0;this.target=0;this.indices={left:0,right:0};
    this.renderedFrom=-1;this.renderedWidth=-1;
    for(const hand of HANDS){
      let occupiedUntil=0;this.rests[hand]=[];
      for(const e of score.hands[hand]){
        if(e.beat>occupiedUntil+.01)this.rests[hand].push({beat:occupiedUntil,beats:e.beat-occupiedUntil});
        occupiedUntil=Math.max(occupiedUntil,e.beat+Math.max(...e.notes.map(n=>n.beats)));
      }
    }
    this.resize();this.commit();
  }
  resize() {
    this.width=Math.max(620,this.host.clientWidth*236/(this.host.clientHeight||236));
    this.pending=true;
  }
  update(indices:Record<Hand,number>, focus?:number, immediate=false) {
    this.indices={...indices};
    if(focus!==undefined) {this.focus=focus;this.target=Math.max(0,focus-2)*76;if(immediate)this.offset=this.target;}
    this.pending=true;
    if(immediate){this.commit();this.group?.setAttribute('transform',`translate(${-this.offset},0)`);}
  }
  frame() {
    if(this.pending)this.commit();
    if(this.offset===this.target)return;
    const reduced=this.motion.matches;
    this.offset += (this.target-this.offset)*(reduced?1:0.12);
    if(Math.abs(this.target-this.offset)<0.1)this.offset=this.target;
    this.group?.setAttribute('transform',`translate(${-this.offset},0)`);
  }
  private commit() {
    if(!this.score)return;
    const from=measureAt(this.score,Math.max(0,this.focus-12)).beat;
    if(from!==this.renderedFrom||this.width!==this.renderedWidth)this.render();
    const signature=measureAt(this.score,this.focus).timeSignature,key=signature.join('/');
    if(key!==this.shownMeter){this.meterNodes.forEach((n,i)=>n.textContent=String(signature[i%2]));this.shownMeter=key;}
    this.highlight();this.pending=false;
  }
  private highlight() {
    if(!this.score)return;
    for(const hand of HANDS){
      const next=this.indices[hand];
      for(const [i,n]of this.notes[hand]){
        const state=i<next?2:i===next?1:0;
        if(n.state!==state){n.node.setAttribute('color',state===1?'#e3bdff':state===2?'#756687':'#e4dfed');n.node.setAttribute('class',state===1?'score-note next':'score-note');n.state=state;}
      }
      const cursor=this.cursors[hand],event=this.score.hands[hand][next];
      const position=event?`translate(${172+event.beat*76},0)`:'none';
      if(cursor&&cursor.position!==position){
        cursor.node.setAttribute('visibility',event?'visible':'hidden');
        if(event)cursor.node.setAttribute('transform',position);
        cursor.position=position;
      }
    }
  }
  private render() {
    if(!this.score)return;
    const score=this.score, current=measureAt(score,this.focus);
    const from=measureAt(score,Math.max(0,this.focus-12)).beat;
    const width=this.width;
    this.renderedWidth=width;this.renderedFrom=from;
    this.notes={left:new Map(),right:new Map()};this.cursors={};
    const svg=el('svg',{viewBox:`0 0 ${width} 236`,role:'group','aria-label':'左右手五线谱，可点击小节定位'}) as SVGSVGElement;
    const defs=el('defs'),clip=el('clipPath',{id:this.clipId});clip.append(el('rect',{x:110,y:0,width:width-110,height:236}));defs.append(clip);svg.append(defs);
    for(const base of [54,154])for(let n=0;n<5;n++)svg.append(line(0,base+n*10,width,base+n*10,'#4b4357'));
    const clipped=el('g',{'clip-path':`url(#${this.clipId})`}),group=el('g',{transform:`translate(${-this.offset},0)`});clipped.append(group);svg.append(clipped);
    for(const measure of measuresBetween(score,from,Math.min(this.end+current.beats,from+48))) {
      const b=measure.beat,change=score.meterChanges?.some(c=>Math.abs(c.beat-b)<1e-7);
      const label=measure.pickup?'弱起':String(measure.number).padStart(2,'0')+(change?` · ${measure.timeSignature.join('/')}`:'');
      const x=150+b*76;
      group.append(line(x,54,x,194,'#5b506b'));
      if(b<this.end)group.append(el('text',{x:x+7,y:27,fill:'#a599b3','font-size':11,'font-family':'Consolas, monospace'},label));
      const hit=el('rect',{x,y:30,width:measure.beats*76,height:180,fill:'transparent',class:'measure-hit',tabindex:0,role:'button','data-beat':b,'aria-label':measure.pickup?'定位到弱起':`定位到第 ${measure.number} 小节`});
      hit.addEventListener('click',()=>this.onSeek?.(b));hit.addEventListener('keydown',e=>{const k=e as KeyboardEvent;if(k.key==='Enter'){k.preventDefault();this.onSeek?.(b);}});if(b<this.end)group.append(hit);
    }
    for(const hand of HANDS) {
      const base=hand==='right'?54:154;
      const bottom=hand==='right'?30:18; // diatonic E4 / G2 bottom staff line
      const rests=this.rests[hand];
      for(let i=lowerBound(rests,from-1);i<rests.length&&rests[i].beat<=from+48;i++) {
        const rest=rests[i],gap=rest.beats;
        group.append(el('text',{x:172+rest.beat*76,y:base+30,'font-family':'"Segoe UI Symbol",serif','font-size':28,fill:'#ab9ebc'},gap>=4?'𝄻':gap>=2?'𝄼':gap>=1?'𝄽':'𝄾'));
      }
      const events=score.hands[hand];
      for(let index=lowerBound(events,from-1);index<events.length&&events[index].beat<=from+48;index++){
        const event=events[index];
        const x=172+event.beat*76;
        const isNext=index===this.indices[hand],past=index<this.indices[hand];
        const color=isNext?'#e3bdff':past?'#756687':'#e4dfed';
        const g=el('g',{'data-hand':hand,'data-index':index,class:isNext?'score-note next':'score-note',color,fill:'currentColor'});
        this.notes[hand].set(index,{node:g,state:isNext?1:past?2:0});
        let minY=Infinity,maxY=-Infinity;
        const pitches=event.notes.map(n=>{
          const spelling=n.spelling??noteName(n.midi);
          const match=/^([A-G])([#b]?)(-?\d)$/.exec(spelling)!;
          const step=Number(match[3])*7+['C','D','E','F','G','A','B'].indexOf(match[1]);
          return {n,y:base+40-(step-bottom)*5,accidental:match[2]};
        });
        for(const {n,y,accidental} of pitches) {
          minY=Math.min(minY,y);maxY=Math.max(maxY,y);
          for(let ly=base-10;ly>=y-1;ly-=10)g.append(line(x-10,ly,x+10,ly,'currentColor'));
          for(let ly=base+50;ly<=y+1;ly+=10)g.append(line(x-10,ly,x+10,ly,'currentColor'));
          g.append(el('ellipse',{cx:x,cy:y,rx:7,ry:4.7,transform:`rotate(-18 ${x} ${y})`,fill:n.beats>=2?'#111016':'currentColor',stroke:'currentColor','stroke-width':1.7}));
          if(accidental)g.append(el('text',{x:x-23,y:y+5,'font-size':19},accidental==='#'?'♯':'♭'));
          const dotted=[0.1875,0.375,0.75,1.5,3,6].some(v=>Math.abs(n.beats-v)<0.001);
          if(dotted)g.append(el('circle',{cx:x+14,cy:y-2,r:1.8}));
        }
        const actualDuration=Math.min(...event.notes.map(n=>n.beats));
        const triplet=[1/6,1/3,2/3,4/3].some(v=>Math.abs(v-actualDuration)<0.001);
        const duration=triplet?actualDuration*1.5:actualDuration;
        if(triplet)g.append(el('text',{x:x-3,y:minY-39,'font-size':11},'3'));
        if(duration<4) {
          g.append(line(x+6,maxY,x+6,minY-30,'currentColor'));
          if(duration<1)for(let flag=0;flag<Math.min(3,Math.max(1,Math.round(Math.log2(1/duration))));flag++)g.append(el('path',{d:`M ${x+6} ${minY-30+flag*7} q 16 8 6 21 q 4 -11 -6 -14`,fill:'currentColor'}));
        }
        group.append(g);
      }
      const cursor=el('g');
      cursor.append(el('line',{x1:0,y1:base-19,x2:0,y2:base+57,stroke:'#d5a2ff','stroke-width':1,opacity:.55}),el('circle',{cx:0,cy:base-22,r:3,fill:'#dfb6ff'}));
      group.append(cursor);this.cursors[hand]={node:cursor,position:''};
    }
    // Fixed clefs and meter mask the scrolling staff.
    svg.append(el('rect',{x:0,y:29,width:110,height:190,fill:'#111016'}));
    for(const base of [54,154])for(let n=0;n<5;n++)svg.append(line(0,base+n*10,110,base+n*10,'#4b4357'));
    svg.append(el('text',{x:21,y:96,'font-size':65,'font-family':'"Segoe UI Symbol", serif',fill:'#d5cede'},'𝄞'));
    svg.append(el('text',{x:25,y:191,'font-size':51,'font-family':'"Segoe UI Symbol", serif',fill:'#d5cede'},'𝄢'));
    this.meterNodes=[];this.shownMeter=current.timeSignature.join('/');
    for(const y of [72,172])for(let i=0;i<2;i++){
      const node=el('text',{x:84,y:y+i*20,'font-size':20,'font-family':'Georgia',fill:'#d5cede','data-meter':i},String(current.timeSignature[i]));
      this.meterNodes.push(node);svg.append(node);
    }
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
