import type { Pitch } from './score/types';

export class PianoAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private voices = new Set<{stop:()=>void}>();
  private samples = new Map<number,AudioBuffer>();
  private loadPromise?: Promise<void>;
  private volume = 0.7;
  onStatus?: (status:string)=>void;
  async ready() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value=-18; compressor.knee.value=18; compressor.ratio.value=5;
      this.master.gain.value=this.volume;
      this.master.connect(compressor).connect(this.context.destination);
    }
    await this.context.resume();
    if (!this.loadPromise) {
      this.loadPromise = this.loadSamples();
      // Synthesized piano remains available immediately and offline.
    }
  }
  private async loadSamples() {
    const ctx = this.context!;
    const results = await Promise.allSettled([1,2,3,4,5,6,7,8].map(async octave => {
      const response = await fetch(`/samples/C${octave}.mp3`);
      if (!response.ok) throw new Error('sample missing');
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      this.samples.set((octave+1)*12,buffer);
    }));
    this.onStatus?.(results.every(r=>r.status==='fulfilled')?'采样钢琴':'合成钢琴');
  }
  setVolume(volume:number) {
    this.volume = volume;
    if (this.context && this.master) this.master.gain.setTargetAtTime(volume,this.context.currentTime,0.03);
  }
  play(notes: readonly Pitch[], bpm:number) {
    if (!this.context || !this.master || this.context.state!=='running') return;
    const ctx=this.context, now=ctx.currentTime;
    for (const note of notes) {
      const duration=Math.min(20,Math.max(0.07,note.beats*60/bpm));
      const gain=ctx.createGain();
      gain.connect(this.master);
      const level=0.38/Math.sqrt(Math.max(1,notes.length));
      gain.gain.setValueAtTime(0,now);
      gain.gain.linearRampToValueAtTime(level,now+0.007);
      gain.gain.setTargetAtTime(level*0.5,now+0.02,0.4);
      gain.gain.setTargetAtTime(0,now+duration,0.09);
      const sources: AudioScheduledSourceNode[]=[];
      if (this.samples.size) {
        const root=[...this.samples.keys()].sort((a,b)=>Math.abs(a-note.midi)-Math.abs(b-note.midi))[0];
        const source=ctx.createBufferSource();
        source.buffer=this.samples.get(root)!;
        source.playbackRate.value=2**((note.midi-root)/12);
        source.connect(gain); source.start(now); source.stop(now+duration+0.6);
        sources.push(source);
      } else {
        const real=new Float32Array([0,1,0.3,0.18,0.09,0.05,0.02]);
        const imaginary=new Float32Array(real.length);
        const source=ctx.createOscillator();
        source.setPeriodicWave(ctx.createPeriodicWave(imaginary,real));
        source.frequency.value=440*2**((note.midi-69)/12);
        source.connect(gain);source.start(now);source.stop(now+duration+0.6);
        sources.push(source);
      }
      const voice={stop:()=>{ for (const s of sources) { try{s.stop();}catch{} s.disconnect(); } gain.disconnect(); }};
      this.voices.add(voice);
      sources[0].onended=()=>{gain.disconnect();this.voices.delete(voice);};
      // Bound voice count when the user plays faster than note releases.
      if (this.voices.size>128) { const old=this.voices.values().next().value; old?.stop(); if(old)this.voices.delete(old); }
    }
  }
  stop() { for(const v of this.voices)v.stop();this.voices.clear(); }
  click(strong:boolean) {
    if(!this.context || !this.master)return;
    const ctx=this.context, osc=ctx.createOscillator(), gain=ctx.createGain(), now=ctx.currentTime;
    osc.frequency.value=strong?1100:780; gain.gain.setValueAtTime(0.10,now); gain.gain.exponentialRampToValueAtTime(0.0001,now+0.04);
    osc.connect(gain).connect(this.master);osc.start();osc.stop(now+0.05);
    const voice={stop:()=>{try{osc.stop();}catch{}osc.disconnect();gain.disconnect();}};
    this.voices.add(voice);osc.onended=()=>{voice.stop();this.voices.delete(voice);};
  }
  async dispose() { this.stop();await this.context?.close();this.samples.clear(); }
}
