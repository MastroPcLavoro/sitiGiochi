/* ══════════════════════════════════════════════════════════════
   NEONSTORM // Protocollo Zero — LOGICA DI GIOCO (v1.6)
   v1.3 fix proiettili "fantasma" · v1.4 fix transform leak ·
   v1.5 mobile verticale · v1.6 scudo AEGIS distruttibile
   ══════════════════════════════════════════════════════════════ */
'use strict';
/* ════════ UTILS ════════ */
const TAU=Math.PI*2;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const irand=(a,b)=>Math.floor(rand(a,b+1));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const angTo=(x1,y1,x2,y2)=>Math.atan2(y2-y1,x2-x1);
const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const $=id=>document.getElementById(id);
const store=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const load=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const rm=(a,i)=>{a[i]=a[a.length-1];a.pop();};

/* ★ v1.5 — adattamento mobile */
const COARSE=matchMedia('(pointer:coarse)').matches;
const MSPD=COARSE?.9:1;
const TOPB=COARSE?96:64;

/* ════════ CANVAS ════════ */
const cv=$('cv'),ctx=cv.getContext('2d',{alpha:false});
let W=innerWidth,H=innerHeight,DPR=1,QUALITY=1,bgGrad=null,SX=0,SY=0;
function baseT(){ctx.setTransform(DPR,0,0,DPR,SX*DPR,SY*DPR);}
function rotT(x,y,co,si){ctx.setTransform(DPR*co,DPR*si,-DPR*si,DPR*co,(x+SX)*DPR,(y+SY)*DPR);}
function resize(){
  W=innerWidth;H=innerHeight;
  DPR=Math.min(devicePixelRatio||1,2)*QUALITY;
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  cv.style.width=W+'px';cv.style.height=H+'px';
  bgGrad=ctx.createLinearGradient(0,0,0,cv.height);
  bgGrad.addColorStop(0,'#0a0220');bgGrad.addColorStop(.5,'#05010d');bgGrad.addColorStop(1,'#0b0224');
  player.x=clamp(player.x,14,W-14);player.y=clamp(player.y,TOPB,H-16);
}
addEventListener('resize',resize);

/* ════════ SPRITE GLOW PRE-RENDERIZZATI (niente shadowBlur) ════════ */
const COL={cyan:'#00f0ff',mag:'#ff2bd6',lime:'#a6ff00',amber:'#ffb300',red:'#ff3355',orange:'#ff7a1a',
  violet:'#8b5cff',yellow:'#ffe14d',blue:'#8ab6ff',green:'#39ff88'};
const SPR=new Map();
function spr(color){
  let s=SPR.get(color);if(s)return s;
  const S=64,c=document.createElement('canvas');c.width=c.height=S;
  const g=c.getContext('2d'),r=S/2,gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(255,255,255,.95)');gr.addColorStop(.22,color);gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  SPR.set(color,c);return c;
}
let TINT={r:0,g:240,b:255},gridMin='',gridMaj='',tintCss=COL.cyan,rainSpr=null;
function setTint(hex){
  const n=parseInt(hex.slice(1),16);TINT={r:n>>16&255,g:n>>8&255,b:n&255};
  gridMin=`rgba(${TINT.r},${TINT.g},${TINT.b},.07)`;
  gridMaj=`rgba(${TINT.r},${TINT.g},${TINT.b},.16)`;
  tintCss=hex;
  rainSpr=document.createElement('canvas');rainSpr.width=4;rainSpr.height=64;
  const g=rainSpr.getContext('2d'),gr=g.createLinearGradient(0,0,0,64);
  gr.addColorStop(0,`rgba(${TINT.r},${TINT.g},${TINT.b},0)`);
  gr.addColorStop(1,`rgba(${TINT.r},${TINT.g},${TINT.b},.85)`);
  g.fillStyle=gr;g.fillRect(0,0,4,64);
}

/* ════════ AUDIO — synth WebAudio, zero asset ════════ */
const AU={
  ac:null,master:null,sg:null,mg:null,blp:null,dly:null,nbuf:null,
  muted:load('ns_mute')==='1',lastShoot:0,lastGraze:0,lastPop:0,
  ensure(){
    if(!this.ac){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ac=new AC();
      this.master=this.ac.createGain();this.master.gain.value=this.muted?0:.8;this.master.connect(this.ac.destination);
      this.sg=this.ac.createGain();this.sg.gain.value=.9;this.sg.connect(this.master);
      this.mg=this.ac.createGain();this.mg.gain.value=.5;this.mg.connect(this.master);
      this.blp=this.ac.createBiquadFilter();this.blp.type='lowpass';this.blp.frequency.value=380;this.blp.connect(this.mg);
      this.dly=this.ac.createDelay(1);this.dly.delayTime.value=60/SEQ.bpm/4*3;
      const fb=this.ac.createGain();fb.gain.value=.3;this.dly.connect(fb);fb.connect(this.dly);this.dly.connect(this.mg);
      this.nbuf=this.ac.createBuffer(1,this.ac.sampleRate,this.ac.sampleRate);
      const d=this.nbuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    }
    if(this.ac.state==='suspended')this.ac.resume();
  },
  tone(o){
    if(!this.ac||this.master.gain.value===0)return;
    const{type='sine',f0=440,f1,dur=.1,vol=.2,at=0,dest,echo}=o;
    const t=this.ac.currentTime+at,osc=this.ac.createOscillator(),g=this.ac.createGain();
    osc.type=type;osc.frequency.setValueAtTime(f0,t);
    if(f1&&f1!==f0)osc.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+.006);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    osc.connect(g);g.connect(dest||this.sg);if(echo)g.connect(this.dly);
    osc.start(t);osc.stop(t+dur+.06);
  },
  noise(o){
    if(!this.ac||this.master.gain.value===0)return;
    const{dur=.2,vol=.3,f=1000,type='lowpass',at=0,slide}=o;
    const t=this.ac.currentTime+at,src=this.ac.createBufferSource(),fl=this.ac.createBiquadFilter(),g=this.ac.createGain();
    src.buffer=this.nbuf;src.loop=true;fl.type=type;fl.frequency.setValueAtTime(f,t);
    if(slide)fl.frequency.exponentialRampToValueAtTime(slide,t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+.006);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    src.connect(fl);fl.connect(g);g.connect(this.sg);
    src.start(t);src.stop(t+dur+.06);
  },
  shoot(){const n=performance.now();if(n-this.lastShoot<50)return;this.lastShoot=n;this.tone({type:'square',f0:640,f1:160,dur:.06,vol:.045});},
  zap(){const n=performance.now();if(n-this.lastShoot<90)return;this.lastShoot=n;this.tone({type:'sawtooth',f0:1300,f1:800,dur:.06,vol:.03});},
  rail(){this.noise({dur:.1,vol:.2,f:3000,type:'highpass'});this.tone({type:'sawtooth',f0:1600,f1:200,dur:.13,vol:.12});},
  snipe(){this.tone({type:'square',f0:1900,f1:220,dur:.09,vol:.1});},
  ehit(){this.noise({dur:.06,vol:.12,f:1400,type:'highpass'});this.tone({f0:320,f1:90,dur:.08,vol:.09});},
  pop(){const n=performance.now();if(n-this.lastPop<55)return;this.lastPop=n;this.noise({dur:.12,vol:.2,f:1000});},
  boom(big){
    if(big){this.noise({dur:.6,vol:.5,f:900,slide:90});this.tone({f0:130,f1:24,dur:.7,vol:.5});this.tone({type:'sawtooth',f0:70,f1:18,dur:.8,vol:.3});}
    else{this.noise({dur:.22,vol:.3,f:1400,slide:140});this.tone({f0:160,f1:30,dur:.25,vol:.3});}
  },
  hurt(){this.tone({type:'sawtooth',f0:420,f1:50,dur:.4,vol:.4});this.noise({dur:.3,vol:.35,f:700,slide:120});},
  shield(){this.tone({type:'triangle',f0:1000,f1:320,dur:.22,vol:.3});},
  shatter(){this.noise({dur:.25,vol:.35,f:2600,type:'highpass',slide:400});this.tone({type:'triangle',f0:900,f1:180,dur:.3,vol:.3});},
  power(){[520,680,900].forEach((f,i)=>this.tone({type:'square',f0:f,dur:.08,vol:.15,at:i*.06}));},
  pick(){this.tone({type:'triangle',f0:760,f1:1150,dur:.12,vol:.2});},
  bomb(){this.noise({dur:.8,vol:.55,f:2400,slide:80});this.tone({f0:70,f1:16,dur:.9,vol:.55});this.tone({type:'triangle',f0:1200,f1:200,dur:.5,vol:.1});},
  warn(){for(let i=0;i<3;i++){this.tone({type:'square',f0:680,dur:.14,vol:.18,at:i*.36});this.tone({type:'square',f0:520,dur:.14,vol:.18,at:i*.36+.18});}},
  graze(){const n=performance.now();if(n-this.lastGraze<60)return;this.lastGraze=n;this.tone({f0:1600,f1:1200,dur:.03,vol:.035});},
  ui(){this.tone({type:'square',f0:700,dur:.05,vol:.12});},
  bossDown(){this.tone({f0:60,f1:14,dur:1.4,vol:.6});this.noise({dur:1.2,vol:.5,f:600,slide:60});
    [400,600,800,1000,1300].forEach((f,i)=>this.tone({type:'triangle',f0:f,dur:.3,vol:.11,at:.2+i*.12}));},
  win(){[262,330,392,523,659].forEach((f,i)=>this.tone({type:'triangle',f0:f,dur:.25,vol:.18,at:i*.11}));},
  duck(on){if(this.mg)this.mg.gain.setTargetAtTime(on?.1:.5,this.ac.currentTime,.08);}
};

/* ════════ SEQUENCER MUSICA SYNTHWAVE ════════ */
const SEQ={
  bpm:132,step:0,next:0,timer:null,
  roots:[55,43.65,65.41,49],sc:[0,3,7,10,12],
  ap:[0,1,2,3,2,1,0,1,2,3,4,3,2,1,2,1],
  start(){if(this.timer||!AU.ac)return;this.step=0;this.next=AU.ac.currentTime+.06;this.timer=setInterval(()=>this.tick(),30);},
  stop(){clearInterval(this.timer);this.timer=null;},
  tick(){
    if(this.next<AU.ac.currentTime-.05)this.next=AU.ac.currentTime+.05;
    while(this.next<AU.ac.currentTime+.12){this.play(this.step%64,this.next);this.next+=60/this.bpm/4;this.step++;}
  },
  play(s,t){
    const bar=(s/16)|0,st=s%16,root=this.roots[bar],at=t-AU.ac.currentTime;
    if(st%4===0)AU.tone({f0:160,f1:42,dur:.11,vol:.55,at});
    if(G.level>=2&&st===14)AU.tone({f0:140,f1:40,dur:.1,vol:.4,at});
    if(st===4||st===12)AU.noise({dur:.09,vol:.16,f:1600,type:'bandpass',at});
    if(st%2===1)AU.noise({dur:.03,vol:st%4===1?.07:.045,f:7000,type:'highpass',at});
    else if(G.level>=1&&st%4===2)AU.noise({dur:.02,vol:.03,f:9000,type:'highpass',at});
    if(st%2===0){const oct=st===14?2:1;AU.tone({type:'sawtooth',f0:root*oct,dur:.17,vol:.24,at,dest:AU.blp});}
    const f=220*Math.pow(2,this.sc[this.ap[st]]/12)*(bar===3?2:1);
    AU.tone({type:'square',f0:f,dur:.08,vol:.045,at,echo:true});
  }
};

/* ════════ STATO GIOCO ════════ */
const G={state:'title',phase:'idle',level:0,wave:0,score:0,hi:+load('ns_hi')||0,graze:0,kills:0,firstKills:0,
  time:0,playT:0,ts:1,tsT:1,flashA:0,freezeT:0,shakeT:0,shakeMag:0,
  bannerT:0,warnT:0,transT:0,overT:0,diff:1};
const player={x:innerWidth/2,y:innerHeight-120,r:5,hp:4,maxHp:4,shield:0,bombs:2,weapon:0,power:1,
  inv:0,fireT:0,alive:true,focus:false,overdrive:0,orbA:0,orbitT:0,trail:[]};
const WEAPONS=[
  {key:'PULSE',color:COL.cyan,rate:.09},{key:'SPREAD',color:COL.mag,rate:.17},
  {key:'HOMING',color:COL.lime,rate:.24},{key:'LASER',color:COL.orange,rate:.1},
  {key:'WAVE',color:COL.yellow,rate:.13},{key:'RAIL',color:COL.blue,rate:.30},
  {key:'ORBIT',color:COL.amber,rate:.26}];
const eBullets=[],pBullets=[],enemies=[],parts=[],rings=[],pickups=[],texts=[];
const boss={on:false,type:0,x:0,y:0,ty:150,t:0,hp:0,maxHp:0,phase:0,aT:0,bT:0,cT:0,dT:0,
  spA:0,spB:0,alt:0,cAng:0,flash:0,dying:0,dAcc:0,name:'',r:44,color:COL.mag,entered:false};
let spawnList=[],waveT=0,waveActive=false,betweenT=0,ambT=0;

/* ════════ LIVELLI ════════ */
const E=(at,type,x,n=1,gap=0)=>({at,type,x,n,gap});
const LEVELS=[
 {name:'PERIFERIA URBANA',code:'SETTORE 01',tint:COL.cyan,boss:'SENTINEL',waves:[
   [E(.4,'drone',.32,3,.4),E(.6,'drone',.68,3,.4)],
   [E(.3,'weaver',.25),E(.5,'weaver',.75),E(1.8,'drone',.5,2,.5)],
   [E(.4,'turret',.3),E(.7,'turret',.7),E(2,'dart',.5,3,.55),E(3.4,'sniper',.5)],
   [E(.5,'splitter',.5),E(1.6,'drone',.18,2,.35),E(1.9,'drone',.82,2,.35)],
   [E(.3,'weaver',.2,2,.8),E(.5,'weaver',.8,2,.8),E(2.4,'dart',.35,2,.3),E(2.6,'dart',.65,2,.3),E(3.6,'sniper',.5)]]},
 {name:'DISTRETTO DATI',code:'SETTORE 02',tint:COL.mag,boss:'NEON HYDRA',waves:[
   [E(.3,'drone',.2,4,.3),E(.5,'drone',.8,4,.3)],
   [E(.3,'weaver',.3,2,.5),E(.6,'weaver',.7,2,.5),E(2.2,'dart',.5,4,.4)],
   [E(.4,'turret',.2),E(.6,'turret',.5),E(.8,'turret',.8),E(2.4,'drone',.35,3,.35)],
   [E(.5,'splitter',.35),E(.9,'splitter',.65),E(2.6,'weaver',.5,2,.6),E(3.6,'aegis',.5)],
   [E(.3,'dart',.15,3,.35),E(.5,'dart',.85,3,.35),E(2,'turret',.5),E(2.8,'drone',.3,2,.4),E(3,'drone',.7,2,.4),E(4.2,'sniper',.25),E(4.4,'sniper',.75)],
   [E(.4,'weaver',.25,2,.6),E(.6,'weaver',.75,2,.6),E(2.2,'aegis',.35),E(2.5,'aegis',.65),E(3.8,'dart',.5,3,.3)]]},
 {name:'NUCLEO DEL SISTEMA',code:'SETTORE 03',tint:COL.orange,boss:'OVERLORD',waves:[
   [E(.3,'drone',.15,5,.28),E(.5,'drone',.85,5,.28)],
   [E(.3,'turret',.25),E(.5,'turret',.75),E(1.6,'weaver',.5,3,.5),E(3,'dart',.2,3,.3),E(3.2,'dart',.8,3,.3),E(4.2,'sniper',.5)],
   [E(.4,'splitter',.3),E(.7,'splitter',.7),E(2.2,'drone',.5,4,.3),E(3.4,'aegis',.5)],
   [E(.3,'weaver',.2,3,.45),E(.5,'weaver',.8,3,.45),E(2.4,'turret',.5),E(3.2,'dart',.35,4,.28),E(3.4,'dart',.65,4,.28),E(4.4,'sniper',.2),E(4.6,'sniper',.8)],
   [E(.4,'turret',.2),E(.6,'turret',.4),E(.8,'turret',.6),E(1,'turret',.8),E(2.6,'splitter',.5),E(3.6,'weaver',.3,2,.5),E(3.8,'weaver',.7,2,.5),E(4.6,'aegis',.3),E(4.8,'aegis',.7)],
   [E(.3,'dart',.1,5,.25),E(.5,'dart',.9,5,.25),E(2,'splitter',.35),E(2.3,'splitter',.65),E(3.8,'drone',.5,4,.3),E(5,'sniper',.5)]]}
];

/* ════════ INPUT ════════ */
const keys={};let touchFocus=false;
const stick={active:false,id:null,bx:0,by:0,dx:0,dy:0};
const stickEl=$('stick'),stickBase=$('stick-base'),stickKnob=$('stick-knob');
stickEl.addEventListener('pointerdown',e=>{
  stick.active=true;stick.id=e.pointerId;stick.bx=e.clientX;stick.by=e.clientY;stick.dx=stick.dy=0;
  stickBase.style.display=stickKnob.style.display='block';
  stickBase.style.left=(stick.bx-56)+'px';stickBase.style.top=(stick.by-56)+'px';
  stickKnob.style.left=(stick.bx-26)+'px';stickKnob.style.top=(stick.by-26)+'px';
});
addEventListener('pointermove',e=>{
  if(!stick.active||e.pointerId!==stick.id)return;
  let dx=e.clientX-stick.bx,dy=e.clientY-stick.by;const m=Math.hypot(dx,dy);
  if(m>56){dx=dx/m*56;dy=dy/m*56;}
  stick.dx=dx;stick.dy=dy;
  stickKnob.style.left=(stick.bx+dx-26)+'px';stickKnob.style.top=(stick.by+dy-26)+'px';
});
const stickEnd=e=>{if(e.pointerId===stick.id){stick.active=false;stick.dx=stick.dy=0;stickBase.style.display=stickKnob.style.display='none';}};
addEventListener('pointerup',stickEnd);addEventListener('pointercancel',stickEnd);
$('btn-bomb').addEventListener('pointerdown',e=>{e.stopPropagation();AU.ensure();doBomb();});
$('btn-focus').addEventListener('pointerdown',e=>{e.stopPropagation();touchFocus=!touchFocus;e.currentTarget.classList.toggle('on',touchFocus);});

addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  keys[e.code]=true;if(e.repeat)return;
  AU.ensure();
  if(e.code==='Space'||e.code==='KeyX')doBomb();
  if(e.code==='KeyP'||e.code==='Escape')togglePause();
  if(e.code==='KeyM')toggleMute();
  if(e.code==='Enter'){if(G.state==='title'||G.state==='over'||G.state==='victory')startGame();}
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;stickEnd({pointerId:stick.id});});
addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&G.state==='play')togglePause(true);});
addEventListener('pointerdown',()=>AU.ensure());

/* ════════ DOM refs & HUD ════════ */
const elScore=$('score'),elHi=$('hiscore'),elLevel=$('level-name'),elWave=$('wave-ind'),elFps=$('fps'),
  elGraze=$('graze-v'),elWeapon=$('weapon-name'),elBossbar=$('bossbar'),elBossNameT=$('boss-name-t'),
  elBossFill=$('boss-fill'),elBanner=$('banner'),elBannerBig=$('banner-big'),elBannerSub=$('banner-sub'),
  elWarning=$('warning'),elWarnName=$('warn-name'),elMini=$('mini'),
  elTitle=$('screen-title'),elOver=$('screen-over'),elVictory=$('screen-victory'),elPause=$('screen-pause'),
  elTitleHi=$('title-hi'),elMute=$('btn-mute'),phasePips=[...document.querySelectorAll('#bphase i')];
const hpPips=[],bombPips=[],powPips=[];
for(let i=0;i<4;i++){const s=document.createElement('span');s.className='pip';$('hp-pips').appendChild(s);hpPips.push(s);}
for(let i=0;i<5;i++){const s=document.createElement('span');s.className='pip bp off';$('bomb-pips').appendChild(s);bombPips.push(s);}
for(let i=0;i<3;i++){const s=document.createElement('span');s.className='pip pp';$('power-pips').appendChild(s);powPips.push(s);}
const UI={score:-1,hi:-1,hp:-1,bombs:-1,weapon:-1,power:-1,shield:-1,graze:-1,wv:'§',bb:false,bossP:-1,bp:-1,state:'',lv:''};
const show=el=>el.classList.remove('hidden'),hide=el=>el.classList.add('hidden');

function hud(){
  if(G.state!==UI.state){UI.state=G.state;document.body.dataset.state=G.state;}
  if(G.score!==UI.score){UI.score=G.score;elScore.textContent=String(Math.min(G.score,9999999)).padStart(7,'0');}
  if(G.hi!==UI.hi){UI.hi=G.hi;elHi.textContent=String(G.hi).padStart(7,'0');}
  if(G.graze!==UI.graze){UI.graze=G.graze;elGraze.textContent=G.graze;}
  const L=LEVELS[G.level],lt=L.code+' // '+L.name;
  if(UI.lv!==lt){UI.lv=lt;elLevel.textContent=lt;}
  let wstr='';
  if(G.state==='play'){
    if(G.phase==='waves')wstr='ONDATA '+String(Math.min(G.wave+1,L.waves.length)).padStart(2,'0')+'/'+L.waves.length;
    else if(G.phase==='boss'||G.phase==='bosswarn')wstr='— BOSS —';
    else if(G.phase==='banner')wstr='IN INGRESSO';
  }
  if(wstr!==UI.wv){UI.wv=wstr;elWave.textContent=wstr;}
  if(player.hp!==UI.hp){UI.hp=player.hp;hpPips.forEach((p,i)=>p.classList.toggle('off',i>=player.hp));}
  if(player.bombs!==UI.bombs){UI.bombs=player.bombs;bombPips.forEach((p,i)=>p.classList.toggle('off',i>=player.bombs));}
  if(player.weapon!==UI.weapon||player.power!==UI.power){
    UI.weapon=player.weapon;UI.power=player.power;
    const w=WEAPONS[player.weapon];elWeapon.textContent=w.key;
    elWeapon.style.color=w.color;elWeapon.style.textShadow='0 0 10px '+w.color;
    powPips.forEach((p,i)=>p.classList.toggle('off',i>=player.power));
  }
  const sh=player.shield?1:0;
  if(sh!==UI.shield){UI.shield=sh;$('shield-ind').classList.toggle('on',!!sh);}
  if(boss.on){
    if(!UI.bb){UI.bb=true;elBossbar.classList.add('show');}
    const r=boss.hp/boss.maxHp;
    if(Math.abs(r-UI.bossP)>.004){UI.bossP=r;elBossFill.style.transform='scaleX('+r+')';}
    if(boss.phase!==UI.bp){UI.bp=boss.phase;phasePips.forEach((p,i)=>p.classList.toggle('lit',i<=boss.phase));}
  }else if(UI.bb){UI.bb=false;elBossbar.classList.remove('show');}
}

/* ════════ EFFETTI ════════ */
function shake(mag,dur){G.shakeMag=Math.max(G.shakeMag,mag);G.shakeT=Math.max(G.shakeT,dur);}
function sparkAt(x,y,color){if(parts.length>380)return;
  parts.push({x,y,vx:rand(-70,70),vy:rand(-100,10),life:.22,max:.22,size:rand(6,12),spr:spr(color)});}
function explode(x,y,color,n=14,pw=1){
  for(let i=0;i<n;i++){if(parts.length>380)break;
    const a=rand(TAU),s=rand(50,240)*pw;
    parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.6),max:.6,
      size:rand(8,18)*Math.min(pw,1.6),spr:spr(i%3?color:'#ffffff')});}
  rings.push({x,y,r:6,vr:320*pw,life:.32,max:.32,color,w:2.5});
}
function floatText(x,y,txt,color,size=13){if(texts.length>24)texts.shift();texts.push({x,y,txt,color,size,life:1});}

/* ════════ PROIETTILI ════════ */
function eBullet(x,y,ang,spd,r,color,type){
  if(eBullets.length>=650)return null;
  spd*=MSPD;
  const b={x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,r,color,type,t:0,grazed:false,turn:2.2,dead:false};
  eBullets.push(b);return b;
}
function pb(o){if(pBullets.length>=220)return;o.t=0;pBullets.push(o);}
function ringB(x,y,n,spd,color,r,type,off=0){for(let i=0;i<n;i++)eBullet(x,y,off+i*TAU/n,spd,r,color,type);}
function aimedFan(x,y,n,spd,color,spread,r,type){
  if(!player.alive)return;const base=angTo(x,y,player.x,player.y);
  for(let i=0;i<n;i++)eBullet(x,y,base+(i-(n-1)/2)*spread,spd,r,color,type);
}
function ringGapB(x,y,n,spd,color,r,type,gapA,gapSize){
  for(let i=0;i<n;i++){const a=i*TAU/n;
    if(Math.abs(angDiff(a,gapA))<gapSize/2)continue;eBullet(x,y,a,spd,r,color,type);}
}
function homingOrb(x,y){const b=eBullet(x,y,angTo(x,y,player.x,player.y),120,9,COL.violet,'hom');if(b)b.turn=2.3;}

/* ════════ NEMICI ════════ */
/* ★ v1.6 — AEGIS: shp = resistenza dello scudo (scala con il settore) */
const EDEF={
  drone:{hp:16,r:14,score:100,color:COL.mag},
  weaver:{hp:24,r:14,score:150,color:COL.violet},
  turret:{hp:80,r:17,score:200,color:COL.amber},
  dart:{hp:8,r:10,score:80,color:COL.red},
  splitter:{hp:130,r:26,score:300,color:COL.orange},
  sniper:{hp:30,r:13,score:220,color:COL.red},
  aegis:{hp:110,r:22,score:350,color:COL.green,shp:60}};
function spawnEnemy(type,fx){
  const d=EDEF[type],hs=(1+G.level*.35)*(1+G.wave*.04),x=fx*W;
  const shp=d.shp?d.shp*hs:0;
  const e={type,x,y:-30,bx:x,t:0,ph:rand(TAU),fireT:rand(.8,1.6),hp:d.hp*hs,r:d.r,score:d.score,
    color:d.color,flash:0,spd:type==='dart'?120:0,ang:angTo(x,-30,player.x,player.y),
    ty:type==='turret'?rand(110,Math.min(190,H*.4)):
       type==='sniper'?rand(100,Math.min(230,H*.38)):
       type==='aegis'?rand(120,Math.min(240,H*.45)):0,
    shA:Math.PI/2,aim:type==='sniper'?rand(1.4,2.2):0,aimAng:Math.PI/2,
    shHp:shp,shMax:shp||1,shBroken:false,shFlash:0,dead:false};
  enemies.push(e);
  rings.push({x,y:10,r:4,vr:200,life:.25,max:.25,color:d.color,w:1.5});
  return e;
}
/* ★ v1.6 — lo scudo si spezza: ogni arma contribuisce, mai più soft-lock */
function shatterShield(e){
  if(e.shBroken)return;
  e.shBroken=true;e.shHp=0;
  explode(e.x,e.y,COL.cyan,12,.8);
  rings.push({x:e.x,y:e.y,r:e.r,vr:280,life:.3,max:.3,color:'#bfeaff',w:2.5});
  floatText(e.x,e.y-e.r-10,'SCUDO ROTTO',COL.cyan,12);
  AU.shatter();shake(3,.12);
}
function updateEnemies(dt){
  const hs=G.diff;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    if(e.dead){rm(enemies,i);continue;}
    e.t+=dt;e.flash=Math.max(0,e.flash-dt);
    if(e.type==='drone'){
      e.y+=62*dt;e.x=e.bx+Math.sin(e.t*2.1+e.ph)*34;
      e.fireT-=dt;
      if(e.fireT<=0&&e.y>40&&e.y<H*.7){e.fireT=rand(1.4,1.9)/hs;
        if(player.alive)eBullet(e.x,e.y+10,angTo(e.x,e.y,player.x,player.y),165*hs,5,COL.red,'pellet');}
      if(e.y>H+40){rm(enemies,i);continue;}
    }else if(e.type==='weaver'){
      e.y+=46*dt;e.x=e.bx+Math.sin(e.t*1.7+e.ph)*92;
      e.fireT-=dt;
      if(e.fireT<=0&&e.y>30){e.fireT=1.9/hs;aimedFan(e.x,e.y,3,150*hs,COL.violet,.35,5,'orb');}
      if(e.y>H+40){rm(enemies,i);continue;}
    }else if(e.type==='turret'){
      if(e.y<e.ty)e.y+=70*dt;
      else{e.x=e.bx+Math.sin(e.t*.8)*10;e.fireT-=dt;
        if(e.fireT<=0){e.fireT=2.3/hs;ringB(e.x,e.y,10,120*hs,COL.amber,5,'pellet',rand(TAU));AU.pop();}}
    }else if(e.type==='dart'){
      e.spd=Math.min(e.spd+420*dt,340);
      e.x+=Math.cos(e.ang)*e.spd*dt;e.y+=Math.sin(e.ang)*e.spd*dt;
      if(e.x<-40||e.x>W+40||e.y>H+40||e.y<-80){rm(enemies,i);continue;}
    }else if(e.type==='splitter'){
      e.y+=34*dt;e.x=e.bx+Math.sin(e.t*1.2+e.ph)*46;
      e.fireT-=dt;
      if(e.fireT<=0&&e.y>30){e.fireT=2.6/hs;ringB(e.x,e.y,8,110*hs,COL.orange,6,'shard',rand(TAU));}
      if(e.y>H+60){rm(enemies,i);continue;}
    }else if(e.type==='sniper'){
      if(e.y<e.ty)e.y+=80*dt;
      else{
        e.x=e.bx+Math.sin(e.t*.9+e.ph)*8;
        e.aimAng=angTo(e.x,e.y,player.x,player.y);
        e.aim-=dt;
        if(e.aim<=0){
          if(player.alive){eBullet(e.x,e.y,e.aimAng,520*hs,6,COL.red,'shard');AU.snipe();}
          e.aim=rand(1.9,2.5)/hs;
        }
      }
    }else if(e.type==='aegis'){
      e.shFlash=Math.max(0,e.shFlash-dt);
      if(e.y<e.ty)e.y+=55*dt;
      else{
        e.x=e.bx+Math.sin(e.t*.7+e.ph)*30;
        e.fireT-=dt;
        if(e.fireT<=0){e.fireT=2.8/hs;ringB(e.x,e.y,6,110*hs,COL.green,5,'pellet',rand(TAU));}
      }
      if(!e.shBroken){
        const want=angTo(e.x,e.y,player.x,player.y);
        const d=angDiff(want,e.shA);
        e.shA+=clamp(d,-1.7*dt,1.7*dt);
      }
    }
    if(player.alive&&player.inv<=0&&G.state==='play'&&
       dist2(e.x,e.y,player.x,player.y)<(e.r+player.r)*(e.r+player.r)){playerHit();}
  }
}
function damageEnemy(e,dmg){
  if(e.dead)return;e.hp-=dmg;e.flash=.07;
  if(e.hp<=0){e.dead=true;killEnemy(e);}
}
function killEnemy(e){
  G.kills++;G.firstKills++;G.score+=e.score;
  explode(e.x,e.y,e.color,e.type==='splitter'?26:14,e.type==='splitter'?1.5:1);
  AU.boom(e.type==='splitter'||e.type==='turret');shake(4,.15);
  if(e.score>=200)floatText(e.x,e.y,'+'+e.score,'#fff',12);
  rollDrop(e.x,e.y);
  if(e.type==='splitter'){
    for(const s of[-.5,.5]){const a=angTo(e.x,e.y,player.x,player.y)+s;
      const d=spawnEnemy('dart',clamp(e.x/W,0,1));d.x=e.x;d.y=e.y;d.ang=a;d.spd=140;}
  }
}
function rollDrop(x,y){
  let kind=null;
  if(G.firstKills<=2)kind='P';
  else if(Math.random()<.22){
    const tbl=[['G',32],['P',22],['W',16],['S',10],['B',10],['H',6],['O',4]];
    let tot=0;for(const t of tbl)tot+=t[1];let r=Math.random()*tot;
    for(const t of tbl){r-=t[1];if(r<=0){kind=t[0];break;}}
  }
  if(kind)spawnPickup(kind,x,y);
}

/* ════════ PICKUP ════════ */
function spawnPickup(kind,x,y){pickups.push({kind,x,y,vy:70,t:0,ph:rand(TAU),life:9});return pickups[pickups.length-1];}
function pickColor(k){return k==='W'?WEAPONS[(player.weapon+1)%WEAPONS.length].color:
  k==='P'?COL.mag:k==='S'?COL.cyan:k==='B'?COL.amber:k==='H'?COL.lime:k==='O'?'#ffffff':COL.cyan;}
function updatePickups(dt){
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i];p.t+=dt;p.life-=dt;p.y+=p.vy*dt;p.x+=Math.sin(p.t*3+p.ph)*20*dt;
    const d2=dist2(p.x,p.y,player.x,player.y);
    if(player.alive&&d2<120*120){const d=Math.sqrt(d2)||1;
      p.x+=(player.x-p.x)/d*230*dt;p.y+=(player.y-p.y)/d*230*dt;}
    if(player.alive&&d2<26*26){applyPickup(p);rm(pickups,i);continue;}
    if(p.life<=0||p.y>H+30)rm(pickups,i);
  }
}
function applyPickup(p){
  const c=pickColor(p.kind);
  if(p.kind==='G'){G.score+=150;floatText(p.x,p.y,'+150',COL.cyan,12);AU.pick();}
  else if(p.kind==='P'){if(player.power<3){player.power++;floatText(p.x,p.y,'POTENZA +',COL.mag,14);}else{G.score+=500;floatText(p.x,p.y,'+500',COL.mag,12);}AU.power();}
  else if(p.kind==='W'){player.weapon=(player.weapon+1)%WEAPONS.length;
    floatText(p.x,p.y,'ARMA: '+WEAPONS[player.weapon].key,WEAPONS[player.weapon].color,14);AU.power();}
  else if(p.kind==='S'){if(!player.shield){player.shield=1;floatText(p.x,p.y,'SCUDO',COL.cyan,14);}else{G.score+=500;floatText(p.x,p.y,'+500',COL.cyan,12);}AU.shield();}
  else if(p.kind==='B'){if(player.bombs<5){player.bombs++;floatText(p.x,p.y,'BOMBA +1',COL.amber,14);}else{G.score+=500;floatText(p.x,p.y,'+500',COL.amber,12);}AU.power();}
  else if(p.kind==='H'){if(player.hp<player.maxHp){player.hp++;floatText(p.x,p.y,'+INTEGRITÀ',COL.lime,14);}else{G.score+=500;floatText(p.x,p.y,'+500',COL.lime,12);}AU.power();}
  else if(p.kind==='O'){player.overdrive=8;floatText(p.x,p.y,'OVERDRIVE!','#ffffff',16);AU.power();}
  explode(p.x,p.y,c,6,.5);
}

/* ════════ GIOCATORE ════════ */
function orbitBlades(){
  const n=player.power+1,R=46+player.power*7,out=[];
  for(let i=0;i<n;i++){const a=player.orbA+i*TAU/n;
    out.push({x:player.x+Math.cos(a)*R,y:player.y+Math.sin(a)*R});}
  return out;
}
function updatePlayer(dt){
  let dx=0,dy=0;
  if(keys.ArrowLeft||keys.KeyA)dx-=1;if(keys.ArrowRight||keys.KeyD)dx+=1;
  if(keys.ArrowUp||keys.KeyW)dy-=1;if(keys.ArrowDown||keys.KeyS)dy+=1;
  if(stick.active){dx+=stick.dx/56;dy+=stick.dy/56;}
  const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}
  player.focus=!!(keys.ShiftLeft||keys.ShiftRight||touchFocus);
  const spd=(player.focus?155:365)*(COARSE&&W<520?.92:1);
  player.x=clamp(player.x+dx*spd*dt,14,W-14);
  player.y=clamp(player.y+dy*spd*dt,TOPB,H-16);
  player.inv-=dt;
  if(player.overdrive>0)player.overdrive-=dt;
  player.trail.push({x:player.x,y:player.y});if(player.trail.length>14)player.trail.shift();
  player.fireT-=dt;
  if(player.fireT<=0)fireWeapon();
  if(player.weapon===3)laserDamage(dt);
  if(player.weapon===6){
    player.orbA+=dt*5.2;
    player.orbitT-=dt;
    if(player.orbitT<=0){
      player.orbitT=(player.overdrive>0?.08:.12);
      const dmg=3+player.power;
      for(const b of orbitBlades()){
        for(const e of enemies){if(e.dead)continue;
          if(dist2(b.x,b.y,e.x,e.y)<(16+e.r)*(16+e.r)){
            /* ★ v1.6 — le lame rispettano lo scudo (se integro e orientato verso la lama) */
            if(e.type==='aegis'&&!e.shBroken&&Math.abs(angDiff(Math.atan2(b.y-e.y,b.x-e.x),e.shA))<.95){
              e.shHp-=dmg;e.shFlash=.12;if(e.shHp<=0)shatterShield(e);
            }else damageEnemy(e,dmg);
            sparkAt(b.x,b.y,COL.amber);
          }}
        for(const q of bossParts())
          if(dist2(b.x,b.y,q.x,q.y)<(16+q.r)*(16+q.r))damageBoss(dmg);
      }
    }
  }
  if(Math.random()<.5)parts.push({x:player.x+rand(-3,3),y:player.y+12,vx:rand(-15,15),vy:rand(60,120),
    life:.3,max:.3,size:rand(4,8),spr:spr(COL.mag)});
}
function fireWeapon(){
  const wi=player.weapon,pw=player.power,px=player.x,py=player.y-14,C=WEAPONS[wi].color;
  player.fireT=WEAPONS[wi].rate*(pw===3?.85:1)*(player.overdrive>0?.55:1);
  if(wi===0){const n=pw+2;
    for(let i=0;i<n;i++)pb({x:px+(i-(n-1)/2)*13,y:py,vx:0,vy:-660,r:5,dmg:2,kind:'p',color:C});AU.shoot();
  }else if(wi===1){const n=1+pw*2,arc=.62;
    for(let i=0;i<n;i++){const a=-Math.PI/2+(i-(n-1)/2)*(arc/(n-1));
      pb({x:px,y:py,vx:Math.cos(a)*600,vy:Math.sin(a)*600,r:5,dmg:2,kind:'p',color:C});}AU.shoot();
  }else if(wi===2){const n=pw+1;
    for(let i=0;i<n;i++){const s=i%2?1:-1;
      pb({x:px+s*10,y:py,vx:s*60,vy:-300,r:5,dmg:3,kind:'hom',spd:430,turn:7,color:C});}AU.shoot();
  }else if(wi===3){AU.zap();
  }else if(wi===4){const n=pw+1;
    for(let i=0;i<n;i++)pb({x:px,y:py,bx:px,by:py,vx:0,vy:-540,r:6,dmg:3,kind:'wave',ph:i*1.7,amp:20+pw*6,color:C});
    AU.shoot();
  }else if(wi===5){
    const pierce=2+pw*2,n=pw===3?2:1;
    for(let i=0;i<n;i++){const off=n>1?(i?10:-10):0;
      pb({x:px+off,y:py,vx:0,vy:-1150,r:6,dmg:10,kind:'rail',color:C,pierce,hits:new Set()});}
    sparkAt(px,py,C);shake(2,.05);AU.rail();
  }else if(wi===6){
    pb({x:px,y:py,vx:0,vy:-620,r:4,dmg:2,kind:'p',color:C});AU.shoot();
  }
}
function laserDamage(dt){
  const pw=player.power,bw=8+pw*3.5,dps=34+pw*14;
  for(const e of enemies){
    if(e.dead)continue;
    if(e.y<player.y&&Math.abs(e.x-player.x)<bw+e.r){
      /* ★ v1.6 — il laser consuma lo scudo invece di essere bloccato per sempre */
      if(e.type==='aegis'&&!e.shBroken){
        const down=angTo(e.x,e.y,player.x,player.y);
        if(Math.abs(angDiff(down,e.shA))<.95){
          e.shHp-=dps*dt;e.shFlash=.1;
          if(e.shHp<=0)shatterShield(e);
          if(Math.random()<.3)sparkAt(e.x,e.y+e.r*.6,'#bfeaff');
          continue;
        }
      }
      damageEnemy(e,dps*dt);
      if(Math.random()<.25)sparkAt(player.x+rand(-bw,bw),e.y,COL.orange);
    }
  }
  for(const q of bossParts())
    if(q.y<player.y&&Math.abs(q.x-player.x)<bw+q.r){damageBoss(dps*dt);
      if(Math.random()<.2)sparkAt(player.x+rand(-bw,bw),q.y+q.r*.5,COL.orange);}
}
function updatePBullets(dt){
  for(let i=pBullets.length-1;i>=0;i--){
    const p=pBullets[i];p.t+=dt;
    if(p.kind==='hom'){
      let tx=null,ty=null,bd=1e18;
      for(const e of enemies){if(e.dead)continue;const d=dist2(p.x,p.y,e.x,e.y);if(d<bd){bd=d;tx=e.x;ty=e.y;}}
      for(const q of bossParts()){const d=dist2(p.x,p.y,q.x,q.y);if(d<bd){bd=d;tx=q.x;ty=q.y;}}
      let ang=Math.atan2(p.vy,p.vx);
      if(tx!==null){const want=Math.atan2(ty-p.y,tx-p.x);
        const d=angDiff(want,ang);
        ang+=clamp(d,-p.turn*dt,p.turn*dt);}
      p.vx=Math.cos(ang)*p.spd;p.vy=Math.sin(ang)*p.spd;
      if(parts.length<360&&Math.random()<.6)
        parts.push({x:p.x,y:p.y,vx:rand(-10,10),vy:rand(10,40),life:.2,max:.2,size:5,spr:spr(p.color)});
      p.x+=p.vx*dt;p.y+=p.vy*dt;
    }else if(p.kind==='wave'){
      p.by+=p.vy*dt;p.ph+=dt*11;p.x=p.bx+Math.sin(p.ph)*p.amp;p.y=p.by;
    }else{
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.kind==='rail'&&parts.length<360&&Math.random()<.7)
        parts.push({x:p.x,y:p.y+10,vx:0,vy:60,life:.15,max:.15,size:6,spr:spr(p.color)});
    }
    if(p.y<-30||p.y>H+30||p.x<-30||p.x>W+30||p.t>4){rm(pBullets,i);continue;}
    let hit=false;
    if(p.kind==='rail'){
      /* il RAIL ignora lo scudo: perfora e danneggia direttamente lo scafo */
      for(const e of enemies){if(e.dead||p.hits.has(e))continue;const rr=e.r+p.r+2;
        if(dist2(p.x,p.y,e.x,e.y)<rr*rr){p.hits.add(e);damageEnemy(e,p.dmg);sparkAt(p.x,p.y,p.color);
          if(--p.pierce<=0){hit=true;break;}}}
      if(!hit)for(const q of bossParts()){const rr=q.r+p.r;
        if(dist2(p.x,p.y,q.x,q.y)<rr*rr){damageBoss(p.dmg);sparkAt(p.x,p.y,p.color);
          if(--p.pierce<=0){hit=true;break;}}}
    }else{
      for(const e of enemies){
        if(e.dead)continue;
        const rr=e.r+p.r+2;
        if(dist2(p.x,p.y,e.x,e.y)<rr*rr){
          /* ★ v1.6 — i colpi bloccati dallo scudo ora consumano la sua resistenza */
          if(e.type==='aegis'&&!e.shBroken){
            const ba=Math.atan2(p.y-e.y,p.x-e.x);
            if(Math.abs(angDiff(ba,e.shA))<.95){
              e.shHp-=p.dmg;e.shFlash=.12;sparkAt(p.x,p.y,'#bfeaff');
              if(e.shHp<=0)shatterShield(e);
              hit=true;break;
            }
          }
          damageEnemy(e,p.dmg);sparkAt(p.x,p.y,p.color);hit=true;break;}}
      if(!hit)for(const q of bossParts()){const rr=q.r+p.r;
        if(dist2(p.x,p.y,q.x,q.y)<rr*rr){damageBoss(p.dmg);sparkAt(p.x,p.y,p.color);hit=true;break;}}
    }
    if(hit)rm(pBullets,i);
  }
}
/* ★ FIX v1.3 — l'array eBullets viene modificato SOLO da questo loop */
function updateEBullets(dt){
  const px=player.x,py=player.y;
  for(let i=eBullets.length-1;i>=0;i--){
    const b=eBullets[i];
    if(b.dead){rm(eBullets,i);continue;}
    b.t+=dt;
    if(b.type==='hom'){
      if(b.t<2.6&&player.alive){
        const cur=Math.atan2(b.vy,b.vx),want=angTo(b.x,b.y,px,py);
        const d=angDiff(want,cur);
        const na=cur+clamp(d,-b.turn*dt,b.turn*dt),s=Math.hypot(b.vx,b.vy);
        b.vx=Math.cos(na)*s;b.vy=Math.sin(na)*s;}
      if(parts.length<360&&Math.random()<.4)
        parts.push({x:b.x,y:b.y,vx:0,vy:0,life:.25,max:.25,size:8,spr:spr(COL.violet)});
    }
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(player.alive&&player.inv<=0&&G.state==='play'){
      const rr=b.r+player.r,d2=dist2(b.x,b.y,px,py);
      if(d2<rr*rr){rm(eBullets,i);playerHit();continue;}
      const gr=rr+15;
      if(!b.grazed&&d2<gr*gr){b.grazed=true;G.graze++;G.score+=10;AU.graze();sparkAt(b.x,b.y,COL.cyan);}
    }
    if(b.x<-40||b.x>W+40||b.y<-60||b.y>H+40||b.t>14)rm(eBullets,i);
  }
}
function playerHit(){
  if(player.shield>0){player.shield--;player.inv=1.2;AU.shield();
    explode(player.x,player.y,COL.cyan,10,.8);shake(5,.2);return;}
  player.hp--;player.inv=2.4;
  AU.hurt();shake(10,.35);G.flashA=.35;G.freezeT=.05;
  for(const b of eBullets)
    if(dist2(b.x,b.y,player.x,player.y)<160*160){b.dead=true;sparkAt(b.x,b.y,b.color);}
  player.power=Math.max(1,player.power-1);
  if(player.hp<=0)playerDie();
}
function playerDie(){
  player.alive=false;
  explode(player.x,player.y,COL.cyan,40,2);explode(player.x,player.y,COL.mag,30,1.6);
  AU.boom(true);shake(16,.6);G.flashA=.6;G.tsT=.3;
  G.phase='dying';G.overT=1.8;
}
function doBomb(){
  if(G.state!=='play'||!player.alive||player.bombs<=0)return;
  player.bombs--;player.inv=Math.max(player.inv,1.8);
  AU.bomb();shake(12,.5);G.flashA=.55;
  rings.push({x:player.x,y:player.y,r:10,vr:900,life:.5,max:.5,color:COL.cyan,w:4});
  rings.push({x:player.x,y:player.y,r:10,vr:620,life:.65,max:.65,color:COL.mag,w:3});
  let g=0;
  for(let i=0;i<eBullets.length;i++){g+=5;if(i%3===0)sparkAt(eBullets[i].x,eBullets[i].y,COL.cyan);}
  eBullets.length=0;G.score+=g;
  const snap=enemies.slice();
  for(const e of snap){
    if(e.type==='aegis'&&!e.shBroken)shatterShield(e);   // ★ v1.6 — la bomba frantuma gli scudi
    damageEnemy(e,60);
  }
  damageBoss(110);
  floatText(player.x,player.y-40,'BOMB!',COL.amber,20);
}

/* ════════ BOSS ════════ */
function bossParts(){
  if(!boss.on||boss.dying>0)return[];
  if(boss.type===0)return[{x:boss.x,y:boss.y,r:50}];
  if(boss.type===1){const p=[{x:boss.x,y:boss.y,r:44}];
    for(const c of hydraCores())p.push({x:c.x,y:c.y,r:20});return p;}
  return[{x:boss.x,y:boss.y,r:58}];
}
function hydraCores(){
  const out=[];for(let i=0;i<3;i++){const a=boss.cAng+i*TAU/3;
    out.push({x:boss.x+Math.cos(a)*82,y:boss.y+Math.sin(a)*82*.62});}return out;
}
function damageBoss(dmg){
  if(!boss.on||boss.dying>0)return;
  boss.hp-=dmg;boss.flash=.06;
  if(boss.hp<=0){boss.hp=0;startBossDeath();}
}
function initBoss(li){
  const defs=[{name:'SENTINEL',hp:1600,r:46,color:COL.mag},
              {name:'NEON HYDRA',hp:2600,r:42,color:COL.violet},
              {name:'OVERLORD',hp:4000,r:54,color:COL.red}][li];
  Object.assign(boss,{on:true,type:li,x:W/2,y:-140,ty:clamp(H*.3,110,185),t:0,hp:defs.hp,maxHp:defs.hp,
    phase:0,aT:1,bT:1.6,cT:1,dT:1,spA:rand(TAU),spB:rand(TAU),alt:0,cAng:0,flash:0,dying:0,dAcc:0,
    name:defs.name,r:defs.r,color:defs.color,entered:false});
  elBossNameT.textContent=defs.name;UI.bossP=-1;UI.bp=-1;
  rings.push({x:W/2,y:boss.ty,r:10,vr:500,life:.5,max:.5,color:defs.color,w:3});
}
function onBossPhase(){
  G.freezeT=.06;G.flashA=.2;shake(7,.3);AU.warn();
  explode(boss.x,boss.y,boss.color,16,1.2);
  floatText(boss.x,boss.y-80,'FASE '+(boss.phase+1),COL.red,18);
}
function updateBoss(wdt,rdt){
  const b=boss;b.flash=Math.max(0,b.flash-rdt);
  if(b.dying>0){
    b.dying-=rdt;b.dAcc+=rdt;
    if(b.dAcc>.11){b.dAcc=0;
      explode(b.x+rand(-b.r,b.r),b.y+rand(-b.r,b.r),b.color,10,1.1);shake(5,.12);AU.pop();}
    if(b.dying<=0)bossDestroyed();
    return;
  }
  b.t+=wdt;
  if(!b.entered){b.y+=(b.ty-b.y)*Math.min(1,wdt*2.4);if(Math.abs(b.y-b.ty)<3)b.entered=true;return;}
  const p=b.hp/b.maxHp,np=p<.33?2:p<.66?1:0;
  if(np>b.phase){b.phase=np;b.aT=.6;b.bT=1;onBossPhase();}
  if(b.type===0)bossL1(wdt);else if(b.type===1)bossL2(wdt);else bossL3(wdt);
  if(player.alive&&player.inv<=0&&G.state==='play'&&
     dist2(b.x,b.y,player.x,player.y)<(b.r+player.r)*(b.r+player.r))playerHit();
}
function bossL1(dt){ /* SENTINEL */
  const b=boss;
  b.x=W/2+Math.sin(b.t*.55)*Math.min(W*.24,260);b.y=b.ty+Math.sin(b.t*.9)*16;
  b.aT-=dt;b.bT-=dt;
  if(b.phase===0){
    if(b.aT<=0){b.aT=1.3;
      if(b.alt++%2===0){ringB(b.x,b.y,20,118,COL.red,5,'pellet');aimedFan(b.x,b.y+20,3,200,COL.orange,.2,6,'shard');}
      else{aimedFan(b.x,b.y+20,5,175,COL.mag,.3,5,'orb');ringB(b.x,b.y,12,90,COL.orange,5,'pellet',b.spA);}}
  }else if(b.phase===1){
    b.spA+=dt*2.5;
    if(b.aT<=0){b.aT=.085;
      eBullet(b.x,b.y,b.spA,150,5,COL.mag,'shard');eBullet(b.x,b.y,b.spA+Math.PI,150,5,COL.mag,'shard');}
    if(b.bT<=0){b.bT=2.1;ringB(b.x,b.y,16,105,COL.red,5,'pellet',rand(TAU));}
  }else{
    b.spA+=dt*1.6;
    if(b.aT<=0){b.aT=.11;
      eBullet(b.x,b.y,b.spA,160,5,COL.orange,'shard');eBullet(b.x,b.y,b.spA+Math.PI,160,5,COL.orange,'shard');}
    if(b.bT<=0){b.bT=1.05;
      ringGapB(b.x,b.y,24,128,COL.red,5,'pellet',angTo(b.x,b.y,player.x,player.y),.9);
      aimedFan(b.x,b.y,3,230,COL.red,.18,5,'pellet');}
  }
}
function bossL2(dt){ /* NEON HYDRA */
  const b=boss;
  b.x=W/2+Math.sin(b.t*.5)*Math.min(W*.14,150);b.y=b.ty+Math.sin(b.t*.8)*14;
  b.cAng=b.t*(b.phase===2?2.4:1.2);
  b.aT-=dt;b.bT-=dt;b.cT-=dt;
  if(b.aT<=0){b.aT=b.phase===2?.62:1.0;
    for(const c of hydraCores())aimedFan(c.x,c.y,b.phase>=1?3:2,165+b.phase*35,COL.violet,.22,5,'orb');}
  if(b.bT<=0){b.bT=1.7;
    if(b.phase===2)ringGapB(b.x,b.y,22,120,COL.mag,5,'pellet',angTo(b.x,b.y,player.x,player.y),.8);
    else ringB(b.x,b.y,14,100,COL.mag,5,'pellet',rand(TAU));}
  if(b.phase>=1){b.spA+=dt*2.0;
    if(b.cT<=0){b.cT=.12;eBullet(b.x,b.y,b.spA,140,4,COL.red,'shard');}}
}
function bossL3(dt){ /* OVERLORD */
  const b=boss;
  b.x=W/2+Math.sin(b.t*.5)*Math.min(W*.2,220);b.y=b.ty+Math.sin(b.t*.7)*15;
  b.aT-=dt;b.bT-=dt;b.cT-=dt;b.dT-=dt;
  const sp=b.phase===2?3.6:2.6;
  b.spA+=dt*sp;b.spB-=dt*sp*.8;
  if(b.aT<=0){b.aT=b.phase===2?.07:.08;
    eBullet(b.x,b.y,b.spA,160,5,COL.red,'shard');eBullet(b.x,b.y,b.spA+Math.PI,160,5,COL.red,'shard');
    eBullet(b.x,b.y,b.spB,135,5,COL.mag,'pellet');eBullet(b.x,b.y,b.spB+Math.PI,135,5,COL.mag,'pellet');}
  if(b.bT<=0){
    if(b.phase===0){b.bT=2.3;aimedFan(b.x,b.y,6,210,COL.orange,.2,6,'shard');}
    else{b.bT=b.phase===2?1.7:1.5;
      ringGapB(b.x,b.y,28,120,COL.red,5,'pellet',angTo(b.x,b.y,player.x,player.y),.75);}}
  if(b.phase>=1&&b.cT<=0){b.cT=b.phase===2?2.2:1.9;homingOrb(b.x-40,b.y);homingOrb(b.x+40,b.y);}
  if(b.phase===2&&b.dT<=0){b.dT=.13;
    eBullet(rand(W),-20,Math.PI/2+rand(-.25,.25),205,5,COL.orange,'pellet');}
}
function startBossDeath(){
  if(boss.dying>0)return;
  boss.dying=2.0;G.tsT=.25;G.freezeT=.08;
  AU.bossDown();shake(10,.5);
  floatText(boss.x,boss.y-80,'DISTRUTTO',COL.yellow,20);
}
function bossDestroyed(){
  boss.on=false;
  const bonus=5000+G.level*3000;G.score+=bonus;
  floatText(boss.x,boss.y,'+'+bonus,COL.amber,22);
  explode(boss.x,boss.y,boss.color,40,2.2);explode(boss.x,boss.y,'#ffffff',24,1.6);
  ['W','P','S','H'].forEach((k,i)=>spawnPickup(k,boss.x+(i-1.5)*38,boss.y));
  G.score+=eBullets.length*5;
  for(let i=0;i<eBullets.length;i+=2)sparkAt(eBullets[i].x,eBullets[i].y,COL.cyan);
  eBullets.length=0;G.tsT=1;
  if(G.level>=LEVELS.length-1){G.phase='victoryDelay';G.transT=1.6;}
  else{G.phase='transition';G.transT=2.2;showMini('SETTORE LIBERATO');}
}

/* ════════ FLUSSO LIVELLI ════════ */
function showBanner(big,sub){elBannerBig.textContent=big;elBannerSub.textContent=sub;elBanner.classList.add('show');}
function hideBanner(){elBanner.classList.remove('show');}
function showMini(t){elMini.textContent=t;elMini.classList.remove('show');void elMini.offsetWidth;elMini.classList.add('show');}
function startLevel(li){
  const L=LEVELS[li];
  G.level=li;G.wave=0;G.diff=1+li*.15;G.phase='banner';G.bannerT=2.4;
  spawnList=[];waveActive=false;enemies.length=0;eBullets.length=0;
  setTint(L.tint);
  showBanner(L.code,L.name);
  if(li>0&&player.hp<player.maxHp){player.hp++;floatText(player.x,player.y-30,'+INTEGRITÀ',COL.lime,14);}
}
function startWave(i){
  const w=LEVELS[G.level].waves[i];spawnList=[];
  for(const ev of w)for(let k=0;k<ev.n;k++)spawnList.push({at:ev.at+k*(ev.gap||0),type:ev.type,x:ev.x});
  spawnList.sort((a,b)=>a.at-b.at);
  waveT=0;waveActive=true;
  showMini('ONDATA '+(i+1)+'/'+LEVELS[G.level].waves.length);
}
function startBossWarn(){
  G.phase='bosswarn';G.warnT=2.2;
  elWarnName.textContent=LEVELS[G.level].boss;
  elWarning.classList.add('show');AU.warn();
}
function updateFlow(wdt,rdt){
  if(G.phase==='banner'){G.bannerT-=wdt;if(G.bannerT<=0){hideBanner();G.phase='waves';startWave(0);}}
  else if(G.phase==='waves'){
    if(waveActive){
      waveT+=wdt;
      while(spawnList.length&&spawnList[0].at<=waveT){const s=spawnList.shift();spawnEnemy(s.type,s.x);}
      if(!spawnList.length&&enemies.length===0){
        waveActive=false;G.wave++;
        if(G.wave>=LEVELS[G.level].waves.length)startBossWarn();else betweenT=1.2;}
    }else{betweenT-=wdt;if(betweenT<=0)startWave(G.wave);}
  }
  else if(G.phase==='bosswarn'){G.warnT-=wdt;if(G.warnT<=0){elWarning.classList.remove('show');G.phase='boss';initBoss(G.level);}}
  else if(G.phase==='transition'){G.transT-=rdt;if(G.transT<=0)startLevel(G.level+1);}
  else if(G.phase==='dying'){G.overT-=rdt;if(G.overT<=0)showGameOver();}
  else if(G.phase==='victoryDelay'){G.transT-=rdt;if(G.transT<=0)showVictory();}
}

/* ════════ SCHERMATE ════════ */
function startGame(){
  if(G.state==='play')return;
  AU.ensure();
  hide(elTitle);hide(elOver);hide(elVictory);hide(elPause);
  G.score=0;G.graze=0;G.kills=0;G.firstKills=0;G.playT=0;G.ts=1;G.tsT=1;G.flashA=0;G.freezeT=0;
  eBullets.length=0;pBullets.length=0;enemies.length=0;pickups.length=0;parts.length=0;rings.length=0;texts.length=0;
  boss.on=false;elWarning.classList.remove('show');
  Object.assign(player,{x:W/2,y:H-120,hp:4,shield:0,bombs:2,weapon:0,power:1,inv:2,fireT:0,
    alive:true,overdrive:0,orbA:0,orbitT:0});
  player.trail.length=0;
  G.state='play';startLevel(0);
  SEQ.start();AU.duck(false);AU.ui();
  try{if('wakeLock'in navigator)navigator.wakeLock.request('screen');}catch(e){}
}
function showGameOver(){
  G.state='over';G.ts=1;G.tsT=1;
  const rec=G.score>G.hi;
  if(rec){G.hi=G.score;store('ns_hi',G.hi);}
  $('newrec').style.display=rec?'block':'none';
  $('ov-score').textContent=G.score;$('ov-hi').textContent=G.hi;
  $('ov-kills').textContent=G.kills;$('ov-graze').textContent=G.graze;$('ov-level').textContent=G.level+1;
  elWarning.classList.remove('show');show(elOver);SEQ.stop();
}
function showVictory(){
  G.state='victory';G.ts=1;G.tsT=1;
  const rec=G.score>G.hi;
  if(rec){G.hi=G.score;store('ns_hi',G.hi);}
  $('newrec2').style.display=rec?'block':'none';
  $('vi-score').textContent=G.score;$('vi-hi').textContent=G.hi;
  $('vi-kills').textContent=G.kills;$('vi-graze').textContent=G.graze;
  const m=Math.floor(G.playT/60),s=Math.floor(G.playT%60);
  $('vi-time').textContent=m+':'+String(s).padStart(2,'0');
  show(elVictory);SEQ.stop();AU.win();
}
function toTitle(){
  G.state='title';G.phase='idle';G.ts=1;G.tsT=1;
  hide(elOver);hide(elVictory);hide(elPause);show(elTitle);
  eBullets.length=0;pBullets.length=0;enemies.length=0;pickups.length=0;boss.on=false;
  elWarning.classList.remove('show');hideBanner();
  elTitleHi.textContent=String(G.hi).padStart(7,'0');
  SEQ.stop();
}
function togglePause(force){
  if(G.state==='play'&&(force===true||force===undefined)){G.state='pause';show(elPause);AU.duck(true);AU.ui();}
  else if(G.state==='pause'){G.state='play';hide(elPause);AU.duck(false);AU.ui();}
}
function toggleMute(){
  AU.muted=!AU.muted;store('ns_mute',AU.muted?'1':'0');
  if(AU.master)AU.master.gain.value=AU.muted?0:.8;
  elMute.textContent=AU.muted?'✕':'♪';elMute.classList.toggle('off',AU.muted);
}
$('btn-start').addEventListener('click',e=>{e.stopPropagation();startGame();});
elTitle.addEventListener('pointerdown',()=>{if(G.state==='title')startGame();});
$('btn-retry').addEventListener('click',startGame);
$('btn-again').addEventListener('click',startGame);
$('btn-menu1').addEventListener('click',toTitle);
$('btn-menu2').addEventListener('click',toTitle);
$('btn-menu3').addEventListener('click',toTitle);
$('btn-resume').addEventListener('click',()=>togglePause(false));
$('btn-restart').addEventListener('click',startGame);
$('btn-pause').addEventListener('click',()=>togglePause());
$('btn-mute').addEventListener('click',toggleMute);

/* ════════ AGGIORNAMENTO ════════ */
const stars=[],rain=[];
for(let i=0;i<90;i++)stars.push({x:rand(innerWidth),y:rand(innerHeight),z:rand(.25,1),s:rand(1,2.2),c:Math.random()<.3});
for(let i=0;i<12;i++)rain.push({x:rand(innerWidth),y:rand(innerHeight),len:rand(60,160),spd:rand(160,340),a:rand(.05,.16)});

function update(wdt,rdt){
  G.time+=wdt;
  if(G.state==='play')G.playT+=wdt;
  if(G.shakeT>0){G.shakeT-=rdt;SX=rand(-1,1)*G.shakeMag;SY=rand(-1,1)*G.shakeMag;
    G.shakeMag*=Math.max(0,1-7*rdt);if(G.shakeT<=0){G.shakeMag=0;SX=SY=0;}}
  if(G.flashA>0)G.flashA=Math.max(0,G.flashA-rdt*1.6);
  for(const s of stars){s.y+=(26+s.z*80)*wdt;if(s.y>H+2){s.y=-2;s.x=rand(W);}}
  for(const r of rain){r.y+=r.spd*wdt;if(r.y-r.len>H){r.y=-rand(50,300);r.x=rand(W);}}
  if(G.state==='play'){
    updateFlow(wdt,rdt);
    if(player.alive)updatePlayer(wdt);
    updatePBullets(wdt);
    updateEnemies(wdt);
    if(boss.on)updateBoss(wdt,rdt);
    updateEBullets(wdt);
    updatePickups(wdt);
  }else if(G.state==='title'){
    ambT-=wdt;
    if(ambT<=0){ambT=rand(.5,1.4);
      rings.push({x:rand(W),y:rand(H),r:4,vr:rand(60,140),life:.8,max:.8,
        color:[COL.cyan,COL.mag,COL.violet][irand(0,2)],w:1.5});}
  }
  const pdt=G.state==='play'?wdt:rdt;
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=pdt;
    if(p.life<=0){rm(parts,i);continue;}
    p.x+=p.vx*pdt;p.y+=p.vy*pdt;p.vx*=1-2.4*pdt;p.vy*=1-2.4*pdt;}
  for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.r+=r.vr*pdt;r.life-=pdt;if(r.life<=0)rm(rings,i);}
  for(let i=texts.length-1;i>=0;i--){const t=texts[i];t.y-=28*pdt;t.life-=pdt*1.1;if(t.life<=0)rm(texts,i);}
}

/* ════════ RENDER ════════ */
function hexPath(r){ctx.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6-Math.PI/2;
  i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();}
function triPath(r){ctx.beginPath();for(let i=0;i<3;i++){const a=i*TAU/3-Math.PI/2;
  i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();}
function starPath(r1,r2){ctx.beginPath();for(let i=0;i<16;i++){const r=i%2?r2:r1,a=i*TAU/16;
  i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();}
/* ★ FIX v1.4 — ripristina la trasformazione dopo ogni disegno ruotato */
function rotDraw(s,x,y,ang,w,h){
  const co=Math.cos(ang),si=Math.sin(ang);
  rotT(x,y,co,si);
  ctx.drawImage(s,-w/2,-h/2,w,h);
  baseT();
}

function drawBG(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle=bgGrad;ctx.fillRect(0,0,cv.width,cv.height);
  baseT();
  for(const s of stars){ctx.globalAlpha=.25+s.z*.55;ctx.fillStyle=s.c?tintCss:'#cfe9ff';
    ctx.fillRect(s.x,s.y,s.s,s.s+s.z*2);}
  ctx.globalAlpha=1;
  ctx.lineWidth=1;ctx.strokeStyle=gridMin;ctx.beginPath();
  for(let x=.5;x<W;x+=64){ctx.moveTo(x,0);ctx.lineTo(x,H);}
  const off=(G.time*80)%64;
  for(let y=off-64;y<H;y+=64){ctx.moveTo(0,y+.5);ctx.lineTo(W,y+.5);}
  ctx.stroke();
  ctx.strokeStyle=gridMaj;ctx.beginPath();
  const off2=(G.time*80)%256;
  for(let y=off2-256;y<H;y+=256){ctx.moveTo(0,y);ctx.lineTo(W,y);}
  ctx.stroke();
  ctx.globalCompositeOperation='lighter';
  for(const r of rain){ctx.globalAlpha=r.a;ctx.drawImage(rainSpr,r.x,r.y-r.len,3,r.len);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
function drawPickups(){
  for(const p of pickups){
    if(p.life<2&&Math.sin(G.time*14)>0)continue;
    const c=pickColor(p.kind),s=spr(c),pu=1+Math.sin(G.time*6+p.ph)*.12;
    ctx.globalCompositeOperation='lighter';
    ctx.drawImage(s,p.x-20*pu,p.y-20*pu,40*pu,40*pu);
    ctx.globalCompositeOperation='source-over';
    if(p.kind==='G'){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(G.time*2+p.ph);
      ctx.fillStyle='#eaffff';ctx.strokeStyle=c;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(6,0);ctx.lineTo(0,7);ctx.lineTo(-6,0);ctx.closePath();
      ctx.fill();ctx.stroke();ctx.restore();
    }else{
      ctx.fillStyle='rgba(5,8,22,.9)';ctx.fillRect(p.x-10,p.y-8,20,16);
      ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.strokeRect(p.x-10,p.y-8,20,16);
      ctx.fillStyle=c;ctx.font='900 11px Orbitron,sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.kind,p.x,p.y+1);
    }
  }
}
function drawEnemies(){
  for(const e of enemies){
    if(e.dead)continue;
    const s=spr(e.color),g=e.r*3.2;
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.45;
    ctx.drawImage(s,e.x-g/2,e.y-g/2,g,g);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.save();ctx.translate(e.x,e.y);
    if(e.type==='dart')ctx.rotate(e.ang+Math.PI/2);
    ctx.lineWidth=2;ctx.strokeStyle=e.flash>0?'#fff':e.color;ctx.fillStyle='rgba(8,4,20,.85)';
    if(e.type==='drone'){ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(11,-9);ctx.lineTo(0,-4);ctx.lineTo(-11,-9);ctx.closePath();ctx.fill();ctx.stroke();}
    else if(e.type==='weaver'){ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(10,0);ctx.lineTo(0,13);ctx.lineTo(-10,0);ctx.closePath();ctx.fill();ctx.stroke();}
    else if(e.type==='turret'){hexPath(16);ctx.fill();ctx.stroke();
      ctx.save();ctx.rotate(G.time*2);ctx.strokeStyle=e.flash>0?'#fff':'rgba(255,179,0,.6)';hexPath(9);ctx.stroke();ctx.restore();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,3,0,TAU);ctx.fill();}
    else if(e.type==='dart'){ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(6,10);ctx.lineTo(0,5);ctx.lineTo(-6,10);ctx.closePath();ctx.fill();ctx.stroke();}
    else if(e.type==='splitter'){ctx.beginPath();ctx.arc(0,0,e.r-4,0,TAU);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(255,122,26,.55)';ctx.beginPath();ctx.arc(0,0,e.r-11,0,TAU);ctx.stroke();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,4,0,TAU);ctx.fill();}
    else if(e.type==='sniper'){
      ctx.beginPath();ctx.arc(0,0,11,0,TAU);ctx.fill();ctx.stroke();
      ctx.save();ctx.rotate(G.time*1.5+e.ph);
      ctx.strokeStyle=e.flash>0?'#fff':'rgba(255,51,85,.7)';ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(-17,0);ctx.lineTo(-8,0);ctx.moveTo(8,0);ctx.lineTo(17,0);
      ctx.moveTo(0,-17);ctx.lineTo(0,-8);ctx.moveTo(0,8);ctx.lineTo(0,17);
      ctx.stroke();ctx.restore();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,3,0,TAU);ctx.fill();}
    else if(e.type==='aegis'){
      hexPath(e.r-4);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(57,255,136,.55)';ctx.beginPath();ctx.arc(0,0,9,0,TAU);ctx.stroke();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,3.5,0,TAU);ctx.fill();
      /* ★ v1.6 — scudo: intensità proporzionale alla resistenza, lampo bianco quando incassa */
      if(!e.shBroken){
        const sa=(.3+.7*clamp(e.shHp/e.shMax,0,1))*(e.shFlash>0?1:.85);
        ctx.save();ctx.rotate(e.shA);
        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=sa;
        ctx.strokeStyle=e.shFlash>0?'#ffffff':'rgba(0,240,255,.45)';ctx.lineWidth=9;
        ctx.beginPath();ctx.arc(0,0,e.r+7,-.9,.9);ctx.stroke();
        ctx.strokeStyle='#dff6ff';ctx.lineWidth=3;
        ctx.beginPath();ctx.arc(0,0,e.r+7,-.95,.95);ctx.stroke();
        ctx.restore();ctx.globalAlpha=1;
      }
    }
    ctx.restore();
    if(e.type==='turret'&&e.fireT<.45&&e.y>=e.ty-2&&player.alive){
      ctx.strokeStyle='rgba(255,179,0,.3)';ctx.setLineDash([4,6]);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(player.x,player.y);ctx.stroke();ctx.setLineDash([]);}
    if(e.type==='sniper'&&e.aim<.85&&e.y>=e.ty-2&&player.alive){
      const al=clamp((.85-e.aim)*1.1,.1,.65)*(Math.sin(G.time*28)>0?.75:1);
      ctx.strokeStyle='rgba(255,51,85,'+al+')';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(e.x,e.y);
      ctx.lineTo(e.x+Math.cos(e.aimAng)*950,e.y+Math.sin(e.aimAng)*950);ctx.stroke();}
  }
}
function drawBoss(){
  if(!boss.on)return;
  const b=boss,x=b.x,y=b.y;
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;
  ctx.drawImage(spr(b.color),x-110,y-110,220,220);
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if(b.dying>0&&Math.sin(G.time*40)>0)ctx.globalAlpha=.4;
  ctx.save();ctx.translate(x,y);ctx.lineWidth=3;
  const st=b.flash>0?'#fff':b.color;
  if(b.type===0){
    ctx.save();ctx.rotate(b.t*.7);ctx.strokeStyle=st;hexPath(54);ctx.stroke();ctx.restore();
    ctx.save();ctx.rotate(-b.t*1.1);ctx.strokeStyle=b.flash>0?'#fff':COL.cyan;hexPath(34);ctx.stroke();ctx.restore();
    ctx.globalCompositeOperation='lighter';
    ctx.drawImage(spr(COL.red),-26,-26,52,52);ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,10+Math.sin(G.time*6)*2,0,TAU);ctx.fill();
  }else if(b.type===1){
    const cs=hydraCores();
    ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(139,92,255,.5)';ctx.lineWidth=2;
    for(const c of cs){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(c.x-x,c.y-y);ctx.stroke();}
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=st;ctx.fillStyle='rgba(8,4,20,.85)';
    ctx.beginPath();ctx.arc(0,0,40,0,TAU);ctx.fill();ctx.stroke();
    ctx.save();ctx.rotate(b.t*1.4);ctx.strokeStyle=b.flash>0?'#fff':COL.mag;triPath(24);ctx.stroke();ctx.restore();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,9+Math.sin(G.time*7)*2,0,TAU);ctx.fill();
    for(const c of cs){ctx.save();ctx.translate(c.x-x,c.y-y);ctx.rotate(b.t*2);
      ctx.strokeStyle=b.flash>0?'#fff':COL.mag;ctx.fillStyle='rgba(8,4,20,.85)';
      triPath(15);ctx.fill();ctx.stroke();ctx.restore();}
  }else{
    ctx.save();ctx.rotate(b.t*.4);ctx.strokeStyle=st;starPath(58,40);ctx.stroke();ctx.restore();
    ctx.save();ctx.rotate(-b.t*.9);ctx.strokeStyle=b.flash>0?'#fff':COL.mag;triPath(30);ctx.stroke();ctx.restore();
    ctx.globalCompositeOperation='lighter';ctx.fillStyle=COL.amber;
    for(let i=0;i<8;i++){const a=b.t*1.4+i*TAU/8;
      ctx.beginPath();ctx.arc(Math.cos(a)*72,Math.sin(a)*72,3,0,TAU);ctx.fill();}
    ctx.drawImage(spr(COL.red),-30,-30,60,60);ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,12+Math.sin(G.time*8)*2,0,TAU);ctx.fill();
  }
  ctx.restore();ctx.globalAlpha=1;
}
function drawLaser(){
  if(G.state!=='play'||!player.alive||player.weapon!==3)return;
  const pw=player.power,px=player.x,py=player.y-14;
  const bw=(4+pw*3.5)*(1+Math.sin(G.time*42)*.12);
  ctx.globalCompositeOperation='lighter';
  const g=ctx.createLinearGradient(px-bw*4,0,px+bw*4,0);
  g.addColorStop(0,'rgba(255,122,26,0)');g.addColorStop(.5,'rgba(255,122,26,.35)');g.addColorStop(1,'rgba(255,122,26,0)');
  ctx.fillStyle=g;ctx.fillRect(px-bw*4,0,bw*8,py);
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(px-bw/2,0,bw,py);
  ctx.drawImage(spr(COL.orange),px-24,py-18,48,48);
  ctx.globalCompositeOperation='source-over';
}
function drawPBullets(){
  ctx.globalCompositeOperation='lighter';
  for(const b of pBullets){
    const s=spr(b.color);
    if(b.kind==='hom')rotDraw(s,b.x,b.y,Math.atan2(b.vy,b.vx),26,10);
    else if(b.kind==='rail'){
      rotDraw(s,b.x,b.y,Math.atan2(b.vy,b.vx),52,10);
      ctx.globalAlpha=.85;rotDraw(spr('#ffffff'),b.x,b.y,Math.atan2(b.vy,b.vx),34,4);ctx.globalAlpha=1;
    }
    else if(b.kind==='wave'){
      ctx.drawImage(s,b.x-11,b.y-11,22,22);
      ctx.globalAlpha=.4;ctx.drawImage(s,b.x-16,b.y-16,32,32);ctx.globalAlpha=1;
    }else rotDraw(s,b.x,b.y,Math.atan2(b.vy,b.vx),24,9);
  }
  baseT();ctx.globalCompositeOperation='source-over';
}
function drawEBullets(){
  ctx.globalCompositeOperation='lighter';
  for(const b of eBullets){
    const s=spr(b.color);
    if(b.type==='shard')rotDraw(s,b.x,b.y,Math.atan2(b.vy,b.vx),b.r*5.5,b.r*2.4);
    else{const d=b.r*(b.type==='hom'?5+Math.sin(G.time*10+b.t*7):4.4);
      ctx.drawImage(s,b.x-d/2,b.y-d/2,d,d);}
  }
  baseT();ctx.globalCompositeOperation='source-over';
}
function drawPlayer(){
  if(G.state!=='play'&&G.state!=='pause')return;
  const p=player;if(!p.alive)return;
  ctx.globalCompositeOperation='lighter';
  const n=p.trail.length,ts=spr(COL.cyan);
  for(let i=0;i<n;i++){const t=p.trail[i];ctx.globalAlpha=(i/n)*.22;
    ctx.drawImage(ts,t.x-9,t.y-9+(n-i)*1.4,18,18);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if(p.inv>0&&Math.sin(G.time*26)>0)ctx.globalAlpha=.35;
  if(p.overdrive>0&&(p.overdrive>2||Math.sin(G.time*20)>0)){
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.3+Math.sin(G.time*12)*.15;
    ctx.drawImage(spr(COL.mag),p.x-34,p.y-34,68,68);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  ctx.save();ctx.translate(p.x,p.y);
  ctx.globalCompositeOperation='lighter';
  const fl=9+Math.sin(G.time*42)*3;
  ctx.fillStyle='rgba(255,43,214,.8)';
  ctx.beginPath();ctx.moveTo(-4,11);ctx.lineTo(0,11+fl);ctx.lineTo(4,11);ctx.closePath();ctx.fill();
  ctx.drawImage(spr(COL.mag),-10,6,20,20);
  ctx.globalCompositeOperation='source-over';
  ctx.beginPath();ctx.moveTo(0,-16);ctx.lineTo(11,9);ctx.lineTo(4,6);ctx.lineTo(0,11);
  ctx.lineTo(-4,6);ctx.lineTo(-11,9);ctx.closePath();
  ctx.fillStyle='rgba(6,10,28,.92)';ctx.fill();
  ctx.lineWidth=2;ctx.strokeStyle=COL.cyan;ctx.stroke();
  ctx.fillStyle='#fff';ctx.fillRect(-1.5,-8,3,6);
  ctx.restore();ctx.globalAlpha=1;
  if(p.weapon===6){
    const R=46+p.power*7;
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.22;ctx.strokeStyle=COL.amber;ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(p.x,p.y,R,0,TAU);ctx.stroke();
    for(const b of orbitBlades()){
      ctx.globalAlpha=.9;ctx.drawImage(spr(COL.amber),b.x-13,b.y-13,26,26);
      ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x,b.y,3.5,0,TAU);ctx.fill();}
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  if(p.shield>0){
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.55+Math.sin(G.time*5)*.2;
    ctx.strokeStyle=COL.cyan;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,21,0,TAU);ctx.stroke();
    ctx.globalAlpha=.25;ctx.drawImage(spr(COL.cyan),p.x-30,p.y-30,60,60);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
  if(p.focus){
    ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y,3,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.5;
    const a=G.time*4;
    ctx.beginPath();ctx.arc(p.x,p.y,9,a,a+1.2);ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,9,a+Math.PI,a+Math.PI+1.2);ctx.stroke();
    ctx.globalCompositeOperation='source-over';}
}
function drawParticles(){
  ctx.globalCompositeOperation='lighter';
  for(const p of parts){const a=p.life/p.max,sz=p.size*(.5+a*.5);
    ctx.globalAlpha=a;ctx.drawImage(p.spr,p.x-sz/2,p.y-sz/2,sz,sz);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
function drawRings(){
  ctx.globalCompositeOperation='lighter';
  for(const r of rings){const a=r.life/r.max;
    ctx.globalAlpha=a;ctx.strokeStyle=r.color;ctx.lineWidth=r.w*a+.5;
    ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.stroke();}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
function drawTexts(){
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(const t of texts){ctx.globalAlpha=clamp(t.life,0,1);
    ctx.font='700 '+t.size+'px Rajdhani,sans-serif';
    ctx.fillStyle=t.color;ctx.fillText(t.txt,t.x,t.y);}
  ctx.globalAlpha=1;
}
function render(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle=bgGrad;ctx.fillRect(0,0,cv.width,cv.height);
  baseT();
  drawBG();drawPickups();drawEnemies();drawBoss();drawLaser();
  drawPBullets();drawPlayer();drawEBullets();drawParticles();drawRings();drawTexts();
  if(G.flashA>0){ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='rgba(235,248,255,'+Math.min(.85,G.flashA)+')';
    ctx.fillRect(0,0,cv.width,cv.height);}
}

/* ════════ LOOP 60FPS + QUALITÀ ADATTIVA ════════ */
let last=performance.now(),frames=0,fpsAcc=0;
function loop(now){
  requestAnimationFrame(loop);
  let rdt=(now-last)/1000;last=now;
  if(rdt>0.05)rdt=0.05;
  frames++;fpsAcc+=rdt;
  if(fpsAcc>=.5){
    const f=Math.round(frames/fpsAcc);elFps.textContent=f+' FPS';
    if(f<45&&QUALITY===1){QUALITY=.7;resize();}
    frames=0;fpsAcc=0;}
  if(G.freezeT>0){G.freezeT-=rdt;render();hud();return;}
  G.ts+=(G.tsT-G.ts)*Math.min(1,rdt*4);
  update(rdt*G.ts,rdt);
  render();hud();
}

/* ════════ AVVIO ════════ */
setTint(COL.cyan);
resize();
elMute.textContent=AU.muted?'✕':'♪';elMute.classList.toggle('off',AU.muted);
elTitleHi.textContent=String(G.hi).padStart(7,'0');
requestAnimationFrame(loop);

