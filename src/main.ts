import './style.css';
import { PianoAudio } from './audio';
import { Performance, Accompaniment, handForCode, KEY_ROWS, type Trigger } from './performance';
import { demoScore, waltzScore } from './score/demo';
import { importBytes } from './score/import';
import { duetScore, sourceProgress } from './score/duet';
import { beatScore } from './score/beat';
import { HANDS, noteName, validateScore, type Hand, type Score } from './score/types';
import {measureAt, measureCount, pulseAtOrAfter} from './score/meter';
import { KeyboardView, ScoreView } from './view';

const icons:Record<string,string>={
  upload:'<path d="M8 12V2m-4 4 4-4 4 4M2 11v4h12v-4"/>',
  play:'<path d="m5 3 9 5-9 5Z"/>', pause:'<path d="M5 3v10M11 3v10"/>',
  reset:'<path d="M3 6a5 5 0 1 1-1 4M3 2v4h4"/>',
  volume:'<path d="m7 3-4 3H1v4h2l4 3ZM10 5a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',
  help:'<circle cx="8" cy="8" r="6.5"/><path d="M6 6a2 2 0 1 1 3 1.7c-1 .5-1 1-1 1.3M8 11.5v.1"/>',
  close:'<path d="m4 4 8 8M4 12l8-8"/>', metro:'<path d="m8 1-5 13h10L8 1ZM8 10l5-7M5 11h6"/>',
  fullscreen:'<path d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4"/>',
};
const icon=(name:string)=>`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${icons[name]??''}</svg>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;

$('app').innerHTML=`
<main class="shell">
  <section class="score-panel" aria-label="滚动琴谱">
    <div class="score-heading"><div class="piece-info"><h2 id="title" class="piece-title"></h2><span id="composer" class="composer"></span></div><div class="score-meta"><span id="source-status">双手节奏谱</span><span id="meter">4/4</span><span>小节 <b id="measure">01 / 12</b></span></div></div>
    <div id="score" class="score-host"></div>
    <div id="duet-scores" class="duet-scores" hidden>
      ${HANDS.map(hand=>`<section class="song-lane ${hand}" aria-label="${hand==='left'?'左':'右'}手完整曲谱">
        <div class="song-controls"><label for="${hand}-library">${hand==='left'?'左':'右'}手</label><select id="${hand}-library" aria-label="${hand==='left'?'左':'右'}手曲谱"><option value="star">小星星</option><option value="elise">致爱丽丝 · 主题练习</option></select><button id="${hand}-import">导入</button><span id="${hand}-position" class="song-position"></span></div>
        <div id="${hand}-score" class="score-host"></div>
      </section>`).join('')}
    </div>
  </section>
  <div class="toolbar" role="group" aria-label="演奏控制">
    <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><h1>随奏</h1></div>
    <button id="toggle" class="primary">${icon('play')}<span>开始演奏</span></button>
    <button id="reset" class="icon-button" aria-label="从头开始" title="从头开始">${icon('reset')}</button>
    <div class="separator"></div>
    <select id="mode" aria-label="演奏模式"><option value="split">双手分谱</option><option value="duet">双曲独奏</option></select>
    <button id="beat-step" class="demo-button" aria-pressed="false" title="每次按键推进一拍">点奏</button>
    <select id="library" aria-label="选择曲谱"><option value="star">小星星</option><option value="elise">致爱丽丝 · 主题练习</option></select>
    <button id="import" class="file-button">${icon('upload')}<span>导入曲谱</span></button>
    <input id="file" class="sr-only" type="file" accept=".json,.xml,.musicxml,.mxl,.mid,.midi" aria-label="曲谱文件" />
    <button id="demo" class="demo-button" aria-pressed="false">试听</button>
    <div class="separator"></div>
    <label class="control" for="bpm">速度 <input id="bpm" type="number" value="88" min="20" max="300" step="1" /><span class="unit">BPM</span></label>
    <button id="metro" class="icon-button metro" aria-label="节拍器" aria-pressed="false" title="节拍器">${icon('metro')}</button>
    <div class="toolbar-end"><span id="sound-status" class="sound-status">钢琴</span><label class="control volume-control" for="volume">${icon('volume')}<span class="sr-only">音量</span><input id="volume" class="volume" type="range" min="0" max="100" value="70" /></label><button id="help" class="icon-button" aria-label="按键与转谱">${icon('help')}</button><button id="fullscreen" class="icon-button" aria-label="全屏演奏" title="全屏演奏">${icon('fullscreen')}</button></div>
  </div>
  <section class="stage" aria-label="发光音符演奏区">
    <canvas id="note-effects" aria-label="左手红色、右手蓝色音符，金色触键电流与粒子" role="img"></canvas>
    <div class="hand-state left"><span>左手 <b id="left-count"></b></span><small>6 / Y / G / B 及左侧<span id="left-notes" class="next-notes"></span></small></div>
    <div class="hand-state right"><span>右手 <b id="right-count"></b></span><small>7 / U / H / N 及右侧<span id="right-notes" class="next-notes"></span></small></div>
    <div id="guide" class="key-guide"><kbd>Space</kbd><span id="guide-text">开始 / 暂停</span></div>
  </section>
  <section class="piano-section" aria-label="88 键钢琴"><div id="piano" class="piano"></div></section>
  <footer class="footer"><span class="footer-status"><i id="status-dot" class="status-dot"></i><span id="status" role="status">等待演奏</span></span><span class="keyboard-range">A0 — C8 · 88 KEYS</span><div class="footer-right"><span id="progress-label">0 / 0</span><div class="progress-track"><div id="progress" class="progress-bar"></div></div></div></footer>
</main>
<div id="toast" class="toast" role="alert" hidden></div>
<div id="drop" class="drop-overlay" hidden>松开以导入曲谱</div>
<dialog id="help-dialog" aria-labelledby="help-title">
  <div class="dialog-top"><h2 id="help-title">按键与转谱</h2><button id="close-help" class="icon-button" aria-label="关闭">${icon('close')}</button></div>
  <h3>两只手，两个独立进度</h3><div id="key-map" class="keyboard-map" aria-label="左红右蓝的键盘分区"></div>
  <p>红色为左手，蓝色为右手。同手 45 毫秒内的多键合并为一次；长按不连发。一次播放下一组音符或完整和弦。空格开始 / 暂停，Esc 暂停。</p>
  <h3>双曲独奏</h3><p>左右手可分别选曲或导入，也可选同一首。每次按键推进原谱右手主旋律的一组音符，左手伴奏按拍点跟随；没有右手声部时使用左手节奏。前奏随首次按键播放，尾奏自动接续。两首曲子共用速度控件，节拍器按左侧曲谱拍号。点击某侧小节只定位该侧；切换模式从头开始，拖入文件默认导入左手。</p>
  <h3>点奏</h3><p>开启后，每次按键推进所控制曲子的一拍，拍内音符按节奏播放，休止也占一拍；长音跨拍延续，不重复触发。按曲谱拍号计算一拍，4/4为四分音符、6/8为八分音符。两手独立推进；切换点奏从头开始。</p>
  <h3>图片 / PDF 转谱</h3><p>把原谱发给聊天中的 Codex，使用本项目的转谱规范生成 .piano.json，再在这里导入。此应用支持 .piano.json、MusicXML、MXL、MIDI。</p>
  <h3>音符光效</h3><p>左红右蓝的长条从对应琴键向上浮起，长音的光条更长；八分音符上浮比四分音符快一倍。调整 BPM 会改变音长、上浮速度、试听和节拍器。</p>
  <div class="dialog-actions"><select id="export-hand" aria-label="选择导出曲谱" hidden><option value="left">左手曲谱</option><option value="right">右手曲谱</option></select><button id="export">导出当前曲谱</button><button id="format">下载转谱规范</button></div>
</dialog>`;

for(const row of KEY_ROWS) {
  const r=document.createElement('div');r.className='keyboard-row';
  row.forEach(code=>{const k=document.createElement('span');k.className=`map-key ${handForCode(code)==='right'?'r':''} ${['Digit6','KeyY','KeyG','KeyB'].includes(code)?'boundary':''}`;k.textContent=code.replace('Key','').replace('Digit','').replace('Backquote','`').replace('BracketLeft','[').replace('BracketRight',']').replace('Backslash','\\').replace('Semicolon',';').replace('Quote',"'").replace('Comma',',').replace('Period','.').replace('Slash','/').replace('Minus','-').replace('Equal','=');r.append(k);});
  $('key-map').append(r);
}

let score:Score=demoScore(), engine=new Performance(score), bpm=score.bpm;
const library=new Map<string,Score>([['star',score],['elise',waltzScore()]]);
const laneScores:Record<Hand,Score>={left:score,right:library.get('elise')!};
let duet=false,byBeat=false,importTarget:Hand|'single'='single',importSequence=0;
const laneFocus:Record<Hand,number>={left:0,right:0};
const laneCutoff:Record<Hand,number>={left:0,right:0};
const laneMeasures:Record<Hand,number>={left:0,right:0};
let active=false,demo=false,metronome=false,beatShown=0,startToken=0,importToken=0;
let demoOrigin=0,demoBase=0,metroNext=0,metroBeat=0,toastTimer:ReturnType<typeof setTimeout>;
let uiDirty=true,totalGroups=0,totalMeasures=0;
const audio=new PianoAudio(), scoreView=new ScoreView($('score')), keyboard=new KeyboardView($('piano'),$<HTMLCanvasElement>('note-effects'));
const laneViews:Record<Hand,ScoreView>={left:new ScoreView($('left-score')),right:new ScoreView($('right-score'))};
const accompaniment=new Accompaniment();
audio.onStatus=s=>$('sound-status').textContent=s;

function toast(text:string) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function update() {uiDirty=true;}
function renderUI() {
  uiDirty=false;
  const indices=engine.snapshot();
  const total=totalGroups,done=indices.left+indices.right;
  for(const hand of HANDS) {
    $(`${hand}-count`).textContent=`${indices[hand]} / ${score.hands[hand].length}${byBeat?' 拍':''}`;
    const next=engine.next(hand);
    $(`${hand}-notes`).textContent=next?(next.notes.map(n=>noteName(n.midi)).join(' · ')||(next.following?.length?'拍内音符':'休止 / 延音')):(accompaniment.pendingFor(hand)?'伴奏中':'完成');
    if(duet){const source=laneScores[hand],measure=measureAt(source,laneFocus[hand]);$(`${hand}-position`).textContent=`${measure.timeSignature.join('/')} · ${measure.pickup?'弱起':measure.number} / ${laneMeasures[hand]}`;}
  }
  $('progress-label').textContent=`${done} / ${total}${byBeat?' 拍':''}`;$('progress').style.width=`${total?done/total*100:0}%`;
  const source=duet?laneScores.left:library.get($<HTMLSelectElement>('library').value)!;
  const measure=measureAt(source,beatShown);
  $('measure').textContent=`${measure.pickup?'弱起':String(measure.number).padStart(2,'0')} / ${String(totalMeasures).padStart(2,'0')}`;
  $('meter').textContent=measure.timeSignature.join(' / ');
  const complete=engine.complete&&!accompaniment.pending;
  const label=active?'暂停':complete?'再弹一次':'开始演奏';
  if($('toggle').dataset.state!==label){$('toggle').innerHTML=`${icon(active?'pause':'play')}<span>${label}</span>`;$('toggle').dataset.state=label;}
  $('demo').setAttribute('aria-pressed',String(demo));$('demo').textContent=demo?'停止试听':'试听';
  $('status').textContent=complete?'演奏完成':demo?'正在试听':active?'跟随节奏演奏':done?'已暂停':'等待演奏';
  $('status-dot').classList.toggle('playing',active);$('guide').classList.toggle('hidden',active);
  $('guide-text').textContent=complete?'再弹一次':'开始 / 暂停';
}
function pause() {
  startToken++;active=false;demo=false;engine.clearInput();accompaniment.clear();audio.stop();keyboard.clear();update();
}
async function start(asDemo=false) {
  pause();
  if(engine.complete){engine.reset();beatShown=0;laneFocus.left=laneFocus.right=laneCutoff.left=laneCutoff.right=0;syncScores(true);}
  const token=++startToken;
  try {await audio.ready();}catch{if(token===startToken)toast('音频启动失败，请检查浏览器音频权限后重试');return;}
  if(token!==startToken)return;
  active=true;demo=asDemo;engine.clearInput();
  const next=HANDS.map(h=>engine.next(h)?.beat??Infinity);
  demoBase=Math.min(...next);demoOrigin=performance.now();resetMetronome(duet?(engine.next('left')?.beat??laneFocus.left):demoBase,demoOrigin);update();
}
function resetMetronome(beat:number,now=performance.now()) {
  const pulse=pulseAtOrAfter(score,beat);
  metroBeat=pulse.beat;metroNext=now+(pulse.beat-beat)*60000/bpm;
}
function metronomePosition() {return demo?demoBase+(performance.now()-demoOrigin)*bpm/60000:duet?laneFocus.left:beatShown;}
function syncScores(immediate=false) {
  if(duet)for(const hand of HANDS)laneViews[hand].update(sourceProgress(laneScores[hand],laneCutoff[hand]),laneFocus[hand],immediate);
  else if(byBeat){const source=library.get($<HTMLSelectElement>('library').value)!;scoreView.update({left:sourceProgress(source,laneCutoff.left).left,right:sourceProgress(source,laneCutoff.right).right},beatShown,immediate);}
  else scoreView.update(engine.snapshot(),beatShown,immediate);
}
function selectedScore():Score {
  if(duet)return duetScore(laneScores.left,laneScores.right,byBeat);
  const source=library.get($<HTMLSelectElement>('library').value)!;
  return byBeat?beatScore(source):source;
}
function setScore(next:Score,changedHand?:Hand) {
  const other:Hand=changedHand==='left'?'right':'left';
  const otherBeat=engine.next(other)?.beat??Infinity,previousBpm=bpm;
  pause();score=next;engine=new Performance(score);bpm=score.bpm;beatShown=0;
  if(changedHand){engine.seekHand(other,otherBeat);bpm=previousBpm;laneFocus[changedHand]=laneCutoff[changedHand]=0;}
  else laneFocus.left=laneFocus.right=laneCutoff.left=laneCutoff.right=0;
  totalGroups=score.hands.left.length+score.hands.right.length;
  totalMeasures=measureCount(duet?laneScores.left:library.get($<HTMLSelectElement>('library').value)!);
  $('title').textContent=score.title;$('composer').textContent=duet?'':score.composer||'自定义曲谱';
  $<HTMLInputElement>('bpm').value=String(Math.round(bpm));$('meter').textContent=score.timeSignature.join(' / ');
  $('score').hidden=duet;$('duet-scores').hidden=!duet;$('library').hidden=duet;$('import').hidden=duet;$('export-hand').hidden=!duet;$('meter').hidden=duet;$('measure').parentElement!.hidden=duet;
  $('source-status').textContent=duet?'左红 · 右蓝':'双手节奏谱';
  $('drop').textContent=duet?'松开以导入左手曲谱':'松开以导入曲谱';
  if(duet)for(const hand of HANDS){const source=laneScores[hand];laneMeasures[hand]=measureCount(source);laneViews[hand].load(source);}else scoreView.load(library.get($<HTMLSelectElement>('library').value)!);
  syncScores(true);update();
}
function emit(trigger:Trigger,tempo:number) {
  audio.play(trigger.event.notes,tempo);keyboard.emit(trigger,tempo);
  beatShown=trigger.event.beat;laneFocus[trigger.hand]=beatShown;laneCutoff[trigger.hand]=beatShown+0.0002;syncScores();update();
  if(!demo&&(!duet||trigger.hand==='left')&&measureAt(score,beatShown).timeSignature.join('/')!==measureAt(score,metroBeat).timeSignature.join('/'))resetMetronome(beatShown);
}
function flushFollowing(now=performance.now()) {for(const item of accompaniment.takeDue(now))emit(item.trigger,item.bpm);}
function finishIfComplete() {if(engine.complete&&!accompaniment.pending){active=false;demo=false;engine.clearInput();update();}}
function play(trigger:Trigger|null,origin=performance.now()) {
  if(!trigger)return;
  flushFollowing();for(const item of accompaniment.queue(trigger,bpm,origin))emit(item.trigger,item.bpm);emit(trigger,bpm);finishIfComplete();
}

function addImported(next:Score) {
  const key=`imported-${++importSequence}`;library.set(key,next);
  for(const id of ['library','left-library','right-library']){const opt=document.createElement('option');opt.value=key;opt.textContent=next.title;$(id).append(opt);}
  return key;
}
async function readFile(file:File,target:Hand|'single'=duet?'left':'single') {
  if(file.size>12*1024*1024){toast('曲谱文件最大 12 MB');return;}
  const token=++importToken;pause();$('source-status').textContent='正在读取';
  try {
    const result=importBytes(file.name,new Uint8Array(await file.arrayBuffer()));
    if(token!==importToken)return;
    const key=addImported(result.score);
    if(target==='single'){$<HTMLSelectElement>('library').value=key;setScore(selectedScore());}
    else{laneScores[target]=result.score;$<HTMLSelectElement>(`${target}-library`).value=key;setScore(selectedScore(),target);}
    try{localStorage.setItem('piano-score',JSON.stringify(result.score));}catch{toast('曲谱已导入；本机保存空间不足，刷新后需重新导入');}
    $('source-status').textContent=duet?'左红 · 右蓝':'已导入';
    if(result.warnings.length)toast(result.warnings.join('；'));
  }catch(error){if(token===importToken){$('source-status').textContent='导入失败';toast(error instanceof Error?error.message:'曲谱无法读取');}}
}

$('toggle').addEventListener('click',()=>{if(active)pause();else void start();});
$('reset').addEventListener('click',()=>{pause();engine.reset();beatShown=0;laneFocus.left=laneFocus.right=laneCutoff.left=laneCutoff.right=0;syncScores(true);update();});
$('demo').addEventListener('click',()=>{if(demo)pause();else void start(true);});
$('metro').addEventListener('click',()=>{metronome=!metronome;$('metro').setAttribute('aria-pressed',String(metronome));resetMetronome(metronomePosition());});
$('volume').addEventListener('input',()=>audio.setVolume(Number($<HTMLInputElement>('volume').value)/100));
$('bpm').addEventListener('change',()=>{
  const input=$<HTMLInputElement>('bpm'),value=Number(input.value);
  if(!Number.isFinite(value)||value<20||value>300){input.value=String(Math.round(bpm));toast('速度应为 20–300 BPM');return;}
  if(demo){demoBase+=(performance.now()-demoOrigin)*bpm/60000;demoOrigin=performance.now();}
  bpm=value;resetMetronome(metronomePosition());
});
function chooseFile(target:Hand|'single'){importToken++;importTarget=target;pause();$<HTMLInputElement>('file').click();}
$('import').addEventListener('click',()=>chooseFile('single'));
$('file').addEventListener('change',()=>{const input=$<HTMLInputElement>('file');if(input.files?.[0])void readFile(input.files[0],importTarget);input.value='';});
$('library').addEventListener('change',()=>{importToken++;setScore(selectedScore());});
$('mode').addEventListener('change',()=>{importToken++;duet=$<HTMLSelectElement>('mode').value==='duet';setScore(selectedScore());});
$('beat-step').addEventListener('click',()=>{importToken++;byBeat=!byBeat;$('beat-step').setAttribute('aria-pressed',String(byBeat));setScore(selectedScore());});
for(const hand of HANDS){
  $(`${hand}-import`).addEventListener('click',()=>chooseFile(hand));
  $(`${hand}-library`).addEventListener('change',()=>{importToken++;laneScores[hand]=library.get($<HTMLSelectElement>(`${hand}-library`).value)!;setScore(selectedScore(),hand);});
  laneViews[hand].onSeek=beat=>{pause();engine.seekHand(hand,beat);laneFocus[hand]=laneCutoff[hand]=beat;syncScores(true);update();};
}
$('help').addEventListener('click',()=>{pause();$<HTMLDialogElement>('help-dialog').showModal();});
$('close-help').addEventListener('click',()=>$<HTMLDialogElement>('help-dialog').close());
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{toast('当前窗口不支持全屏，请在独立浏览器打开');}
});
document.addEventListener('fullscreenchange',()=>{
  const label=document.fullscreenElement?'退出全屏':'全屏演奏';$('fullscreen').setAttribute('aria-label',label);$('fullscreen').title=label;
});
function download(data:string,name:string) {const url=URL.createObjectURL(new Blob([data],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').addEventListener('click',()=>{const source=duet?laneScores[$<HTMLSelectElement>('export-hand').value as Hand]:library.get($<HTMLSelectElement>('library').value)!;download(JSON.stringify({...source,bpm},null,2),`${source.title.replace(/[<>:"/\\|?*]/g,'_')}.piano.json`);});
$('format').addEventListener('click',()=>{const a=document.createElement('a');a.href='/转谱规范.txt';a.download='随奏-Codex转谱规范.txt';a.click();});
keyboard.onPress=hand=>{if(active&&!demo)play(engine.trigger(hand));};
scoreView.onSeek=beat=>{pause();engine.seek(beat);beatShown=beat;laneFocus.left=laneFocus.right=laneCutoff.left=laneCutoff.right=beat;syncScores(true);update();};

window.addEventListener('keydown',e=>{
  if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  if($<HTMLDialogElement>('help-dialog').open)return;
  const target=e.target as HTMLElement;
  if(target.closest('input,select,textarea,[contenteditable=true]'))return;
  if(e.code==='Space') {e.preventDefault();if(!e.repeat){if(active)pause();else void start();}return;}
  if(e.code==='Escape'){pause();return;}
  if(handForCode(e.code)) {e.preventDefault();if(active&&!demo)play(engine.press(e.code,e.repeat));}
});
window.addEventListener('keyup',e=>engine.release(e.code));
window.addEventListener('resize',()=>{scoreView.resize();for(const hand of HANDS)laneViews[hand].resize();});
window.addEventListener('blur',()=>{if(active)pause();else engine.clearInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('drop').hidden=false;}});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').hidden=true;}});
window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop').hidden=true;if(e.dataTransfer?.files[0])void readFile(e.dataTransfer.files[0]);});

let frameId=0;
function frame(now:number) {
  if(active)flushFollowing(now);
  if(active&&demo) {
    const beat=demoBase+(now-demoOrigin)*bpm/60000;
    for(const hand of HANDS) {
      let next=engine.next(hand),safety=0;
      while(active&&next&&next.beat<=beat+0.002&&safety++<128) {play(engine.advance(hand),demoOrigin+(next.beat-demoBase)*60000/bpm);next=engine.next(hand);}
    }
  }
  if(active){flushFollowing(now);finishIfComplete();}
  if(active&&metronome&&now>=metroNext) {
    const pulse=pulseAtOrAfter(score,metroBeat);audio.click(pulse.accent);
    metroNext+=(pulse.nextBeat-pulse.beat)*60000/bpm;metroBeat=pulse.nextBeat;
    if(now-metroNext>100)resetMetronome(metroBeat+(now-metroNext)*bpm/60000,now);
  }
  if(uiDirty)renderUI();
  keyboard.frame(now);if(duet)for(const hand of HANDS)laneViews[hand].frame();else scoreView.frame();frameId=requestAnimationFrame(frame);
}
setScore(score);
$<HTMLSelectElement>('right-library').value='elise';
try {
  const saved=localStorage.getItem('piano-score');
  if(saved)addImported(validateScore(JSON.parse(saved)));
}catch{localStorage.removeItem('piano-score');}
frameId=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{pause();cancelAnimationFrame(frameId);});
window.addEventListener('pageshow',e=>{if(e.persisted)frameId=requestAnimationFrame(frame);});
if(import.meta.hot)import.meta.hot.dispose(()=>{pause();cancelAnimationFrame(frameId);keyboard.dispose();void audio.dispose();});
