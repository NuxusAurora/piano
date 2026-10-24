import './style.css';
import { PianoAudio } from './audio';
import { Performance, handForCode, KEY_ROWS, type Trigger } from './performance';
import { demoScore, waltzScore } from './score/demo';
import { importBytes } from './score/import';
import { HANDS, noteName, scoreEnd, validateScore, type Score } from './score/types';
import { KeyboardView, ScoreView } from './view';

const icons:Record<string,string>={
  upload:'<path d="M8 12V2m-4 4 4-4 4 4M2 11v4h12v-4"/>',
  play:'<path d="m5 3 9 5-9 5Z"/>', pause:'<path d="M5 3v10M11 3v10"/>',
  reset:'<path d="M3 6a5 5 0 1 1-1 4M3 2v4h4"/>',
  volume:'<path d="m7 3-4 3H1v4h2l4 3ZM10 5a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',
  help:'<circle cx="8" cy="8" r="6.5"/><path d="M6 6a2 2 0 1 1 3 1.7c-1 .5-1 1-1 1.3M8 11.5v.1"/>',
  close:'<path d="m4 4 8 8M4 12l8-8"/>', metro:'<path d="m8 1-5 13h10L8 1ZM8 10l5-7M5 11h6"/>',
  hand:'<path d="M9 27c-3-3-6-6-6-10 0-2 2-2 3-1l3 3V6c0-3 4-3 4 0v8-11c0-3 4-3 4 0v11-9c0-3 4-3 4 0v9-6c0-3 4-3 4 0v12c0 3-2 6-4 8"/>',
};
const icon=(name:string)=>`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${icons[name]??''}</svg>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;

$('app').innerHTML=`
<main class="shell">
  <header class="header">
    <div class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><h1>随奏</h1><small>RHYTHM PIANO</small></div></div>
    <select id="library" aria-label="选择曲谱"><option value="star">小星星</option><option value="elise">致爱丽丝 · 主题练习</option></select>
    <button id="import" class="file-button">${icon('upload')}导入曲谱</button>
    <button id="help" class="icon-button" aria-label="按键与转谱">${icon('help')}</button>
    <input id="file" class="sr-only" type="file" accept=".json,.xml,.musicxml,.mxl,.mid,.midi" aria-label="曲谱文件" />
  </header>
  <div class="toolbar" role="group" aria-label="演奏控制">
    <button id="toggle" class="primary">${icon('play')}<span>开始演奏</span></button>
    <button id="reset" class="icon-button" aria-label="从头开始" title="从头开始">${icon('reset')}</button>
    <div class="separator"></div>
    <label class="control" for="bpm">速度 <input id="bpm" type="number" value="88" min="20" max="300" step="1" /><span class="unit">BPM</span></label>
    <button id="metro" class="icon-button metro" aria-label="节拍器" aria-pressed="false" title="节拍器">${icon('metro')}</button>
    <div class="separator"></div>
    <button id="demo" class="demo-button" aria-pressed="false">试听</button>
    <div class="toolbar-end"><span id="sound-status" class="sound-status">钢琴</span><label class="control" for="volume">${icon('volume')}<span class="sr-only">音量</span><input id="volume" class="volume" type="range" min="0" max="100" value="70" /></label></div>
  </div>
  <section class="score-panel" aria-label="滚动琴谱">
    <div class="score-heading"><div><h2 id="title" class="piece-title"></h2><div id="composer" class="composer"></div></div><span class="score-badge"><i></i><span id="source-status">双手节奏谱</span></span></div>
    <div id="score" class="score-host"></div>
    <div class="score-foot"><span>小节 <b id="measure">01 / 12</b></span><span id="meter">4/4</span><span>点击小节定位</span></div>
  </section>
  <section class="stage" aria-label="钢琴音符气泡">
    <div class="stage-grid" aria-hidden="true"></div><div class="center-mark" aria-hidden="true"></div>
    <div class="hand-state left"><svg class="hand-symbol" viewBox="0 0 30 32" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">${icons.hand}</svg><div class="hand-label">左手 <span id="left-count" class="notes"></span><small>6 / Y / G / B 及左侧<span id="left-notes" class="notes"></span></small></div></div>
    <div class="hand-state right"><svg class="hand-symbol" viewBox="0 0 30 32" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">${icons.hand}</svg><div class="hand-label">右手 <span id="right-count" class="notes"></span><small>7 / U / H / N 及右侧<span id="right-notes" class="notes"></span></small></div></div>
    <div id="guide" class="key-guide"><kbd>Space</kbd><span id="guide-text">开始 / 暂停</span><span>·</span><span>任意键跟随节奏</span></div>
    <div id="bubbles" class="bubbles"></div>
  </section>
  <section class="piano-section" aria-label="88 键钢琴"><div class="piano-rail"><span>A0 — C8</span><span>ACOUSTIC PIANO</span><span>88 KEYS</span></div><div id="piano" class="piano"></div></section>
  <footer class="footer"><span class="footer-status"><i id="status-dot" class="status-dot"></i><span id="status" role="status">等待演奏</span></span><div class="footer-right"><span id="progress-label">0 / 0</span><div class="progress-track"><div id="progress" class="progress-bar"></div></div><span>v0.1</span></div></footer>
</main>
<div id="toast" class="toast" role="alert" hidden></div>
<div id="drop" class="drop-overlay" hidden>松开以导入曲谱</div>
<dialog id="help-dialog" aria-labelledby="help-title">
  <div class="dialog-top"><h2 id="help-title">按键与转谱</h2><button id="close-help" class="icon-button" aria-label="关闭">${icon('close')}</button></div>
  <h3>两只手，两个独立进度</h3><div id="key-map" class="keyboard-map" aria-label="左蓝右灰的键盘分区"></div>
  <p>蓝色为左手，灰色为右手。同手 45 毫秒内的多键合并为一次；长按不连发。一次播放下一组音符或完整和弦。空格开始 / 暂停，Esc 暂停。</p>
  <h3>图片 / PDF 转谱</h3><p>把原谱发给聊天中的 Codex，使用本项目的转谱规范生成 .piano.json，再在这里导入。此应用支持 .piano.json、MusicXML、MXL、MIDI。</p>
  <h3>气泡时值</h3><p>同一速度下，八分音符的气泡比四分音符快一倍。调整 BPM 会改变音长、气泡速度、试听和节拍器。</p>
  <div class="dialog-actions"><button id="export">导出当前曲谱</button><button id="format">下载转谱规范</button></div>
</dialog>`;

for(const row of KEY_ROWS) {
  const r=document.createElement('div');r.className='keyboard-row';
  row.forEach(code=>{const k=document.createElement('span');k.className=`map-key ${handForCode(code)==='right'?'r':''} ${['Digit6','KeyY','KeyG','KeyB'].includes(code)?'boundary':''}`;k.textContent=code.replace('Key','').replace('Digit','').replace('Backquote','`').replace('BracketLeft','[').replace('BracketRight',']').replace('Backslash','\\').replace('Semicolon',';').replace('Quote',"'").replace('Comma',',').replace('Period','.').replace('Slash','/').replace('Minus','-').replace('Equal','=');r.append(k);});
  $('key-map').append(r);
}

let score:Score=demoScore(), engine=new Performance(score), bpm=score.bpm;
let active=false,demo=false,metronome=false,beatShown=0,startToken=0,importToken=0;
let demoOrigin=0,demoBase=0,metroNext=0,metroCount=0,toastTimer:ReturnType<typeof setTimeout>;
let importedScore:Score|undefined;
const audio=new PianoAudio(), scoreView=new ScoreView($('score')), keyboard=new KeyboardView($('piano'),$('bubbles'));
audio.onStatus=s=>$('sound-status').textContent=s;

function toast(text:string) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function update() {
  const indices=engine.snapshot();
  const total=score.hands.left.length+score.hands.right.length,done=indices.left+indices.right;
  for(const hand of HANDS) {
    $(`${hand}-count`).textContent=`${indices[hand]} / ${score.hands[hand].length}`;
    $(`${hand}-notes`).textContent=engine.next(hand)?.notes.map(n=>noteName(n.midi)).join(' · ')??'完成';
  }
  $('progress-label').textContent=`${done} / ${total}`;$('progress').style.width=`${done/total*100}%`;
  const meter=score.timeSignature[0]*4/score.timeSignature[1];
  $('measure').textContent=`${String(Math.floor(beatShown/meter)+1).padStart(2,'0')} / ${String(Math.ceil(scoreEnd(score)/meter)).padStart(2,'0')}`;
  $('toggle').innerHTML=`${icon(active?'pause':'play')}<span>${active?'暂停':engine.complete?'再弹一次':'开始演奏'}</span>`;
  $('demo').setAttribute('aria-pressed',String(demo));$('demo').textContent=demo?'停止试听':'试听';
  $('status').textContent=engine.complete?'演奏完成':demo?'正在试听':active?'跟随节奏演奏':done?'已暂停':'等待演奏';
  $('status-dot').classList.toggle('playing',active);$('guide').classList.toggle('hidden',active);
  $('guide-text').textContent=engine.complete?'再弹一次':'开始 / 暂停';
}
function pause() {
  startToken++;active=false;demo=false;engine.clearInput();audio.stop();keyboard.clear();update();
}
async function start(asDemo=false) {
  pause();
  if(engine.complete){engine.reset();beatShown=0;scoreView.update(engine.snapshot(),0,true);}
  const token=++startToken;
  try {await audio.ready();}catch{if(token===startToken)toast('音频启动失败，请检查浏览器音频权限后重试');return;}
  if(token!==startToken)return;
  active=true;demo=asDemo;engine.clearInput();
  const next=HANDS.map(h=>engine.next(h)?.beat??Infinity);
  demoBase=Math.min(...next);demoOrigin=performance.now();metroNext=demoOrigin;metroCount=Math.round(demoBase/(4/score.timeSignature[1]));update();
}
function setScore(next:Score) {
  pause();score=next;engine=new Performance(score);bpm=score.bpm;beatShown=0;
  $('title').textContent=score.title;$('composer').textContent=score.composer||'自定义曲谱';
  $<HTMLInputElement>('bpm').value=String(Math.round(bpm));$('meter').textContent=score.timeSignature.join(' / ');
  scoreView.load(score);update();
}
function play(trigger:Trigger|null) {
  if(!trigger)return;
  audio.play(trigger.event.notes,bpm);keyboard.emit(trigger,bpm);
  beatShown=trigger.event.beat;scoreView.update(engine.snapshot(),beatShown);update();
  if(engine.complete){active=false;demo=false;engine.clearInput();update();}
}

async function readFile(file:File) {
  if(file.size>12*1024*1024){toast('曲谱文件最大 12 MB');return;}
  const token=++importToken;pause();$('source-status').textContent='正在读取';
  try {
    const result=importBytes(file.name,new Uint8Array(await file.arrayBuffer()));
    if(token!==importToken)return;
    importedScore=result.score;setScore(result.score);
    let opt=$<HTMLOptionElement>('imported-option');
    if(!opt){opt=document.createElement('option');opt.value='imported';opt.id='imported-option';$('library').append(opt);}
    opt.textContent=result.score.title;$<HTMLSelectElement>('library').value='imported';
    try{localStorage.setItem('piano-score',JSON.stringify(result.score));}catch{toast('曲谱已导入；本机保存空间不足，刷新后需重新导入');}
    $('source-status').textContent='已导入';
    if(result.warnings.length)toast(result.warnings.join('；'));
  }catch(error){if(token===importToken){$('source-status').textContent='导入失败';toast(error instanceof Error?error.message:'曲谱无法读取');}}
}

$('toggle').addEventListener('click',()=>{if(active)pause();else void start();});
$('reset').addEventListener('click',()=>{pause();engine.reset();beatShown=0;scoreView.update(engine.snapshot(),0,true);update();});
$('demo').addEventListener('click',()=>{if(demo)pause();else void start(true);});
$('metro').addEventListener('click',()=>{metronome=!metronome;$('metro').setAttribute('aria-pressed',String(metronome));metroNext=performance.now();metroCount=0;});
$('volume').addEventListener('input',()=>audio.setVolume(Number($<HTMLInputElement>('volume').value)/100));
$('bpm').addEventListener('change',()=>{
  const input=$<HTMLInputElement>('bpm'),value=Number(input.value);
  if(!Number.isFinite(value)||value<20||value>300){input.value=String(Math.round(bpm));toast('速度应为 20–300 BPM');return;}
  if(demo){demoBase+=(performance.now()-demoOrigin)*bpm/60000;demoOrigin=performance.now();}
  bpm=value;metroNext=performance.now();
});
$('import').addEventListener('click',()=>$<HTMLInputElement>('file').click());
$('file').addEventListener('change',()=>{const input=$<HTMLInputElement>('file');if(input.files?.[0])void readFile(input.files[0]);input.value='';});
$('library').addEventListener('change',()=>{importToken++;const v=$<HTMLSelectElement>('library').value;setScore(v==='elise'?waltzScore():v==='imported'&&importedScore?importedScore:demoScore());$('source-status').textContent=v==='imported'?'已导入':'双手节奏谱';});
$('help').addEventListener('click',()=>{pause();$<HTMLDialogElement>('help-dialog').showModal();});
$('close-help').addEventListener('click',()=>$<HTMLDialogElement>('help-dialog').close());
function download(data:string,name:string) {const url=URL.createObjectURL(new Blob([data],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').addEventListener('click',()=>download(JSON.stringify({...score,bpm},null,2),`${score.title.replace(/[<>:"/\\|?*]/g,'_')}.piano.json`));
$('format').addEventListener('click',()=>{const a=document.createElement('a');a.href='/转谱规范.txt';a.download='随奏-Codex转谱规范.txt';a.click();});
keyboard.onPress=hand=>{if(active&&!demo)play(engine.trigger(hand));};
scoreView.onSeek=beat=>{pause();engine.seek(beat);beatShown=beat;scoreView.update(engine.snapshot(),beat,true);update();};

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
window.addEventListener('resize',()=>scoreView.update(engine.snapshot()));
window.addEventListener('blur',()=>{if(active)pause();else engine.clearInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('drop').hidden=false;}});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').hidden=true;}});
window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop').hidden=true;if(e.dataTransfer?.files[0])void readFile(e.dataTransfer.files[0]);});

let frameId=0;
function frame(now:number) {
  if(active&&demo) {
    const beat=demoBase+(now-demoOrigin)*bpm/60000;
    for(const hand of HANDS) {
      let next=engine.next(hand),safety=0;
      while(active&&next&&next.beat<=beat+0.002&&safety++<128) {play(engine.advance(hand));next=engine.next(hand);}
    }
  }
  if(active&&metronome&&now>=metroNext) {
    audio.click(metroCount%score.timeSignature[0]===0);metroCount++;
    metroNext+=60000/bpm*4/score.timeSignature[1];if(now-metroNext>100)metroNext=now+60000/bpm*4/score.timeSignature[1];
  }
  keyboard.frame(now);scoreView.frame();frameId=requestAnimationFrame(frame);
}
setScore(score);
try {
  const saved=localStorage.getItem('piano-score');
  if(saved){importedScore=validateScore(JSON.parse(saved));const opt=document.createElement('option');opt.id='imported-option';opt.value='imported';opt.textContent=importedScore.title;$('library').append(opt);}
}catch{localStorage.removeItem('piano-score');}
frameId=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{pause();cancelAnimationFrame(frameId);});
window.addEventListener('pageshow',e=>{if(e.persisted)frameId=requestAnimationFrame(frame);});
if(import.meta.hot)import.meta.hot.dispose(()=>{pause();cancelAnimationFrame(frameId);void audio.dispose();});
