import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useGetMe } from "@workspace/api-client-react";
import dragonGoldImg from "../assets/dragon-gold-ai.png";
import dragonBlueImg from "../assets/dragon-blue-ai.png";
import treasureChestImg from "../assets/treasure-chest-ai.png";
import casinoTableImg from "../assets/casino-table.png";
import diceCupImg from "../assets/dice-cup-nobg.png";
import bgCasinoImg from "../assets/bg-casino.png";

// ── Web Audio casino sounds (no external files needed) ──────────────────────
function getAudioCtx(): AudioContext | null {
  try { return new AudioContext(); } catch { return null; }
}

function playChip() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = "sine"; o.frequency.setValueAtTime(1200, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
  g.gain.setValueAtTime(0.4, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  o.start(); o.stop(ctx.currentTime + 0.12);
}

function playShake() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / ctx.sampleRate;
    const env = t < 1.6 ? Math.sin(Math.PI * t / 1.6) : 0;
    // clicks every ~0.15s simulate dice rattling
    const click = Math.sin(2 * Math.PI * i / 1500) * Math.exp(-((i % 6615) / 1000));
    d[i] = (Math.random() * 2 - 1) * 0.06 * env + click * 0.35 * env;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 0.7;
  src.connect(g); g.connect(ctx.destination); src.start();
}

function playWin() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.13;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.start(t); o.stop(t + 0.45);
  });
  // coin jingle: burst of high pings
  for (let i = 0; i < 8; i++) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "triangle"; o.frequency.value = 900 + Math.random() * 600;
    const t = ctx.currentTime + 0.5 + i * 0.07;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.18);
  }
}

function playLose() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = "sawtooth";
  o.frequency.setValueAtTime(300, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.5);
  g.gain.setValueAtTime(0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  o.start(); o.stop(ctx.currentTime + 0.6);
}

function playJackpot() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Fanfare: ascending fifth-based chord progression
  const fanfare = [392,494,587,740,880,1047,1319];
  fanfare.forEach((freq, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "square"; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.15;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.05);
    g.gain.setValueAtTime(0.22, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.start(t); o.stop(t + 0.6);
  });
  // Coin shower
  for (let i = 0; i < 20; i++) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "triangle"; o.frequency.value = 800 + Math.random() * 800;
    const t = ctx.currentTime + 0.8 + i * 0.1;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.start(t); o.stop(t + 0.22);
  }
}

// ── Casino BGM — looping ambient melody ─────────────────────────────────────
let _bgmCtx: AudioContext | null = null;
let _bgmRunning = false;
let _bgmGain: GainNode | null = null;

function startCasinoBGM() {
  if (_bgmRunning) return;
  try {
    if (!_bgmCtx || _bgmCtx.state === "closed") _bgmCtx = new AudioContext();
    if (_bgmCtx.state === "suspended") _bgmCtx.resume().catch(()=>{});
    const ctx = _bgmCtx;
    _bgmRunning = true;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 3);
    master.connect(ctx.destination);
    _bgmGain = master;

    // Soft echo via delay feedback
    const del = ctx.createDelay(0.4);
    const delG = ctx.createGain();
    del.delayTime.value = 0.24;
    delG.gain.value = 0.26;
    del.connect(delG); delG.connect(del); delG.connect(master);

    // C major pentatonic: C4 D4 E4 G4 A4 C5 D5 E5
    const P = [261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25];

    const MELODY:[number,number,number][] = [
      [0,4,0.8],[0.5,5,0.4],[1,6,0.4],[1.5,5,0.8],
      [2.5,4,0.4],[3,2,0.4],[3.5,4,0.8],
      [4.5,5,0.4],[5,6,0.4],[5.5,7,0.8],
      [6.5,5,0.4],[7,4,0.4],[7.5,2,1.0],
    ];
    const BEAT = 0.48;
    const LOOP = 8 * BEAT;

    function pNote(freq:number,t:number,dur:number,vol=0.22,type:OscillatorType="sine"){
      const o=ctx.createOscillator();const g=ctx.createGain();
      o.connect(g);g.connect(master);g.connect(del);
      o.type=type;o.frequency.value=freq;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+0.04);
      g.gain.setValueAtTime(vol,t+dur-0.05);g.gain.linearRampToValueAtTime(0,t+dur);
      o.start(t);o.stop(t+dur+0.05);
    }
    function pBass(t:number){
      const o=ctx.createOscillator();const g=ctx.createGain();
      o.connect(g);g.connect(master);o.type="sine";
      o.frequency.setValueAtTime(65,t);o.frequency.exponentialRampToValueAtTime(50,t+0.3);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.45,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.35);o.start(t);o.stop(t+0.38);
    }
    function pSpark(t:number){
      const freq=P[4+Math.floor(Math.random()*4)]*2;
      const o=ctx.createOscillator();const g=ctx.createGain();
      o.connect(g);g.connect(master);o.type="triangle";o.frequency.value=freq;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.12,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.18);o.start(t);o.stop(t+0.2);
    }

    let nextT = ctx.currentTime + 0.1;
    function scheduleLoop(){
      if(!_bgmRunning) return;
      const t0=nextT;
      MELODY.forEach(([b,n,d])=>pNote(P[n],t0+b*BEAT,d*BEAT));
      [0,2,4,6].forEach(b=>pBass(t0+b*BEAT));
      for(let i=0;i<3;i++) pSpark(t0+Math.random()*7*BEAT);
      nextT+=LOOP;
      setTimeout(()=>{if(_bgmRunning)scheduleLoop();},(LOOP-0.4)*1000);
    }
    scheduleLoop();
  } catch(_){}
}
function stopCasinoBGM(){
  _bgmRunning=false;
  if(_bgmGain&&_bgmCtx){try{_bgmGain.gain.linearRampToValueAtTime(0,_bgmCtx.currentTime+1);}catch(_){}}
  _bgmGain=null;
}

function fmtVN(n: number) { return n.toLocaleString("vi-VN"); }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min: number, max: number) { return Math.random() * (max - min) + min; }

type Phase = "BETTING" | "THROWING" | "RESULT";
type BetSide = "tai" | "xiu";
type Popup = "rules" | "leaderboard" | "soicau" | "history" | null;
type DiceRecord  = {session:number; dice:[number,number,number]; result:"T"|"X"; time:string};
type BetRecord   = {session:number; side:"TAI"|"XIU"; amount:number; won:boolean; time:string};
type LBEntry     = {name:string; totalWin:number; gamesPlayed:number; wins:number};
type PlayerBet   = {name:string; amount:number; refunded?:boolean};
type SessionBetRecord = {session:number; result:"T"|"X"; tai:PlayerBet[]; xiu:PlayerBet[]; dice:[number,number,number]; time:string};
type JackpotRecord   = {session:number; winner:string; side:"TAI"|"XIU"; bet:number; payout:number; dice:[number,number,number]; time:string};

const CHIPS = [
  { label:"1K",  value:1_000 },    { label:"10K",  value:10_000 },
  { label:"50K", value:50_000 },   { label:"100K", value:100_000 },
  { label:"500K",value:500_000 },  { label:"1M",   value:1_000_000 },
  { label:"5M",  value:5_000_000 },{ label:"50M",  value:50_000_000 },
];
const ROUND          = 60;
const THROW_MS       = 4000; // 4 giây lắc bát trước khi tự mở
const RESULT_MS      = 5000;
const PAYOUT         = 1.95;
const LATE_BET_SECS  = 4; // hoàn tiền nếu đặt trong 5s cuối (countdown <= 4)

// Large pool — tên ngắn + tên đầy đủ masked, format đa dạng để mỗi phiên trông khác nhau
const FAKE_PLAYERS=[
  "Hùng***","Linh***","Minh***","An***","Hoa***","Tuấn***","Trang***","Dũng***","Nga***","Bình***",
  "Thắng***","Lan***","Quân***","Mai***","Hải***","Phương***","Đức***","Yến***","Nam***","Thu***",
  "Khoa***","Việt***","Quỳnh***","Hà***","Long***","Sơn***","Thủy***","Khánh***","Đạt***","Bảo***",
  "Ng.Hùng","Tr.Linh","Ph.Minh","L.An","H.Hoa","V.Tuấn","Đ.Trang","B.Dũng","T.Nga","Q.Bình",
  "user8***","user3***","user7***","user1***","user5***","user2***","user9***","user4***","user6***","user0***",
  "NguyenH","TranL","LeM","PhamA","VuH","HoangT","DangD","BuiN","DoB","NgoBin",
  "Rồng🔥","Hổ💰","Phượng✨","Lân🌟","Lucky8","Win99","Bet168","Gold88","Star77","Ace66",
  "0901***","0936***","0912***","0987***","0965***","0978***","0943***","0856***","0768***","0898***",
];
// Shuffle toàn bộ pool rồi lấy n đầu — không lặp tên trong cùng phiên
function pickRandPlayers(n:number){return [...FAKE_PLAYERS].sort(()=>Math.random()-0.5).slice(0,n);}
function genFakeBets(players:string[]):PlayerBet[]{return players.map(name=>({name,amount:CHIPS[randInt(0,5)].value*randInt(1,8)}));}

const DOTS: Record<number,[number,number][]> = {
  1:[[50,50]],
  2:[[28,28],[72,72]],
  3:[[28,28],[50,50],[72,72]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]],
};

/* ─── DiceFace ─── */
function DiceFace({ val, size=44 }:{ val:number; size?:number }) {
  const uid=`d${val}s${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
      style={{filter:"drop-shadow(0 2px 7px rgba(0,0,0,0.9))",display:"block",flexShrink:0}}>
      <defs>
        <linearGradient id={`${uid}g`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff"/><stop offset="100%" stopColor="#d8d8d8"/>
        </linearGradient>
        <linearGradient id={`${uid}t`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/><stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="88" height="88" rx="17" fill="rgba(0,0,0,0.28)"/>
      <rect x="4"  y="4"  width="88" height="88" rx="17" fill={`url(#${uid}g)`}/>
      <rect x="4"  y="4"  width="88" height="40" rx="17" fill={`url(#${uid}t)`}/>
      <rect x="4"  y="4"  width="88" height="88" rx="17" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5"/>
      {(DOTS[val]??DOTS[1]).map(([cx,cy],i)=>(
        <g key={i}>
          <circle cx={cx+1} cy={cy+1.5} r="9.5" fill="rgba(0,0,0,0.22)"/>
          <circle cx={cx} cy={cy} r="9.5" fill="#C41E3A"/>
          <circle cx={cx-3} cy={cy-3} r="3" fill="rgba(255,150,150,0.4)"/>
        </g>
      ))}
    </svg>
  );
}

/* ─── Top-down Bowl (viewed from above) ─── */
function DiceCupImg({ size=110, className="" }:{ size?:number; className?:string }) {
  return (
    <img
      src={diceCupImg}
      draggable={false}
      className={className}
      style={{
        width:size, height:size,
        objectFit:"contain",
        display:"block",
        pointerEvents:"none",
        userSelect:"none",
        filter:
          "drop-shadow(0 0 22px rgba(255,180,0,0.95)) " +
          "drop-shadow(0 0 10px rgba(255,120,0,0.8)) " +
          "brightness(1.1) saturate(1.15)",
      }}
    />
  );
}

/* ─── Confetti + Coins ─── */
type CP={id:number;x:number;color:string;size:number;delay:number;duration:number;shape:"rect"|"circle"};
function Confetti({active}:{active:boolean}) {
  const pieces=useMemo<CP[]>(()=>{
    const colors=["#FFD700","#FFA500","#ff4444","#ff88aa","#44ddff","#88ff66","#ffffff","#cc88ff"];
    return Array.from({length:55},(_,i)=>({
      id:i,x:randF(2,98),color:colors[i%colors.length],
      size:randF(6,13),delay:randF(0,1.3),duration:randF(2.5,4.5),
      shape:(i%2===0?"rect":"circle") as "rect"|"circle",
    }));
  },[]);
  if(!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{zIndex:50}}>
      {pieces.map(p=>(
        <div key={p.id} className="confetti-piece" style={{
          left:`${p.x}%`,top:0,width:p.size,height:p.shape==="circle"?p.size:p.size*1.6,
          borderRadius:p.shape==="circle"?"50%":"2px",background:p.color,
          animationDuration:`${p.duration}s`,animationDelay:`${p.delay}s`,opacity:0,
        }}/>
      ))}
    </div>
  );
}
function CoinRain({active}:{active:boolean}) {
  const coins=useMemo(()=>Array.from({length:18},(_,i)=>({id:i,x:randF(5,95),delay:randF(0,2),dur:randF(1.8,3.5),size:randF(16,28)})),[]);
  if(!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{zIndex:51}}>
      {coins.map(c=>(
        <div key={c.id} className="coin-drop" style={{
          position:"absolute",left:`${c.x}%`,top:-40,width:c.size,height:c.size,borderRadius:"50%",
          background:"radial-gradient(circle at 35% 35%,#fff7a0,#FFD700 45%,#c8860a 80%,#8B5E00)",
          border:"2px solid #FFD700",boxShadow:"0 0 8px rgba(255,215,0,0.6)",
          animationDuration:`${c.dur}s`,animationDelay:`${c.delay}s`,opacity:0,
        }}/>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════
   OVAL CASINO TABLE — rich decorative design with golden dragons
═══════════════════════════════════════════════ */
function DragonBody({flip}:{flip?:boolean}) {
  const g = flip
    ? `translate(72,0) scale(-1,1)`
    : undefined;
  return (
    <g transform={g}>
      {/* ── Tail */}
      <path d="M 4,56 C 6,62 4,68 8,66 C 12,64 10,70 14,69" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round"/>
      {/* ── Lower body */}
      <path d="M 14,52 C 10,58 6,60 4,56" fill="none" stroke="#FFD700" strokeWidth="3" strokeLinecap="round"/>
      {/* ── Main serpentine body */}
      <path d="M 14,52 C 12,42 10,34 16,26 C 20,20 28,18 30,26 C 32,32 26,36 28,28" fill="none" stroke="#FFD700" strokeWidth="4.5" strokeLinecap="round"/>
      {/* ── Neck */}
      <path d="M 28,28 C 32,20 38,14 44,12" fill="none" stroke="#FFD700" strokeWidth="4" strokeLinecap="round"/>
      {/* ── Scales along body */}
      {[0,1,2,3,4,5].map(i=>{
        const t=i/5;
        const bx=16+t*12, by=52-t*26;
        return <path key={i} d={`M ${bx-2.5},${by} Q ${bx},${by-4} ${bx+2.5},${by}`} fill="none" stroke="rgba(255,200,0,0.55)" strokeWidth="1.2"/>;
      })}
      {/* ── Wing */}
      <path d="M 30,28 C 24,18 14,14 10,22 C 14,17 24,22 26,30 Z" fill="rgba(255,215,0,0.22)" stroke="#c8860a" strokeWidth="0.7"/>
      {/* ── Front claw */}
      <path d="M 26,24 L 18,18 M 26,24 L 23,15 M 26,24 L 30,16" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
      {/* ── Rear claw */}
      <path d="M 14,46 L 7,42 M 14,46 L 12,38 M 14,46 L 18,40" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
      {/* ── Spine spikes */}
      {[0,1,2,3].map(i=>{
        const t=i/3;
        const sx=28+t*16, sy=28-t*16;
        return <path key={i} d={`M ${sx},${sy} L ${sx-1.5},${sy-6} L ${sx+1.5},${sy}`} fill="#FFD700" stroke="#9a6000" strokeWidth="0.4"/>;
      })}
      {/* ── Head */}
      <path d="M 44,12 C 46,7 52,6 57,9 C 62,12 64,17 61,21 C 58,25 52,25 48,22 C 45,19 44,15 44,12 Z" fill="#FFD700" stroke="#9a6000" strokeWidth="0.8"/>
      {/* ── Upper jaw/snout */}
      <path d="M 56,15 L 65,12 C 68,11 68,15 65,16 L 57,18" fill="#c8860a" stroke="#7a5000" strokeWidth="0.5"/>
      {/* ── Lower jaw */}
      <path d="M 56,20 L 64,20" fill="none" stroke="#7a5000" strokeWidth="1" strokeLinecap="round"/>
      {/* ── Teeth (3 upper) */}
      {[0,1,2].map(i=>(
        <path key={i} d={`M ${57+i*3},16 L ${57.5+i*3},19`} stroke="#fffacc" strokeWidth="1" strokeLinecap="round"/>
      ))}
      {/* ── Eye */}
      <circle cx="50" cy="11" r="2.8" fill="#cc0000"/>
      <circle cx="51" cy="10.3" r="1" fill="#fff"/>
      <circle cx="51.3" cy="10.1" r="0.5" fill="#000"/>
      {/* ── Horns */}
      <path d="M 47,7 C 45,2 49,0 50,4" fill="none" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M 51,5 C 51,0 55,0 54,4" fill="none" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
      {/* ── Whiskers */}
      <line x1="62" y1="14" x2="70" y2="10" stroke="rgba(255,230,100,0.75)" strokeWidth="0.9"/>
      <line x1="62" y1="17" x2="70" y2="19" stroke="rgba(255,230,100,0.75)" strokeWidth="0.9"/>
      {/* ── Forehead mane/flame */}
      <path d="M 44,10 C 40,4 43,0 46,4 C 45,0 49,0 47,5 C 48,1 52,2 49,6" fill="none" stroke="#FFD700" strokeWidth="1.2" strokeLinecap="round"/>
    </g>
  );
}

function OvalFrame({w,h}:{w:number;h:number}) {
  const rx = h/2;
  const CX = w/2, CY = h/2;
  const DOT_RX = w/2-22, DOT_RY = h/2-22;
  const NDOTS = 40;
  const dots = Array.from({length:NDOTS},(_,i)=>{
    const a=(i/NDOTS)*2*Math.PI-Math.PI/2;
    return {x:CX+DOT_RX*Math.cos(a), y:CY+DOT_RY*Math.sin(a), big:i%5===0};
  });

  return (
    <svg width={w} height={h} className="absolute inset-0 pointer-events-none" style={{zIndex:0}}>
      <defs>
        <radialGradient id="feltMain" cx="50%" cy="40%" r="65%">
          <stop offset="0%"   stopColor="#920010"/>
          <stop offset="35%"  stopColor="#60000c"/>
          <stop offset="70%"  stopColor="#3a0006"/>
          <stop offset="100%" stopColor="#180000"/>
        </radialGradient>
        <radialGradient id="feltEdge" cx="50%" cy="50%" r="50%">
          <stop offset="58%"  stopColor="transparent"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.65)"/>
        </radialGradient>
        <pattern id="feltDia" x="0" y="0" width="13" height="13" patternUnits="userSpaceOnUse">
          <path d="M6.5 0 L13 6.5 L6.5 13 L0 6.5 Z" fill="none" stroke="rgba(0,0,0,0.13)" strokeWidth="0.5"/>
        </pattern>
        <pattern id="feltGrid" x="0" y="0" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M7 0 L0 0 L0 7" fill="none" stroke="rgba(255,255,255,0.013)" strokeWidth="0.3"/>
        </pattern>
        <linearGradient id="feltSheen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.09)"/>
          <stop offset="50%"  stopColor="rgba(255,255,255,0.01)"/>
          <stop offset="100%" stopColor="transparent"/>
        </linearGradient>
        <linearGradient id="goldRim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#fffacc"/>
          <stop offset="18%"  stopColor="#FFD700"/>
          <stop offset="50%"  stopColor="#b8720a"/>
          <stop offset="82%"  stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#7a5000"/>
        </linearGradient>
        <filter id="goldGlow">
          <feGaussianBlur stdDeviation="2.8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="dragonGlow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="1.8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="textGlow" x="-20%" y="-30%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="ovalClip">
          <rect x="6" y="6" width={w-12} height={h-12} rx={rx-4}/>
        </clipPath>
      </defs>

      {/* ── 1. Outer dark bevel */}
      <rect x="0" y="0" width={w} height={h} rx={rx} fill="rgba(0,0,0,0.75)"/>

      {/* ── 2-5. Felt layers */}
      <rect x="5" y="5" width={w-10} height={h-10} rx={rx-3} fill="url(#feltMain)"/>
      <rect x="5" y="5" width={w-10} height={h-10} rx={rx-3} fill="url(#feltDia)"/>
      <rect x="5" y="5" width={w-10} height={h-10} rx={rx-3} fill="url(#feltGrid)"/>
      <rect x="5" y="5" width={w-10} height={h-10} rx={rx-3} fill="url(#feltEdge)"/>
      <rect x="5" y="5" width={w-10} height={(h-10)*0.42} rx={rx-3} fill="url(#feltSheen)"/>

      {/* ── 6. Decorative arc patterns clipped to oval */}
      <g clipPath="url(#ovalClip)">
        {/* Four corner lotus-style quarter-circle ornaments */}
        {/* Top-left */}
        <path d={`M ${rx+30},22 Q ${rx+30},${CY-18} ${CX-38},${CY-18}`}
          fill="none" stroke="rgba(255,215,0,0.22)" strokeWidth="1.2"/>
        <path d={`M ${rx+36},22 Q ${rx+36},${CY-24} ${CX-38},${CY-24}`}
          fill="none" stroke="rgba(255,215,0,0.10)" strokeWidth="0.7"/>
        {/* Top-right */}
        <path d={`M ${CX+38},${CY-18} Q ${w-rx-30},${CY-18} ${w-rx-30},22`}
          fill="none" stroke="rgba(255,215,0,0.22)" strokeWidth="1.2"/>
        <path d={`M ${CX+38},${CY-24} Q ${w-rx-36},${CY-24} ${w-rx-36},22`}
          fill="none" stroke="rgba(255,215,0,0.10)" strokeWidth="0.7"/>
        {/* Bottom-left */}
        <path d={`M ${rx+30},${h-22} Q ${rx+30},${CY+18} ${CX-38},${CY+18}`}
          fill="none" stroke="rgba(255,215,0,0.22)" strokeWidth="1.2"/>
        <path d={`M ${rx+36},${h-22} Q ${rx+36},${CY+24} ${CX-38},${CY+24}`}
          fill="none" stroke="rgba(255,215,0,0.10)" strokeWidth="0.7"/>
        {/* Bottom-right */}
        <path d={`M ${CX+38},${CY+18} Q ${w-rx-30},${CY+18} ${w-rx-30},${h-22}`}
          fill="none" stroke="rgba(255,215,0,0.22)" strokeWidth="1.2"/>
        <path d={`M ${CX+38},${CY+24} Q ${w-rx-36},${CY+24} ${w-rx-36},${h-22}`}
          fill="none" stroke="rgba(255,215,0,0.10)" strokeWidth="0.7"/>

        {/* Horizontal rail lines */}
        <line x1={rx+22} y1={CY-52} x2={w-rx-22} y2={CY-52} stroke="rgba(255,215,0,0.18)" strokeWidth="1"/>
        <line x1={rx+22} y1={CY+52} x2={w-rx-22} y2={CY+52} stroke="rgba(255,215,0,0.18)" strokeWidth="1"/>
        <line x1={rx+26} y1={CY-56} x2={w-rx-26} y2={CY-56} stroke="rgba(255,215,0,0.07)" strokeWidth="0.5"/>
        <line x1={rx+26} y1={CY+56} x2={w-rx-26} y2={CY+56} stroke="rgba(255,215,0,0.07)" strokeWidth="0.5"/>

        {/* Center divider */}
        <line x1={CX} y1={CY-58} x2={CX} y2={CY+58} stroke="rgba(255,215,0,0.12)" strokeWidth="0.9" strokeDasharray="5,4"/>

        {/* Lotus petal clusters — 4 inner corners */}
        {([[rx+45,CY-38],[w-rx-45,CY-38],[rx+45,CY+38],[w-rx-45,CY+38]] as [number,number][]).map(([lx,ly],ci)=>(
          <g key={ci} opacity="0.28">
            {[0,45,90,135,180,225,270,315].map((a,i)=>{
              const rad=a*Math.PI/180;
              return <ellipse key={i}
                cx={lx+9*Math.cos(rad)} cy={ly+9*Math.sin(rad)} rx="5.5" ry="2.2"
                transform={`rotate(${a},${lx+9*Math.cos(rad)},${ly+9*Math.sin(rad)})`}
                fill="#FFD700"/>;
            })}
            <circle cx={lx} cy={ly} r="2.5" fill="#FFD700"/>
          </g>
        ))}

        {/* Chip-ring markers — subtle dashed circles */}
        {[0.25,0.5,0.75].map((t,i)=>(
          <circle key={`tc${i}`} cx={w*0.22} cy={h*t} r="6"
            fill="none" stroke="rgba(255,215,0,0.09)" strokeWidth="0.8" strokeDasharray="3,2"/>
        ))}
        {[0.25,0.5,0.75].map((t,i)=>(
          <circle key={`xc${i}`} cx={w*0.78} cy={h*t} r="6"
            fill="none" stroke="rgba(255,215,0,0.09)" strokeWidth="0.8" strokeDasharray="3,2"/>
        ))}

        {/* TÀI text burned into felt */}
        <text x={w*0.23} y={CY+7} textAnchor="middle"
          fontFamily="'Arial Black',sans-serif" fontSize="24" fontWeight="900" letterSpacing="4"
          fill="rgba(255,80,80,0.18)" filter="url(#textGlow)">TAI</text>
        <text x={w*0.23} y={CY+7} textAnchor="middle"
          fontFamily="'Arial Black',sans-serif" fontSize="24" fontWeight="900" letterSpacing="4"
          fill="rgba(255,80,80,0.09)" stroke="rgba(255,60,60,0.15)" strokeWidth="0.4">TAI</text>

        {/* XỈU text burned into felt */}
        <text x={w*0.77} y={CY+7} textAnchor="middle"
          fontFamily="'Arial Black',sans-serif" fontSize="24" fontWeight="900" letterSpacing="4"
          fill="rgba(100,150,255,0.18)" filter="url(#textGlow)">XIU</text>
        <text x={w*0.77} y={CY+7} textAnchor="middle"
          fontFamily="'Arial Black',sans-serif" fontSize="24" fontWeight="900" letterSpacing="4"
          fill="rgba(100,150,255,0.09)" stroke="rgba(80,120,255,0.15)" strokeWidth="0.4">XIU</text>
      </g>

      {/* ── 7. LEFT golden dragon — faces right */}
      <g filter="url(#dragonGlow)" opacity="0.78" transform={`translate(6,${CY-43})`}>
        <DragonBody/>
      </g>

      {/* ── 8. RIGHT golden dragon — faces left (mirrored) */}
      <g filter="url(#dragonGlow)" opacity="0.78" transform={`translate(${w-78},${CY-43})`}>
        <DragonBody flip/>
      </g>

      {/* ── 9. Gold dot ring along inner ellipse */}
      {dots.map((d,i)=>(
        <circle key={i} cx={d.x} cy={d.y} r={d.big?3:1.7}
          fill={d.big?"rgba(255,215,0,0.72)":"rgba(200,134,10,0.42)"}/>
      ))}

      {/* ── 10. Inner border rings */}
      <rect x="18" y="18" width={w-36} height={h-36} rx={rx-15}
        fill="none" stroke="rgba(255,215,0,0.22)" strokeWidth="1.3"/>
      <rect x="22" y="22" width={w-44} height={h-44} rx={rx-19}
        fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.7"/>

      {/* ── 11. Main gold glow border */}
      <rect x="3" y="3" width={w-6} height={h-6} rx={rx-2}
        fill="none" stroke="url(#goldRim)" strokeWidth="6" filter="url(#goldGlow)"/>

      {/* ── 12. Outermost dark frame */}
      <rect x="1" y="1" width={w-2} height={h-2} rx={rx}
        fill="none" stroke="#120500" strokeWidth="10"/>

      {/* ── 13. Innermost fine gold line */}
      <rect x="13" y="13" width={w-26} height={h-26} rx={rx-11}
        fill="none" stroke="rgba(255,215,0,0.26)" strokeWidth="0.9"/>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────
   BETTING BANNER — dragons flanking | TÀI · HŨ · XỈU
───────────────────────────────────────────────────── */
function JackpotHistoryPopup({log,onClose}:{log:JackpotRecord[];onClose:()=>void}){
  return(
    <div className="fixed inset-0 flex items-center justify-center" style={{zIndex:70,background:"rgba(0,0,0,0.85)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"min(480px,94vw)",maxHeight:"82vh",display:"flex",flexDirection:"column",
        borderRadius:20,overflow:"hidden",
        background:"linear-gradient(180deg,#1c0a00 0%,#0a0500 100%)",
        boxShadow:"0 0 0 2px #7a4000,0 0 0 4px #FFD700,0 0 0 6px #7a4000,0 24px 64px rgba(0,0,0,0.97)",
      }}>
        {/* header */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 16px",
          background:"linear-gradient(90deg,rgba(255,180,0,0.08),rgba(255,140,0,0.14),rgba(255,180,0,0.08))",
          borderBottom:"1px solid rgba(255,200,0,0.25)",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>💰</span>
            <div>
              <div style={{color:"#FFD700",fontWeight:900,fontSize:14,letterSpacing:2,lineHeight:1}}>LỊCH SỬ NỔ HŨ</div>
              <div style={{color:"rgba(255,215,0,0.45)",fontSize:9,marginTop:2}}>{log.length} lần nổ ghi nhận</div>
            </div>
          </div>
          <button onClick={onClose} style={{color:"#FFD700",fontWeight:900,fontSize:20,background:"none",border:"none",cursor:"pointer",lineHeight:1,opacity:0.8}}>✕</button>
        </div>

        {log.length===0?(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:32}}>
            <span style={{fontSize:40,opacity:0.3}}>🏺</span>
            <div style={{color:"rgba(255,215,0,0.35)",fontSize:11,textAlign:"center"}}>Chưa có lần nổ hũ nào{"\n"}trong phiên này</div>
          </div>
        ):(
          <div style={{overflowY:"auto",flex:1,WebkitOverflowScrolling:"touch",overscrollBehavior:"contain"}}>
            {log.map((rec,i)=>{
              const sideColor=rec.side==="TAI"?"#ff6666":"#88aaff";
              const sideLbl=rec.side==="TAI"?"TÀI":"XỈU";
              const isFirst=i===0;
              return(
                <div key={i} style={{
                  margin:"10px 12px",
                  borderRadius:12,
                  background:isFirst?"linear-gradient(135deg,rgba(255,200,0,0.1),rgba(180,100,0,0.06))":"rgba(255,255,255,0.03)",
                  border:`1px solid ${isFirst?"rgba(255,200,0,0.35)":"rgba(255,255,255,0.07)"}`,
                  padding:"10px 12px",
                }}>
                  {/* top row: session + time + NEW badge */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    {isFirst&&<span style={{background:"#FFD700",color:"#1a0800",fontSize:8,fontWeight:900,borderRadius:4,padding:"1px 5px",letterSpacing:1}}>MỚI</span>}
                    <span style={{fontSize:9,color:"rgba(255,215,0,0.55)",fontWeight:700}}>Phiên #{rec.session}</span>
                    <span style={{marginLeft:"auto",fontSize:8,color:"rgba(255,255,255,0.3)"}}>{rec.time}</span>
                  </div>
                  {/* dice */}
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                    <div style={{display:"flex",gap:4}}>
                      {rec.dice.map((d,di)=><DiceFace key={di} val={d} size={22}/>)}
                    </div>
                    <span style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>Tổng: <strong style={{color:"#FFD700"}}>{rec.dice.reduce((a,b)=>a+b,0)}</strong></span>
                    {rec.dice[0]===rec.dice[1]&&rec.dice[1]===rec.dice[2]&&(
                      <span style={{fontSize:8,background:"rgba(255,215,0,0.15)",color:"#FFD700",borderRadius:4,padding:"1px 6px",fontWeight:700}}>BỘ BA ✨</span>
                    )}
                  </div>
                  {/* winner info grid */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    <div style={{background:"rgba(0,0,0,0.25)",borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:8,color:"rgba(255,255,255,0.35)",marginBottom:2}}>NGƯỜI THẮNG</div>
                      <div style={{fontSize:11,fontWeight:900,color:rec.winner==="Bạn"?"#FFD700":"rgba(255,255,255,0.85)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rec.winner}</div>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.25)",borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
                      <div style={{fontSize:8,color:"rgba(255,255,255,0.35)",marginBottom:2}}>CỬA CƯỢC</div>
                      <div style={{fontSize:11,fontWeight:900,color:sideColor}}>{sideLbl}</div>
                      <div style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>{fmtVN(rec.bet)}</div>
                    </div>
                    <div style={{background:"rgba(255,200,0,0.08)",borderRadius:8,padding:"6px 8px",textAlign:"center",border:"1px solid rgba(255,215,0,0.15)"}}>
                      <div style={{fontSize:8,color:"rgba(255,215,0,0.5)",marginBottom:2}}>NHẬN VỀ</div>
                      <div style={{fontSize:12,fontWeight:900,color:"#4dff88"}}>{fmtVN(rec.payout)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* footer note */}
        <div style={{padding:"8px 14px",borderTop:"1px solid rgba(255,200,0,0.12)",background:"rgba(0,0,0,0.3)"}}>
          <div style={{fontSize:8,color:"rgba(255,255,255,0.2)",textAlign:"center"}}>Nhà cái giữ 50% · 50% chia đều tất cả người cược phiên đó</div>
        </div>
      </div>
    </div>
  );
}

function JackpotPot({jackpot,onClick}:{jackpot:number;onClick?:()=>void}){
  return (
    <div onClick={onClick} style={{
      display:"flex",flexDirection:"column",alignItems:"center",gap:1,
      flexShrink:0,cursor:onClick?"pointer":"default",
    }}>
      <div style={{
        fontSize:7,fontWeight:900,letterSpacing:2,
        color:"rgba(255,215,0,0.75)",
        textShadow:"0 0 8px rgba(255,215,0,0.5)",
      }}>🏆 HŨ JACKPOT</div>
      <img src={treasureChestImg} alt="Hũ jackpot" draggable={false} style={{
        width:76,height:76,objectFit:"contain",pointerEvents:"none",marginBottom:-6,
        filter:"drop-shadow(0 0 20px rgba(255,200,0,1)) drop-shadow(0 0 8px rgba(255,150,0,0.8))",
      }}/>
      <div style={{
        background:"linear-gradient(135deg,#1a0800,#6a3800,#FFD700,#6a3800,#1a0800)",
        border:"2px solid #FFD700",borderRadius:24,padding:"3px 14px",
        boxShadow:"0 0 22px rgba(255,200,0,0.85),0 0 44px rgba(255,150,0,0.3),inset 0 1.5px 0 rgba(255,255,255,0.25)",
        zIndex:2,position:"relative",
      }}>
        <span className="haru-jackpot-num" style={{
          fontSize:13,fontWeight:900,color:"#fff8cc",letterSpacing:0.5,
          fontFamily:"monospace",whiteSpace:"nowrap",
          textShadow:"0 0 10px rgba(255,220,0,0.9),0 1px 2px rgba(0,0,0,0.9)",
        }}>{fmtVN(jackpot)} ₫</span>
      </div>
    </div>
  );
}

function BettingBanner({jackpot,onPotClick,history}:{jackpot:number;onPotClick?:()=>void;history:Array<"T"|"X">}){
  const recent=[...(Array.isArray(history)?history:[])].slice(0,10).reverse();
  return(
    <div style={{width:416,display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,marginBottom:0}}>
      {/* ── Dragons + Jackpot row ── */}
      <div style={{display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
        <img src={dragonGoldImg} alt="" draggable={false} style={{
          height:88,width:88,objectFit:"contain",pointerEvents:"none",flexShrink:0,
          transform:"scaleX(-1)",
          filter:"drop-shadow(0 0 18px rgba(255,110,0,1)) drop-shadow(0 0 8px rgba(255,60,0,0.9))",
        }}/>
        <JackpotPot jackpot={jackpot} onClick={onPotClick}/>
        <img src={dragonBlueImg} alt="" draggable={false} style={{
          height:88,width:88,objectFit:"contain",pointerEvents:"none",flexShrink:0,
          filter:"drop-shadow(0 0 18px rgba(60,140,255,1)) drop-shadow(0 0 8px rgba(80,180,255,0.9))",
        }}/>
      </div>
    </div>
  );
}

/* ─── Center Circle ─── */
function CenterCircle({children,size=110}:{children:React.ReactNode;size?:number}) {
  const c=size/2;
  return (
    <div className="relative flex-shrink-0" style={{width:size,height:size,overflow:"visible"}}>
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <radialGradient id="circBg" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#2a2a2a"/><stop offset="100%" stopColor="#050505"/>
          </radialGradient>
          <linearGradient id="circRing" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#FFD700"/><stop offset="50%" stopColor="#8B5E00"/>
            <stop offset="100%" stopColor="#FFD700"/>
          </linearGradient>
          <filter id="circGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx={c} cy={c} r={c-1}  fill="#1a0a00"/>
        <circle cx={c} cy={c} r={c-3}  fill="none" stroke="url(#circRing)" strokeWidth="5" filter="url(#circGlow)"/>
        <circle cx={c} cy={c} r={c-8}  fill="none" stroke="#2a1500" strokeWidth="2"/>
        <circle cx={c} cy={c} r={c-11} fill="url(#circBg)"/>
        <ellipse cx={c} cy={c-15} rx={22} ry={8} fill="rgba(255,255,255,0.04)"/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{overflow:"visible"}}>
        {children}
      </div>
    </div>
  );
}

/* ─── Triangle Dice: XX1+XX2 top row · XX3 bottom center · sum badge top-right ─── */
function DiceTriangle({dice,isTai,sum,noAnim}:{dice:number[];isTai:boolean;sum:number;noAnim?:boolean}) {
  const SZ = 32;
  const anim = noAnim ? "" : "dice-tri-pop";
  const delay = (s:string) => noAnim ? {} : {animationDelay:s};
  return (
    <div style={{
      position:"relative",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,
    }}>
      {/* Sum badge — floats top-right */}
      <div className={anim} style={{
        position:"absolute",right:-8,top:-2,zIndex:10,
        background:"rgba(10,5,0,0.88)",
        border:"1.5px solid rgba(255,215,0,0.9)",
        borderRadius:5,
        color:"#FFD700",fontSize:11,fontWeight:900,lineHeight:1,
        padding:"2px 6px",letterSpacing:0.5,
        boxShadow:"0 0 8px rgba(255,200,0,0.6)",
        ...delay("0.28s"),
      }}>{sum}</div>
      {/* Row 1: die[0] left · die[1] right */}
      <div style={{display:"flex",gap:4}}>
        <div className={anim} style={{...delay("0s")}}>
          <DiceFace val={dice[0]} size={SZ}/>
        </div>
        <div className={anim} style={{...delay("0.13s")}}>
          <DiceFace val={dice[1]} size={SZ}/>
        </div>
      </div>
      {/* Row 2: die[2] center */}
      <div className={anim} style={{...delay("0.24s")}}>
        <DiceFace val={dice[2]} size={SZ}/>
      </div>
    </div>
  );
}

/* ─── Side icon button with custom SVG ─── */
function SideIconBtn({icon,label,active,onClick}:{icon:React.ReactNode;label:string;active?:boolean;onClick:()=>void}){
  return (
    <button onClick={onClick} title={label} style={{
      display:"flex",alignItems:"center",justifyContent:"center",
      padding:0,cursor:"pointer",
      width:26,height:26,borderRadius:"50%",
      background:active
        ?"linear-gradient(145deg,#ffe066,#c8860a)"
        :"linear-gradient(145deg,#2a1800,#150d00)",
      border:`1.5px solid ${active?"#FFD700":"rgba(255,215,0,0.3)"}`,
      boxShadow:active
        ?"0 0 12px rgba(255,215,0,0.7),inset 0 1px 0 rgba(255,255,255,0.3)"
        :"0 2px 6px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.05)",
      transition:"all 0.2s ease",
    }}>
      {icon}
    </button>
  );
}

/* ─── Custom SVG icons ─── */
const IcoTrophy=({s=18}:{s?:number})=>(
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M8 21h8M12 17v4M5 3H3a2 2 0 000 4c0 3 2 5 4 6M19 3h2a2 2 0 010 4c0 3-2 5-4 6" stroke="#FFD700" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 3h14v8a7 7 0 01-14 0V3z" fill="rgba(255,215,0,0.18)" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="8" r="2" fill="#FFD700" opacity="0.7"/>
  </svg>
);
const IcoBook=({s=18}:{s?:number})=>(
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" fill="rgba(255,215,0,0.12)" stroke="#FFD700" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M8 7h8M8 11h6" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
  </svg>
);
const IcoClock=({s=18}:{s?:number})=>(
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" fill="rgba(255,215,0,0.1)" stroke="#FFD700" strokeWidth="1.8"/>
    <path d="M12 7v5l3 3" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="1.2" fill="#FFD700"/>
  </svg>
);
const IcoChart=({s=18}:{s?:number})=>(
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M3 20h18" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="5" y="12" width="3" height="8" rx="1" fill="rgba(255,215,0,0.35)" stroke="#FFD700" strokeWidth="1.3"/>
    <rect x="10.5" y="7" width="3" height="13" rx="1" fill="rgba(255,215,0,0.35)" stroke="#FFD700" strokeWidth="1.3"/>
    <rect x="16" y="4" width="3" height="16" rx="1" fill="rgba(255,215,0,0.35)" stroke="#FFD700" strokeWidth="1.3"/>
    <path d="M6.5 12l4-5 4 2.5 4-7" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
  </svg>
);
const IcoHand=({s=18}:{s?:number})=>(
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="M9 11V5a1 1 0 012 0v6M9 11V4a1 1 0 012 0v7M11 11V5a1 1 0 012 0v6M13 11V6a1 1 0 012 0v5" stroke="#FFD700" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M7 11v1a1 1 0 01-1 0V9a1 1 0 012 0v2z" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M7 12v3c0 3 2 5 5 5s5-2 5-5v-4" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="rgba(255,215,0,0.1)"/>
  </svg>
);

/* ─── Small helpers ─── */
function CuocButton({active,disabled,onClick}:{active:boolean;disabled?:boolean;onClick:()=>void}) {
  return (
    <button onClick={disabled?undefined:onClick} className="mt-1.5 transition-all" style={{
      padding:"3px 18px",borderRadius:20,cursor:disabled?"not-allowed":"pointer",
      background:disabled?"linear-gradient(180deg,#1a1000,#0e0900)":active?"linear-gradient(180deg,#FFD700,#c8860a)":"linear-gradient(180deg,#3d1f00,#2a1200)",
      border:`1.5px solid ${disabled?"#2a1800":active?"#FFD700":"#6b3800"}`,
      color:disabled?"rgba(180,120,0,0.3)":active?"#1a0800":"#d4a017",
      fontSize:11,fontWeight:900,letterSpacing:1,opacity:disabled?0.5:1,
      transform:disabled?"none":undefined,
    }}>CƯỢC</button>
  );
}
function ChipBtn({label,selected,onClick}:{label:string;selected:boolean;onClick:()=>void}) {
  return (
    <button onClick={onClick} className="active:scale-90 transition-all" style={{
      padding:"9px 0",borderRadius:999,cursor:"pointer",position:"relative",overflow:"hidden",
      background:selected
        ?"conic-gradient(from 45deg,#FFD700,#ffe066,#c8860a,#FFD700,#ffe566,#c8860a,#FFD700)"
        :"conic-gradient(from 45deg,#3a1500,#5a2500,#3a1500,#5a2500,#3a1500)",
      border:`2.5px solid ${selected?"#ffe566":"#7a3500"}`,
      color:selected?"#1a0800":"#cc8822",fontSize:11,fontWeight:900,letterSpacing:0.3,
      boxShadow:selected
        ?"0 0 18px rgba(255,215,0,0.7),0 0 6px rgba(255,180,0,0.5),inset 0 1.5px 0 rgba(255,255,255,0.5)"
        :"0 2px 8px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.07)",
      textShadow:selected?"0 1px 0 rgba(255,255,255,0.4)":"none",
    }}>
      {/* inner ring like a casino chip */}
      <span style={{
        position:"absolute",inset:3,borderRadius:999,
        border:`1.5px dashed ${selected?"rgba(255,255,255,0.35)":"rgba(180,80,0,0.25)"}`,
        pointerEvents:"none",
      }}/>
      {label}
    </button>
  );
}
function Bead({val,onClick}:{val:"T"|"X";onClick?:()=>void}) {
  const isTai = val==="T";
  const innerColor = isTai
    ? "radial-gradient(circle at 35% 30%,#ff8888,#C41E3A,#7a0010)"
    : "radial-gradient(circle at 35% 30%,#88aaff,#3355cc,#0a1a66)";
  const ringColor = isTai ? "rgba(196,30,58,0.7)" : "rgba(50,80,220,0.7)";
  const glowColor = isTai ? "rgba(196,30,58,0.6)" : "rgba(50,80,220,0.6)";
  const label = isTai ? "T" : "X";
  return (
    <div style={{
      position:"relative",width:18,height:18,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center",
      cursor:onClick?"pointer":"default",
    }} onClick={onClick}>
      {/* outer ring */}
      <div style={{
        position:"absolute",inset:0,borderRadius:"50%",
        border:`1.5px solid ${ringColor}`,
        boxShadow:`0 0 5px ${glowColor},inset 0 0 3px ${glowColor}`,
        transition:"box-shadow .15s",
      }}/>
      {/* inner filled circle */}
      <div style={{
        width:12,height:12,borderRadius:"50%",
        background:innerColor,
        boxShadow:`0 0 4px ${glowColor}`,
        display:"flex",alignItems:"center",justifyContent:"center",
      }}>
        <span style={{fontSize:6,fontWeight:900,color:"rgba(255,255,255,0.85)",lineHeight:1,userSelect:"none"}}>{label}</span>
      </div>
    </div>
  );
}
function PopupShell({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{zIndex:60,background:"rgba(0,0,0,0.75)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:wide?"min(700px,96vw)":"min(370px,92vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",
        borderRadius:18,overflow:"hidden",
        background:"linear-gradient(180deg,#2a1408 0%,#140900 100%)",
        boxShadow:"0 0 0 2px #6b3800,0 0 0 4px #D8A24A,0 0 0 6px #6b3800,0 20px 60px rgba(0,0,0,0.95)",
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderBottom:"1px solid rgba(139,94,0,0.4)",background:"linear-gradient(90deg,rgba(139,94,0,0.15),transparent)"}}>
          <span style={{color:"#FFD700",fontWeight:900,fontSize:13,letterSpacing:2}}>{title}</span>
          <button onClick={onClose} style={{color:"#FFD700",fontWeight:900,fontSize:18,background:"none",border:"none",cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>{children}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SESSION DETAIL POPUP — ai đặt cái gì phiên đó
═══════════════════════════════════════════ */
function SessionDetailPopup({log,idx,onClose,onNav}:{log:SessionBetRecord[];idx:number;onClose:()=>void;onNav:(i:number)=>void}){
  const rec=log[idx];
  if(!rec) return null;
  const isTai=rec.result==="T";
  const taiTotal=rec.tai.reduce((s,b)=>s+b.amount,0);
  const xiuTotal=rec.xiu.reduce((s,b)=>s+b.amount,0);
  const taiReturn=rec.tai.reduce((s,b)=>s+(b.refunded?b.amount:isTai?Math.floor(b.amount*1.95):0),0);
  const xiuReturn=rec.xiu.reduce((s,b)=>s+(b.refunded?b.amount:!isTai?Math.floor(b.amount*1.95):0),0);
  const maxRows=Math.max(rec.tai.length,rec.xiu.length);
  const canPrev=idx<log.length-1; // older session
  const canNext=idx>0;            // newer session

  const colH:React.CSSProperties={fontSize:8,fontWeight:900,letterSpacing:0.5,padding:"3px 0",color:"rgba(255,215,0,0.6)",borderBottom:"1px solid rgba(139,94,0,0.3)",textAlign:"center"};
  const cell:React.CSSProperties={fontSize:8,color:"rgba(255,255,255,0.8)",textAlign:"center",padding:"2px 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};

  function Side({players,won}:{players:PlayerBet[];won:boolean}){
    return(
      <div style={{display:"grid",gridTemplateColumns:"40px 1fr 42px 42px",gap:2}}>
        {/* Header */}
        <div style={colH}>Người</div>
        <div style={{...colH}}>Cược</div>
        <div style={{...colH,color:"#4dff88"}}>Trả</div>
        <div style={{...colH,color:"#FFD700"}}>Hoàn</div>
        {players.map((p,i)=>{
          const payout = (!p.refunded && won) ? Math.floor(p.amount*1.95) : 0;
          const refund = p.refunded ? p.amount : 0;
          return(
            <div key={i} style={{display:"contents"}}>
              <div style={{...cell,color:p.name==="Bạn"?"#FFD700":"rgba(255,255,255,0.8)"}}>{p.name}</div>
              <div style={cell}>{fmtVN(p.amount)}</div>
              <div style={{...cell,color:payout>0?"#4dff88":"rgba(255,255,255,0.25)"}}>
                {payout>0?fmtVN(payout):"—"}
              </div>
              <div style={{...cell,color:refund>0?"#FFD700":"rgba(255,255,255,0.25)"}}>
                {refund>0?fmtVN(refund):"—"}
              </div>
            </div>
          );
        })}
        {Array.from({length:Math.max(0,maxRows-players.length)}).map((_,i)=>(
          <div key={"e"+i} style={{display:"contents"}}>
            <div style={cell}/><div style={cell}/><div style={cell}/><div style={cell}/>
          </div>
        ))}
        <div style={{gridColumn:"1/-1",borderTop:"1px solid rgba(139,94,0,0.3)",marginTop:2,paddingTop:3,display:"flex",justifyContent:"space-between",gap:4}}>
          <span style={{fontSize:8,color:"rgba(255,215,0,0.55)"}}>CƯỢC: {fmtVN(players.reduce((s,b)=>s+b.amount,0))}</span>
          <span style={{fontSize:8,color:"#4dff88"}}>TRẢ: {fmtVN(players.reduce((s,b)=>s+(!b.refunded&&won?Math.floor(b.amount*1.95):0),0))}</span>
          <span style={{fontSize:8,color:"#FFD700"}}>HOÀN: {fmtVN(players.reduce((s,b)=>s+(b.refunded?b.amount:0),0))}</span>
        </div>
      </div>
    );
  }

  return(
    <div className="fixed inset-0 flex items-center justify-center" style={{zIndex:70,background:"rgba(0,0,0,0.82)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"min(520px,95vw)",maxHeight:"80vh",display:"flex",flexDirection:"column",
        borderRadius:18,overflow:"hidden",
        background:"linear-gradient(180deg,#1a0c02 0%,#0e0600 100%)",
        boxShadow:"0 0 0 2px #6b3800,0 0 0 4px #D8A24A,0 0 0 6px #6b3800,0 20px 60px rgba(0,0,0,0.95)",
      }}>
        {/* header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid rgba(139,94,0,0.4)",background:"rgba(139,94,0,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#FFD700",fontWeight:900,fontSize:13,letterSpacing:2}}>LỊCH SỬ PHIÊN</span>
            <span style={{background:"rgba(255,215,0,0.12)",borderRadius:6,padding:"1px 8px",fontSize:10,color:"rgba(255,215,0,0.7)"}}>#{rec.session}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {/* prev = older = higher index */}
            <button
              onClick={()=>canPrev&&onNav(idx+1)}
              disabled={!canPrev}
              title="Phiên trước"
              style={{background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:6,color:canPrev?"#FFD700":"rgba(255,215,0,0.25)",fontWeight:900,fontSize:13,padding:"2px 8px",cursor:canPrev?"pointer":"default",lineHeight:1.4,transition:"background .15s"}}
            >‹</button>
            <span style={{fontSize:9,color:"rgba(255,215,0,0.45)",minWidth:36,textAlign:"center"}}>{idx+1}/{log.length}</span>
            {/* next = newer = lower index */}
            <button
              onClick={()=>canNext&&onNav(idx-1)}
              disabled={!canNext}
              title="Phiên tiếp theo"
              style={{background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:6,color:canNext?"#FFD700":"rgba(255,215,0,0.25)",fontWeight:900,fontSize:13,padding:"2px 8px",cursor:canNext?"pointer":"default",lineHeight:1.4,transition:"background .15s"}}
            >›</button>
            <button onClick={onClose} style={{marginLeft:4,color:"#FFD700",fontWeight:900,fontSize:18,background:"none",border:"none",cursor:"pointer",lineHeight:1}}>✕</button>
          </div>
        </div>

        {/* dice result summary */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"10px 14px 8px",borderBottom:"1px solid rgba(139,94,0,0.2)"}}>
          <div style={{display:"flex",gap:6}}>
            {rec.dice.map((d,i)=><DiceFace key={i} val={d} size={32}/>)}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Tổng: <strong style={{color:"#FFD700"}}>{rec.dice.reduce((a,b)=>a+b,0)}</strong></span>
            <span style={{fontSize:12,fontWeight:900,color:isTai?"#ff6666":"#88aaff",letterSpacing:2}}>{isTai?"TÀI THẮNG":"XỈU THẮNG"}</span>
          </div>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>{rec.time}</div>
        </div>

        {/* two-column bet table — scrollable when many players */}
        <div style={{overflowY:"auto",flex:1,padding:"10px 10px",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",gap:8}}>
            {/* TÀI column */}
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"radial-gradient(#ff8888,#C41E3A)"}}/>
                <span style={{color:"#ff7777",fontWeight:900,fontSize:12,letterSpacing:2}}>TÀI</span>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginLeft:"auto"}}>{rec.tai.length} người</span>
              </div>
              <Side players={rec.tai} won={isTai}/>
            </div>
            {/* divider */}
            <div style={{background:"rgba(139,94,0,0.3)"}}/>
            {/* XỈU column */}
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"radial-gradient(#88aaff,#1a3acc)"}}/>
                <span style={{color:"#88aaff",fontWeight:900,fontSize:12,letterSpacing:2}}>XỈU</span>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginLeft:"auto"}}>{rec.xiu.length} người</span>
              </div>
              <Side players={rec.xiu} won={!isTai}/>
            </div>
          </div>

          {/* totals */}
          <div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"rgba(255,215,0,0.06)",border:"1px solid rgba(139,94,0,0.25)",display:"flex",justifyContent:"space-around"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"rgba(255,215,0,0.5)"}}>TỔNG CƯỢC TÀI</div>
              <div style={{fontSize:11,fontWeight:900,color:"#ff7777"}}>{fmtVN(taiTotal)}</div>
            </div>
            <div style={{width:1,background:"rgba(139,94,0,0.3)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"rgba(255,215,0,0.5)"}}>TỔNG CƯỢC XỈU</div>
              <div style={{fontSize:11,fontWeight:900,color:"#88aaff"}}>{fmtVN(xiuTotal)}</div>
            </div>
            <div style={{width:1,background:"rgba(139,94,0,0.3)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"rgba(255,215,0,0.5)"}}>TỔNG TRẢ</div>
              <div style={{fontSize:11,fontWeight:900,color:"#4dff88"}}>{fmtVN(isTai?taiReturn:xiuReturn)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SOI CẦU — Big Road casino-style matrix
═══════════════════════════════════════════ */
/* Palette cho từng cột cầu — màu sáng trên nền tối */
const STRAND_PALETTE=[
  {fill:"#c0392b",stroke:"#ff6b5b",text:"#fff"}, // đỏ tươi
  {fill:"#1a5fa8",stroke:"#5ba3ff",text:"#fff"}, // xanh dương
  {fill:"#1a7a3a",stroke:"#55dd77",text:"#fff"}, // xanh lá
  {fill:"#7a4f00",stroke:"#ffb830",text:"#fff"}, // cam vàng
  {fill:"#5b1a7a",stroke:"#cc66ff",text:"#fff"}, // tím
  {fill:"#007a7a",stroke:"#33dddd",text:"#fff"}, // cyan
  {fill:"#7a1a5b",stroke:"#ff66bb",text:"#fff"}, // hồng
  {fill:"#1a4a00",stroke:"#88ff33",text:"#fff"}, // xanh lime
  {fill:"#3a3a00",stroke:"#ffee22",text:"#fff"}, // vàng
  {fill:"#004a5b",stroke:"#33aacc",text:"#fff"}, // xanh nước biển
];

/* ── Bead Road: 6 rows, newest col right, scroll horizontal ── */
const BEAD_ROWS = 6;
const BEAD_SZ   = 26;  // cell size px
const BEAD_GAP  = 3;

function BeadRoad({txHistory,diceHistory=[]}:{txHistory:Array<"T"|"X">;diceHistory?:DiceRecord[]}) {
  // txHistory[0]=newest. Reverse → oldest first, then fill grid left→right, top→bottom
  const items = useMemo(()=>[...txHistory].reverse(),[txHistory]);
  const numCols = Math.ceil(items.length / BEAD_ROWS) || 1;

  // diceHistory oldest-first to align with items
  const dhOldFirst = useMemo(()=>[...diceHistory].reverse(),[diceHistory]);
  // The last dhOldFirst.length items in `items` correspond to dhOldFirst
  const dhOffset = items.length - dhOldFirst.length;
  const getRecord = (pos:number):DiceRecord|null => {
    const di = pos - dhOffset;
    return (di>=0 && di<dhOldFirst.length) ? dhOldFirst[di] : null;
  };

  // Build grid[col][row] = "T"|"X"|null
  const grid: Array<Array<"T"|"X"|null>> = Array.from({length:numCols},(_,c)=>
    Array.from({length:BEAD_ROWS},(_,r)=>{
      const idx = c * BEAD_ROWS + r;
      return idx < items.length ? items[idx] : null;
    })
  );

  const taiCount = txHistory.filter(v=>v==="T").length;
  const xiuCount = txHistory.filter(v=>v==="X").length;
  const total    = txHistory.length;
  const taiPct   = total ? Math.round(taiCount/total*100) : 0;
  const xiuPct   = total ? 100-taiPct : 0;

  return (
    <div style={{padding:"10px 12px"}}>
      {/* Stats bar */}
      <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"stretch"}}>
        {/* XỈU */}
        <div style={{flex:1,borderRadius:10,background:"rgba(10,26,102,0.7)",border:"1.5px solid rgba(50,80,220,0.7)",padding:"8px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:26,fontWeight:900,color:"#88aaff",lineHeight:1}}>{xiuCount}</div>
          <div style={{fontSize:9,color:"rgba(136,170,255,0.7)",fontWeight:700,letterSpacing:1}}>XỈU</div>
          <div style={{width:"100%",height:4,borderRadius:2,background:"rgba(0,0,0,0.4)",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${xiuPct}%`,background:"linear-gradient(90deg,#3355cc,#88aaff)",borderRadius:2}}/>
          </div>
          <div style={{fontSize:9,color:"rgba(136,170,255,0.6)"}}>{xiuPct}%</div>
        </div>
        {/* Center */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,minWidth:48}}>
          <div style={{fontSize:9,color:"rgba(255,215,0,0.5)",fontWeight:700}}>{total} phiên</div>
          <div style={{width:1,flex:1,background:"rgba(216,162,74,0.3)"}}/>
          <div style={{fontSize:8,color:"rgba(255,255,255,0.25)"}}>tất cả</div>
        </div>
        {/* TÀI */}
        <div style={{flex:1,borderRadius:10,background:"rgba(138,0,16,0.7)",border:"1.5px solid rgba(196,30,58,0.7)",padding:"8px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{fontSize:26,fontWeight:900,color:"#ff8888",lineHeight:1}}>{taiCount}</div>
          <div style={{fontSize:9,color:"rgba(255,136,136,0.7)",fontWeight:700,letterSpacing:1}}>TÀI</div>
          <div style={{width:"100%",height:4,borderRadius:2,background:"rgba(0,0,0,0.4)",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${taiPct}%`,background:"linear-gradient(90deg,#C41E3A,#ff8888)",borderRadius:2}}/>
          </div>
          <div style={{fontSize:9,color:"rgba(255,136,136,0.6)"}}>{taiPct}%</div>
        </div>
      </div>

      {/* Bead road grid — column-based with session/score labels */}
      <div style={{fontSize:9,color:"rgba(255,215,0,0.55)",fontWeight:900,marginBottom:6,letterSpacing:1}}>
        CẦU ĐƯỜNG — {total} phiên ({BEAD_ROWS} hàng × {numCols} cột)
      </div>
      <div style={{
        overflowX:"auto",borderRadius:8,
        border:"1px solid rgba(216,162,74,0.3)",
        background:"rgba(0,0,0,0.55)",
        padding:"6px 6px",
        WebkitOverflowScrolling:"touch",
      }}>
        <div style={{display:"flex",gap:BEAD_GAP,minWidth:"max-content",alignItems:"flex-start"}}>
          {grid.map((col,ci)=>{
            // gather diceHistory records for this column
            const colRecs: DiceRecord[] = [];
            for(let ri=0;ri<BEAD_ROWS;ri++){
              const pos=ci*BEAD_ROWS+ri;
              const r=getRecord(pos);
              if(r) colRecs.push(r);
            }
            const firstRec=colRecs[0]??null;
            const lastRec=colRecs[colRecs.length-1]??null;
            const sessionLabel=firstRec
              ?(firstRec.session===lastRec?.session
                  ?`P.${firstRec.session}`
                  :`P.${firstRec.session}~${lastRec?.session}`)
              :`${ci+1}`;
            const sums=colRecs.map(r=>r.dice[0]+r.dice[1]+r.dice[2]);
            const sumLabel=sums.length>0
              ?(sums.length===1?`${String.fromCharCode(0x03A3)}${sums[0]}`:`${String.fromCharCode(0x03A3)}${Math.min(...sums)}~${Math.max(...sums)}`)
              :"";
            return (
              <div key={ci} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:BEAD_GAP}}>
                {col.map((val,ri)=>{
                  const isTai=val==="T";
                  const isEmpty=val===null;
                  return (
                    <div key={ri} style={{
                      width:BEAD_SZ,height:BEAD_SZ,borderRadius:"50%",flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      background:isEmpty
                        ?"rgba(255,255,255,0.04)"
                        :isTai
                          ?"radial-gradient(circle at 35% 30%,#ff8888,#C41E3A 55%,#7a0010)"
                          :"radial-gradient(circle at 35% 30%,#88aaff,#3355cc 55%,#0a1a66)",
                      border:isEmpty
                        ?"1px dashed rgba(255,215,0,0.1)"
                        :isTai
                          ?"2px solid rgba(255,100,100,0.7)"
                          :"2px solid rgba(100,140,255,0.7)",
                      boxShadow:isEmpty?"none"
                        :isTai
                          ?"0 0 6px rgba(196,30,58,0.5)"
                          :"0 0 6px rgba(50,80,220,0.5)",
                    }}>
                      {!isEmpty&&(
                        <span style={{fontSize:9,fontWeight:900,color:"rgba(255,255,255,0.9)",lineHeight:1,userSelect:"none"}}>{val}</span>
                      )}
                    </div>
                  );
                })}
                {/* column label: phiên + tổng điểm */}
                <div style={{width:BEAD_SZ,textAlign:"center",paddingTop:2}}>
                  <div style={{fontSize:6.5,fontWeight:800,color:colRecs.length?"rgba(255,215,0,0.65)":"rgba(255,255,255,0.2)",lineHeight:1.3,whiteSpace:"nowrap"}}>{sessionLabel}</div>
                  {sumLabel&&<div style={{fontSize:6,color:colRecs.length===1
                    ?(sums[0]>=11?"rgba(255,120,120,0.85)":"rgba(120,160,255,0.85)")
                    :"rgba(255,215,0,0.45)",lineHeight:1.3,whiteSpace:"nowrap"}}>{sumLabel}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Streak analysis */}
      {total>=2&&(()=>{
        // Find current streak
        let streak=1, cur=txHistory[0];
        for(let i=1;i<txHistory.length;i++){
          if(txHistory[i]===cur) streak++;
          else break;
        }
        const isTaiStreak=cur==="T";
        return (
          <div style={{marginTop:8,borderRadius:8,background:"rgba(0,0,0,0.35)",border:"1px solid rgba(139,94,0,0.2)",padding:"7px 12px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>Chuỗi hiện tại:</span>
            <span style={{
              fontSize:12,fontWeight:900,
              color:isTaiStreak?"#ff8888":"#88aaff",
            }}>{streak} {isTaiStreak?"TÀI":"XỈU"} liên tiếp</span>
            <div style={{flex:1}}/>
            <span style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>
              {txHistory.slice(0,5).map((v,i)=>(
                <span key={i} style={{
                  display:"inline-block",width:14,height:14,borderRadius:"50%",
                  background:v==="T"?"#C41E3A":"#3355cc",
                  margin:"0 1px",verticalAlign:"middle",
                  fontSize:7,lineHeight:"14px",textAlign:"center",color:"#fff",fontWeight:900
                }}>{v}</span>
              ))}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

/* Dice trajectory chart */
const DICE_COLORS=[
  {main:"#e03030",light:"#ff8888",label:"Xúc xắc 1"},
  {main:"#c8a000",light:"#FFD700",label:"Xúc xắc 2"},
  {main:"#1a6fd4",light:"#6eaaff",label:"Xúc xắc 3"},
];
const MAX_SESSIONS=20;
const CHART_CELL=18, CHART_GAP=18;

function DiceChart({diceHistory}:{diceHistory:DiceRecord[]}) {
  const [visible,setVisible]=useState([true,true,true]);
  const toggle=(i:number)=>setVisible(v=>v.map((b,j)=>j===i?!b:b));

  // Chỉ hiện phiên MỚI NHẤT (index 0 = newest)
  const latest = diceHistory[0] ?? null;

  const LABEL_W=28, DOT_R=7, ROW_H=22, TOP_PAD=12, BOT_PAD=20;
  const svgH=6*ROW_H+8+TOP_PAD+BOT_PAD;
  const svgW=LABEL_W+60; // single column
  const cx=LABEL_W+30;
  const yOf=(val:number)=>(6-val)*ROW_H+ROW_H/2+4+TOP_PAD;

  if(!latest) return (
    <div style={{color:"rgba(255,255,255,0.3)",fontSize:10,textAlign:"center",padding:"32px 0"}}>
      Chờ kết quả phiên đầu tiên…
    </div>
  );

  const sum=latest.dice[0]+latest.dice[1]+latest.dice[2];
  const isTai=sum>=11;

  return (
    <div style={{padding:"10px 12px"}}>
      {/* ── Hàng nút toggle + giá trị phiên mới nhất (cùng hàng) ── */}
      <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
        {DICE_COLORS.map((c,i)=>(
          <button key={i} onClick={()=>toggle(i)} style={{
            display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,
            background:visible[i]?c.main:"rgba(255,255,255,0.06)",
            border:`1.5px solid ${visible[i]?c.light:"rgba(255,255,255,0.2)"}`,
            color:visible[i]?"#fff":"rgba(255,255,255,0.35)",
            fontSize:9,fontWeight:700,cursor:"pointer",
            WebkitTapHighlightColor:"transparent",
          }}>
            <div style={{width:8,height:8,borderRadius:"50%",background:visible[i]?c.light:"rgba(255,255,255,0.2)"}}/>
            {c.label}
            {/* ── Giá trị phiên mới nhất hiện ngay cùng hàng với button ── */}
            <span style={{
              marginLeft:2,
              background:"rgba(0,0,0,0.4)",
              borderRadius:10,padding:"1px 6px",
              fontFamily:"monospace",fontWeight:900,fontSize:10,
              color:visible[i]?c.light:"rgba(255,255,255,0.3)",
            }}>{latest.dice[i]}</span>
          </button>
        ))}
        {/* Session info + tổng */}
        <span style={{marginLeft:"auto",fontSize:9,color:"rgba(255,215,0,0.6)",fontWeight:700,whiteSpace:"nowrap"}}>
          P.{latest.session} &nbsp;·&nbsp;
          <span style={{color:"rgba(255,215,0,0.9)"}}>Σ{sum}</span> →
          <span style={{color:isTai?"rgba(255,120,120,1)":"rgba(120,160,255,1)",fontWeight:900,marginLeft:4}}>
            {isTai?"TÀI":"XỈU"}
          </span>
        </span>
      </div>

      {/* ── Biểu đồ cột đơn cho phiên mới nhất ── */}
      <div style={{borderRadius:8,border:"1px solid rgba(216,162,74,0.35)",background:"rgba(0,0,0,0.55)",overflowX:"auto"}}>
        <svg width={svgW} height={svgH} style={{display:"block"}}>
          {/* horizontal grid lines + labels */}
          {[6,5,4,3,2,1].map((val)=>{
            const y=yOf(val);
            return (
              <g key={val}>
                <line x1={LABEL_W} y1={y} x2={svgW} y2={y} stroke="rgba(139,94,0,0.3)" strokeWidth="1" strokeDasharray="3,4"/>
                <text x={LABEL_W-4} y={y+3.5} textAnchor="end" fontSize={9} fill="rgba(255,215,0,0.6)" fontWeight="700">{val}</text>
              </g>
            );
          })}
          {/* bottom result label */}
          <text x={cx} y={svgH-BOT_PAD+14} textAnchor="middle" fontSize={9} fontWeight="900"
            fill={isTai?"rgba(255,100,100,0.9)":"rgba(100,150,255,0.9)"}>
            {isTai?"TÀI":"XỈU"}
          </text>
          {/* dots for each die */}
          {DICE_COLORS.map((c,di)=>{
            if(!visible[di]) return null;
            const cy2=yOf(latest.dice[di]);
            return (
              <g key={di}>
                <circle cx={cx} cy={cy2} r={DOT_R+3} fill={c.main} opacity={0.2}/>
                <circle cx={cx} cy={cy2} r={DOT_R} fill={c.main} stroke={c.light} strokeWidth="1.5"/>
                <text x={cx} y={cy2+3.5} textAnchor="middle" fontSize={9} fontWeight="900" fill="#fff">{latest.dice[di]}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function SoiCauPopup({txHistory,diceHistory,onClose}:{txHistory:Array<"T"|"X">;diceHistory:DiceRecord[];onClose:()=>void}) {
  const [tab,setTab]=useState(0);
  const tabStyle=(active:boolean)=>({
    flex:1,padding:"8px 4px",fontSize:10,fontWeight:900,cursor:"pointer",letterSpacing:0.5,
    background:active?"linear-gradient(180deg,rgba(216,162,74,0.18),rgba(139,94,0,0.1))":"transparent",
    border:"none",borderBottom:active?"2px solid #FFD700":"2px solid transparent",
    color:active?"#FFD700":"rgba(255,255,255,0.4)",
    transition:"all .15s",WebkitTapHighlightColor:"transparent",
  });
  return (
    <PopupShell title="SOI CẦU" onClose={onClose} wide>
      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid rgba(139,94,0,0.4)"}}>
        <button style={tabStyle(tab===0)} onClick={()=>setTab(0)}>🔵 CẦU ĐƯỜNG</button>
        <button style={tabStyle(tab===1)} onClick={()=>setTab(1)}>📈 BIỂU ĐỒ XÚC XẮC</button>
      </div>
      {tab===0 && <BeadRoad txHistory={txHistory} diceHistory={diceHistory}/>}
      {tab===1 && <DiceChart diceHistory={diceHistory}/>}
    </PopupShell>
  );
}

/* ═══════════════════════════════════════════
   LỊCH SỬ CHƠI POPUP — detailed bet history
═══════════════════════════════════════════ */
const PAYOUT_RATE=1.95;
function HistoryPopup({history,onClose}:{history:BetRecord[];onClose:()=>void}) {
  const [filter,setFilter]=useState<"all"|"won"|"lost">("all");
  const [page,setPage]=useState(0);
  const PAGE_SIZE=10;

  const filtered=useMemo(()=>history.filter(b=>
    filter==="all"?true:filter==="won"?b.won:!b.won
  ),[history,filter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const curPage=Math.min(page,totalPages-1);
  const paged=filtered.slice(curPage*PAGE_SIZE,(curPage+1)*PAGE_SIZE);

  const pBtnStyle:{[k:string]:string|number}={
    padding:"3px 9px",borderRadius:6,fontSize:12,fontWeight:900,cursor:"pointer",
    background:"rgba(139,94,0,0.3)",border:"1px solid rgba(139,94,0,0.5)",color:"#FFD700",
  };

  const filterBtns:[string,"all"|"won"|"lost"][]=[["Tất cả","all"],["Thắng","won"],["Thua","lost"]];

  return (
    <PopupShell title="LỊCH SỬ CHƠI" onClose={onClose} wide>
      <div style={{padding:"8px 10px"}}>
        {/* Filters */}
        <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
          {filterBtns.map(([label,key])=>(
            <button key={key} onClick={()=>{setFilter(key);setPage(0);}} style={{
              padding:"4px 13px",borderRadius:20,fontSize:10,fontWeight:900,cursor:"pointer",
              background:filter===key?"linear-gradient(135deg,#b8860b,#FFD700)":"rgba(0,0,0,0.4)",
              border:`1px solid ${filter===key?"#FFD700":"rgba(139,94,0,0.4)"}`,
              color:filter===key?"#1a0800":"rgba(255,215,0,0.6)",
            }}>{label}</button>
          ))}
          <span style={{marginLeft:"auto",fontSize:9,color:"rgba(255,255,255,0.3)"}}>{filtered.length} lượt</span>
        </div>

        {filtered.length===0?(
          <div style={{padding:"28px",textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:11}}>
            {history.length===0?"Chưa có lịch sử chơi nào":"Không có lượt khớp bộ lọc"}
          </div>
        ):(
          <>
          {/* Table header */}
          <div style={{
            display:"grid",gridTemplateColumns:"52px 1fr 32px 68px 60px 68px",
            padding:"5px 8px",fontSize:8,fontWeight:900,letterSpacing:0.5,
            color:"rgba(255,215,0,0.5)",borderBottom:"1px solid rgba(139,94,0,0.35)",gap:4,
          }}>
            <span>PHIÊN</span><span>THỜI GIAN</span><span>CỬA</span>
            <span style={{textAlign:"right"}}>ĐẶT</span><span style={{textAlign:"center"}}>KẾT QUẢ</span>
            <span style={{textAlign:"right"}}>NHẬN</span>
          </div>
          {/* Rows */}
          {paged.map((b,i)=>{
            const received=b.won?Math.floor(b.amount*PAYOUT_RATE):0;
            return (
              <div key={i} style={{
                display:"grid",gridTemplateColumns:"52px 1fr 32px 68px 60px 68px",
                padding:"7px 8px",gap:4,alignItems:"center",
                borderBottom:"1px solid rgba(255,255,255,0.04)",
                background:i%2===0?"transparent":"rgba(255,255,255,0.015)",
              }}>
                <span style={{fontSize:9,color:"rgba(255,215,0,0.5)"}}>#{b.session}</span>
                <span style={{fontSize:8,color:"rgba(255,255,255,0.35)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.time}</span>
                <div style={{
                  width:22,height:22,borderRadius:"50%",flexShrink:0,
                  background:b.side==="TAI"?"radial-gradient(#ff5555,#aa1111)":"radial-gradient(#7788ff,#2233bb)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:8,fontWeight:900,color:"#fff",
                }}>{b.side==="TAI"?"T":"X"}</div>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.6)",textAlign:"right"}}>{fmtVN(b.amount)}</span>
                <div style={{textAlign:"center"}}>
                  <span style={{
                    fontSize:9,fontWeight:900,padding:"2px 5px",borderRadius:6,
                    color:b.won?"#44ee88":"#ff5555",
                    background:b.won?"rgba(68,238,136,0.1)":"rgba(255,85,85,0.1)",
                  }}>{b.won?"THẮNG":"THUA"}</span>
                </div>
                <span style={{fontSize:9,fontWeight:900,textAlign:"right",color:b.won?"#FFD700":"rgba(255,255,255,0.25)"}}>
                  {b.won?fmtVN(received):"—"}
                </span>
              </div>
            );
          })}
          {/* Pagination */}
          {totalPages>1&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"8px 0 2px",borderTop:"1px solid rgba(139,94,0,0.2)"}}>
              <button onClick={()=>setPage(0)} disabled={curPage===0} style={{...pBtnStyle,opacity:curPage===0?0.3:1}}>«</button>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={curPage===0} style={{...pBtnStyle,opacity:curPage===0?0.3:1}}>‹</button>
              <span style={{fontSize:9,color:"rgba(255,215,0,0.6)",minWidth:56,textAlign:"center"}}>{curPage+1} / {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={curPage>=totalPages-1} style={{...pBtnStyle,opacity:curPage>=totalPages-1?0.3:1}}>›</button>
              <button onClick={()=>setPage(totalPages-1)} disabled={curPage>=totalPages-1} style={{...pBtnStyle,opacity:curPage>=totalPages-1?0.3:1}}>»</button>
            </div>
          )}
          </>
        )}
      </div>
    </PopupShell>
  );
}

/* ════════════════════════════════════
   THROWING EFFECT — orbital toss
════════════════════════════════════ */
const SPARK_ANGLES = [0,30,60,90,120,150,180,210,240,270,300,330];
function ThrowingEffect() {
  return (
    <div style={{
      position:"relative", width:110, height:110,
      display:"flex", alignItems:"center", justifyContent:"center",
      overflow:"visible",
    }}>
      {/* 3 expanding ripple rings, staggered */}
      {[0, 295, 590].map((delay, i) => (
        <div key={i} className="throw-ripple" style={{
          position:"absolute",
          width: 68, height: 68,
          borderRadius:"50%",
          border: `${2.2 - i*0.4}px solid rgba(255,${185+i*15},0,${0.9-i*0.25})`,
          animationDelay:`${delay}ms`,
          pointerEvents:"none",
          boxSizing:"border-box",
        }}/>
      ))}

      {/* 12 spark arms radiating outward */}
      {SPARK_ANGLES.map((angle, i) => (
        <div key={i} style={{
          position:"absolute",
          width:"100%", height:"100%",
          transform:`rotate(${angle}deg)`,
          transformOrigin:"50% 50%",
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          pointerEvents:"none",
        }}>
          <div className="throw-spark" style={{
            animationDelay:`${(i * 0.043).toFixed(3)}s`,
            animationDuration: i%3===0?"0.52s": i%3===1?"0.46s":"0.58s",
            width:  i%2===0 ? 6 : 4,
            height: i%2===0 ? 6 : 4,
            borderRadius:"50%",
            flexShrink:0,
            background: i%3===0
              ? "radial-gradient(circle,#ffffff 0%,#FFD700 45%,rgba(255,200,0,0))"
              : i%3===1
              ? "radial-gradient(circle,#fff8cc 0%,#FFA500 50%,rgba(255,150,0,0))"
              : "radial-gradient(circle,#ffeeaa 0%,#ff8800 60%,rgba(255,100,0,0))",
            boxShadow: "0 0 5px rgba(255,215,0,0.9)",
          }}/>
        </div>
      ))}

      {/* 3 dice tumbling in the air — each in its own flex-centred layer */}
      {([
        {cls:"dice-toss-0", val:2, sz:30},
        {cls:"dice-toss-1", val:5, sz:28},
        {cls:"dice-toss-2", val:3, sz:26},
      ] as {cls:string;val:number;sz:number}[]).map(({cls,val,sz})=>(
        <div key={cls} style={{
          position:"absolute", top:0, left:0, right:0, bottom:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          pointerEvents:"none", zIndex:2,
        }}>
          <div className={`${cls} throw-glow`} style={{display:"inline-flex"}}>
            <DiceFace val={val} size={sz}/>
          </div>
        </div>
      ))}

      {/* Label */}
      <div style={{
        position:"absolute", bottom:1, left:"50%", transform:"translateX(-50%)",
        color:"rgba(255,215,0,0.92)", fontSize:8, fontWeight:900, letterSpacing:1.5,
        textShadow:"0 0 10px rgba(255,215,0,0.7)", whiteSpace:"nowrap",
        pointerEvents:"none", zIndex:3,
      }}>✦ ĐANG LẮC ✦</div>
    </div>
  );
}

/* ════════════════════════════════════
   MAIN PAGE
════════════════════════════════════ */
export default function TaiXiuPage() {
  const {data:me}=useGetMe();
  const [balance,setBalance]=useState(50_000_000);
  useEffect(()=>{if(me?.balance)setBalance(me.balance);},[me?.balance]);

  const [jackpot,setJackpot]=useState(0);

  const [phase,setPhase]       = useState<Phase>("BETTING");
  const [countdown,setCountdown] = useState(ROUND);
  const [dice,setDice]         = useState([1,3,4]);
  const [history,setHistory]   = useState<Array<"T"|"X">>([]);
  const [diceHistory,setDiceHistory] = useState<DiceRecord[]>([]);
  const [betHistory,setBetHistory]   = useState<BetRecord[]>([]);
  const [sessionId,setSessionId]     = useState(6_800_580);
  const sessionIdRef = useRef(6_800_580);
  const [leaderboard,setLeaderboard] = useState<LBEntry[]>([]);
  useEffect(()=>{
    const load=()=>{
      fetch("/api/leaderboard")
        .then(r=>r.json())
        .then((rows:Array<{username:string;totalWinnings:number;gamesPlayed:number;winRate:number}>)=>{
          if(!Array.isArray(rows)||rows.length===0) return;
          setLeaderboard(rows.slice(0,10).map(r=>({
            name:r.username,
            totalWin:r.totalWinnings,
            gamesPlayed:r.gamesPlayed,
            wins:Math.round(r.gamesPlayed*(r.winRate/100)),
          })));
        })
        .catch(()=>{});
    };
    load();
    const t=setInterval(load,30_000);
    return ()=>clearInterval(t);
  },[]);
  // Số tiền & số người chơi là thật — chỉ tính từ cược thực của player
  // (không dùng state giả lập nữa, derive trực tiếp từ taiBet/xiuBet bên dưới)
  const [winStreak,setWinStreak]   = useState(0);
  const [loseStreak,setLoseStreak] = useState(0);
  const [taiBet,setTaiBet]     = useState(0);
  const [xiuBet,setXiuBet]     = useState(0);
  const [fakeTaiPool,setFakeTaiPool] = useState(0);
  const [fakeXiuPool,setFakeXiuPool] = useState(0);
  const [onlinePlayers,setOnlinePlayers] = useState(1);
  const wsRef = useRef<WebSocket|null>(null);
  // Fake bettors generated each round — only used for even-count condition & display
  const roundFakeRef = useRef<{tai:number;xiu:number;topBet:number}>({tai:0,xiu:0,topBet:0});
  const sessionBotsRef = useRef<{tai:PlayerBet[];xiu:PlayerBet[]}>({tai:[],xiu:[]});
  // Derived — số tiền & người chơi (thật + fake)
  const taiTotal = taiBet + fakeTaiPool;
  const xiuTotal = xiuBet + fakeXiuPool;
  const taiCount = (taiBet > 0 ? 1 : 0) + roundFakeRef.current.tai;
  const xiuCount = (xiuBet > 0 ? 1 : 0) + roundFakeRef.current.xiu;
  const [chip,setChip]         = useState(0);
  const [popup,setPopup]       = useState<Popup>(null);
  const [winResult,setWinResult] = useState<{won:boolean;amount:number}|null>(null);
  const [justRevealed,setJustRevealed] = useState(false);
  const [handMode,setHandMode] = useState(false);
  const [selectedSide,setSelectedSide] = useState<"TAI"|"XIU"|null>(null);
  const [resultCountdown,setResultCountdown] = useState(15);
  const [jackpotLog,setJackpotLog] = useState<JackpotRecord[]>([]);
  const [showJackpotLog,setShowJackpotLog] = useState(false);
  const [jackpotToast,setJackpotToast] = useState<number|null>(null);
  const [jackpotBurst,setJackpotBurst] = useState<number|null>(null); // amount won when jackpot explodes
  const [sessionBetLog,setSessionBetLog] = useState<SessionBetRecord[]>([]);
  const [selectedBeadIdx,setSelectedBeadIdx] = useState<number|null>(null);
  const [lateBetToast,setLateBetToast] = useState(false);
  const [showWelcome,setShowWelcome] = useState(true);
  const [lidRevealedByDrag,setLidRevealedByDrag] = useState(false); // true only when player hand-dragged the lid off

  const timerRef       = useRef<ReturnType<typeof setInterval>|null>(null);
  const phaseRef       = useRef<ReturnType<typeof setTimeout>|null>(null);
  const pendingDice    = useRef<number[]>([1,3,4]);
  const hasTouchedBowl = useRef(false);
  const revealedRef    = useRef(false);
  const bgmStarted     = useRef(false);
  const betPlacedAtRef = useRef<number>(ROUND); // countdown value when player placed bet

  const [focused, setFocused] = useState(true);
  const panelDragging  = useRef(false);
  const panelDragOffset = useRef({x:0,y:0});
  const [panelPos,setPanelPos] = useState<{x:number;y:number}|null>(null);
  const panelRef       = useRef<HTMLDivElement>(null);
  const circleRef      = useRef<HTMLDivElement>(null);

  // Cup lift animation state (auto mode)
  const [cupLifting, setCupLifting] = useState(false);

  // Lid (nắp bát) drag state — independent of panel
  const [lidPos,setLidPos] = useState<{x:number;y:number}|null>(null);
  const lidDragging    = useRef(false);
  const lidDragOffset  = useRef({x:0,y:0});
  const lidOrigin      = useRef({x:0,y:0});

  // Keep doResult in a ref to avoid stale closures in timers
  const doResultRef = useRef<()=>void>(()=>{});

  /* ── Go WebSocket — kết nối realtime với Go Game Server ── */
  useEffect(()=>{
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url   = `${proto}//${location.host}/game/ws?room=room-1`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect(){
      if(!alive) return;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          // Messages can be newline-delimited (writePump batches them)
          const lines = (evt.data as string).split("\n").filter(Boolean);
          for(const line of lines){
            const msg = JSON.parse(line) as {
              type: string;
              taiPool: number; xiuPool: number;
              players: number;
            };
            if(msg.type !== "state") continue;
            // Update pool totals (Go server includes all players' + fake bets)
            setFakeTaiPool(msg.taiPool);
            setFakeXiuPool(msg.xiuPool);
            // Update live online player count from Go server
            if(msg.players > 0) setOnlinePlayers(msg.players);
          }
        } catch(_){}
      };

      ws.onclose = () => {
        wsRef.current = null;
        if(alive) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => { ws.close(); };
    }

    connect();
    return ()=>{
      alive = false;
      if(reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
    };
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* ── Responsive layout ── */
  const [winW,setWinW] = useState(()=>window.innerWidth);
  const [winH,setWinH] = useState(()=>window.innerHeight);
  useEffect(()=>{
    const h=()=>{setWinW(window.innerWidth);setWinH(window.innerHeight);setPanelPos(null);};
    window.addEventListener("resize",h);
    window.addEventListener("orientationchange",h);
    return ()=>{window.removeEventListener("resize",h);window.removeEventListener("orientationchange",h);};
  },[]);
  const isMobileLandscape = winW > winH && winH < 600;
  const isMobilePortrait  = winW <= 600;
  const isMobile = isMobileLandscape || isMobilePortrait;
  // szF: scale factor for the panel (CSS transform, 1 = desktop unchanged)
  const szFBase = isMobileLandscape
    ? Math.min((winW * 0.72) / 416, (winH - 20) / 310, 1.6)
    : isMobilePortrait
      ? Math.min((winW - 60) / 416, 1)
      : 1;
  const szF = szFBase * (focused ? 1 : 0.72);

  function getPanelCenter(){
    if(isMobile) return {x:winW/2, y:winH/2};
    return {x:window.innerWidth/2,y:Math.max(window.innerHeight/2-30,300)};
  }
  const pPos = panelPos ?? getPanelCenter();

  /* ── Init lid when THROWING+handMode ── */
  useEffect(()=>{
    if(phase==="THROWING"&&handMode){
      // position the lid over the center circle
      const tryInit=()=>{
        if(circleRef.current){
          const r=circleRef.current.getBoundingClientRect();
          const cx=r.left+r.width/2, cy=r.top+r.height/2;
          setLidPos({x:cx,y:cy});
          lidOrigin.current={x:cx,y:cy};
        } else {
          setTimeout(tryInit,60);
        }
      };
      setTimeout(tryInit,60);
    } else {
      setLidPos(null);
      lidDragging.current=false;
    }
  },[phase,handMode]);

  /* ── Phase logic ── */
  const startRound = useCallback(()=>{
    revealedRef.current=false;
    hasTouchedBowl.current=false;
    const next=sessionIdRef.current+1;
    sessionIdRef.current=next;
    setSessionId(next);
    setPhase("BETTING"); setCountdown(ROUND);
    setTaiBet(0); setXiuBet(0); setWinResult(null);
    setFakeTaiPool(0); setFakeXiuPool(0);
    setJustRevealed(false); setLidPos(null); setSelectedSide(null); setChip(0); setLidRevealedByDrag(false);
    // Generate fake bettors mỗi phiên (dùng cho điều kiện số người chẵn & hiển thị)
    // 0-17 fake players, chia ngẫu nhiên giữa Tài và Xỉu
    const totalFake = Math.floor(Math.random() * 18); // 0-17
    const fakeTai = Math.floor(Math.random() * (totalFake + 1));
    const fakeXiu = totalFake - fakeTai;
    // Mức cược cao nhất của fake players (2k – 2M)
    const topFakeBet = totalFake > 0 ? Math.floor(Math.random() * 2_000_000) + 2_000 : 0;
    roundFakeRef.current = {tai: fakeTai, xiu: fakeXiu, topBet: topFakeBet};
    // Sinh bot cho lịch sử phiên — tên lấy không lặp, mỗi phiên bộ tên khác nhau
    const botCount = randInt(3, 10);
    const botNames = pickRandPlayers(botCount);
    const botTaiCount = randInt(1, botCount - 1); // luôn có ít nhất 1 mỗi cửa
    const botTaiBets: PlayerBet[] = botNames.slice(0, botTaiCount).map(name => ({name, amount: CHIPS[randInt(0,5)].value * randInt(1,8)}));
    const botXiuBets: PlayerBet[] = botNames.slice(botTaiCount).map(name => ({name, amount: CHIPS[randInt(0,5)].value * randInt(1,8)}));
    sessionBotsRef.current = {tai: botTaiBets, xiu: botXiuBets};
    setShowWelcome(true);
    setTimeout(()=>setShowWelcome(false),1000);
  },[]);

  // Betting countdown
  useEffect(()=>{
    if(phase!=="BETTING") return;
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      setCountdown(c=>{
        if(c<=1){
          clearInterval(timerRef.current!);
          pendingDice.current=[randInt(1,6),randInt(1,6),randInt(1,6)];
          playShake();
          setPhase("THROWING");
          return 0;
        }
        return c-1;
      });
    },1000);
    return ()=>{if(timerRef.current)clearInterval(timerRef.current);};
  },[phase]);

  useEffect(()=>{
    if(phase!=="THROWING") return;
    if(handMode) return; // player opens manually — no auto-timer
    phaseRef.current=setTimeout(()=>doResultRef.current(),THROW_MS);
    return ()=>{if(phaseRef.current)clearTimeout(phaseRef.current);};
  },[phase,handMode]);

  useEffect(()=>{
    if(phase!=="RESULT") return;
    setResultCountdown(15);
    let c=15;
    const t=setInterval(()=>{
      c--;
      setResultCountdown(c);
      if(c<=0){clearInterval(t);startRound();}
    },1000);
    return ()=>clearInterval(t);
  },[phase,startRound]);

  /* ── Hand mode: auto-open timer ── */
  useEffect(()=>{
    if(phase!=="THROWING"||!handMode) return;
    hasTouchedBowl.current=false;
    const t=setTimeout(()=>{if(!hasTouchedBowl.current)doResultRef.current();},10_000);
    return ()=>clearTimeout(t);
  },[phase,handMode]);

  function doResult(){
    if(revealedRef.current) return;
    revealedRef.current=true;
    const d=pendingDice.current as [number,number,number];
    setDice(d);
    const sum=d.reduce((a,b)=>a+b,0);
    const isTai=sum>=11;
    const timeStr=new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    const sid=sessionIdRef.current;
    setHistory(h=>[isTai?"T":"X",...h.slice(0,19)]);
    setDiceHistory(h=>[{session:sid,dice:d,result:isTai?"T":"X",time:timeStr},...h.slice(0,47)]);

    const tb=taiBet; const xb=xiuBet;
    const isLateBet = betPlacedAtRef.current <= LATE_BET_SECS;

    // Log cược: "Bạn" (nếu có) + bots phiên này (tên ngẫu nhiên không lặp)
    const bots = sessionBotsRef.current;
    const realTai:PlayerBet[]=[
      ...(tb>0?[{name:"Bạn",amount:tb,refunded:isLateBet&&isTai}]:[]),
      ...bots.tai,
    ];
    const realXiu:PlayerBet[]=[
      ...(xb>0?[{name:"Bạn",amount:xb,refunded:false}]:[]),
      ...bots.xiu,
    ];
    setSessionBetLog(prev=>[{session:sid,result:isTai?"T":"X",tai:realTai,xiu:realXiu,dice:d,time:timeStr},...prev.slice(0,19)]);

    if(tb>0||xb>0){
      const side:BetRecord["side"]=tb>0?"TAI":"XIU";
      const betAmount=tb+xb;
      const won=isTai?(tb>0):(xb>0);

      // Late bet rule: thắng trong 8s cuối → hoàn tiền, thua → không hoàn
      let profit: number;
      if(isLateBet && won){
        profit=0; // tiền cược được hoàn lại (không lợi, không lỗ)
        setLateBetToast(true);
        setTimeout(()=>setLateBetToast(false),3000);
      } else {
        profit=won?Math.floor(betAmount*(PAYOUT-1)):-betAmount;
      }

      setBalance(b=>b+profit);
      // Persist balance + win/loss count to server (fire-and-forget)
      if(profit!==0){
        fetch("/api/transactions",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({type:profit>0?"win":"loss",amount:Math.abs(profit)}),
        }).catch(()=>{});
      }
      if(won&&!isLateBet) setWinStreak(w=>w+1); else if(!won) setWinStreak(0);
      if(!won){
        setLoseStreak(l=>l+1);
        const contribution=Math.floor(betAmount*0.001); // 0.1% tiền thua → hũ
        if(contribution>0){
          setJackpot(j=>j+contribution);
          setJackpotToast(contribution);
          setTimeout(()=>setJackpotToast(null),2200);
        }
      } else if(!isLateBet) setLoseStreak(0);

      // ── Nổ hũ ──
      // Điều kiện 1: bộ ba (triple) → guaranteed burst
      // Điều kiện 2: xác suất tăng dần theo hũ (0.1% → 5%)
      // Phần thưởng tỷ lệ thuận với tiền cược, CAP = betAmount × 100
      // Ví dụ: hũ 1B, cược 10k → nhận tối đa 1M (10k×100), hũ còn 999M
      //        hũ 1B, cược 10M → nhận tối đa 1B (10M×100=1B), hũ về 0
      const isTriple = (d[0]===1 && d[1]===1 && d[2]===1) || (d[0]===6 && d[1]===6 && d[2]===6);
      const hasBet   = tb>0 || xb>0;
      // Tổng người cược phiên này = player (nếu có) + fake bettors
      const {tai:fakeTai, xiu:fakeXiu} = roundFakeRef.current;
      const totalBettors = (hasBet ? 1 : 0) + fakeTai + fakeXiu;
      // ĐK chẵn: tổng người cược phải là số CHẴN > 0
      const isEvenBettors = totalBettors > 0 && totalBettors % 2 === 0;
      if(hasBet && isEvenBettors){
        setJackpot(prev=>{
          if(prev<=0) return prev;
          const randBurstChance = Math.min(0.05, 0.001 + (prev / 1_000_000_000) * 0.05);
          const randBurst = Math.random() < randBurstChance;
          if(isTriple || randBurst){
            // Nhà cái ăn 50%, 50% còn lại chia ĐỀU cho tất cả người chơi
            // totalBettors = player (1) + fake bettors
            const playerShare = Math.floor(prev * 0.5 / totalBettors);
            setBalance(b => b + playerShare);
            setJackpotBurst(playerShare);
            playJackpot();
            setTimeout(() => setJackpotBurst(null), 5000);
            // Ghi lịch sử nổ hũ
            setJackpotLog(jl=>[{
              session:sid, winner:"Bạn",
              side:tb>0?"TAI":"XIU",
              bet:tb+xb, payout:playerShare,
              dice:d, time:timeStr,
            },...jl.slice(0,29)]);
            return 0; // hũ reset về 0 hoàn toàn
          }
          return prev;
        });
      }
      if(won&&!isLateBet) playWin(); else if(!won) playLose();
      setWinResult({won:won&&!isLateBet,amount:isLateBet&&won?0:Math.abs(profit)});
      setBetHistory(h=>[{session:sid,side,amount:betAmount,won:won&&!isLateBet,time:timeStr},...h.slice(0,49)]);
      setLeaderboard(lb=>{
        const idx=lb.findIndex(e=>e.name==="Bạn");
        if(idx<0) return lb;
        const updated=[...lb];
        const didWin=won&&!isLateBet;
        updated[idx]={...updated[idx],gamesPlayed:updated[idx].gamesPlayed+1,wins:updated[idx].wins+(didWin?1:0),totalWin:updated[idx].totalWin+(didWin?Math.abs(profit):0)};
        return updated.sort((a,b)=>b.totalWin-a.totalWin);
      });
    } else {
      // No bet from player — still generate session record for history
    }
    setJustRevealed(true);
    setPhase("RESULT");
    betPlacedAtRef.current=ROUND; // reset for next round
  }
  // Always keep ref up to date
  doResultRef.current=doResult;

  const sum   = dice.reduce((a,b)=>a+b,0);
  const isTai = sum>=11;
  const myWon = (taiBet>0||xiuBet>0)&&phase==="RESULT"
    ? (isTai?(taiBet-xiuBet):(xiuBet-taiBet))>0
    : null;

  /* ── Global pointer tracking ── */
  useEffect(()=>{
    function onMove(e:MouseEvent|TouchEvent){
      const c="touches" in e?e.touches[0]:e;
      // Lid drag takes priority
      if(lidDragging.current){
        const nx=c.clientX-lidDragOffset.current.x;
        const ny=c.clientY-lidDragOffset.current.y;
        setLidPos({x:nx,y:ny});
        const dx=nx-lidOrigin.current.x, dy=ny-lidOrigin.current.y;
        if(Math.sqrt(dx*dx+dy*dy)>110){
          // Player dragged lid far enough off the bowl → mark as hand-revealed
          setLidRevealedByDrag(true);
          lidDragging.current=false;
          setLidPos(null);
          doResultRef.current();
        }
        return;
      }
      if(panelDragging.current){
        const rect=panelRef.current?.getBoundingClientRect();
        const hw=rect?rect.width/2:190, hh=rect?rect.height/2:300;
        const x=Math.max(hw,Math.min(window.innerWidth-hw,  c.clientX-panelDragOffset.current.x));
        const y=Math.max(hh,Math.min(window.innerHeight-50, c.clientY-panelDragOffset.current.y));
        setPanelPos({x,y});
      }
    }
    function onEnd(){panelDragging.current=false; lidDragging.current=false;}
    window.addEventListener("mousemove",onMove,{passive:false});
    window.addEventListener("touchmove",onMove,{passive:false});
    window.addEventListener("mouseup",onEnd);
    window.addEventListener("touchend",onEnd);
    return ()=>{
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("touchmove",onMove);
      window.removeEventListener("mouseup",onEnd);
      window.removeEventListener("touchend",onEnd);
    };
  },[]);// eslint-disable-line

  function onPanelDragStart(e:React.MouseEvent|React.TouchEvent){
    if(isMobile) return; // no drag on mobile — panel stays centered
    // Block panel drag while lid is active (table stays fixed in hand mode)
    if(lidPos) return;
    if((e.target as HTMLElement).closest("button,input,select,.bowl-handle")) return;
    panelDragging.current=true;
    const c="touches" in e?e.touches[0]:e;
    panelDragOffset.current={x:c.clientX-pPos.x,y:c.clientY-pPos.y};
    e.preventDefault();
  }

  function onLidDragStart(e:React.MouseEvent|React.TouchEvent){
    if(!lidPos) return;
    hasTouchedBowl.current=true;
    lidDragging.current=true;
    const c="touches" in e?e.touches[0]:e;
    lidDragOffset.current={x:c.clientX-lidPos.x,y:c.clientY-lidPos.y};
    e.stopPropagation();
    e.preventDefault();
  }

  const PANEL_W=416; const PANEL_H=240;

  /* ── Circle content per phase ── */
  const circleContent = useMemo(()=>{
    if(phase==="BETTING") return (
      <span style={{
        fontSize:countdown<=9?40:33,fontWeight:900,lineHeight:1,fontFamily:"monospace",
        color:countdown<=10?"#ff4444":"#FFD700",
        textShadow:`0 0 18px ${countdown<=10?"rgba(255,68,68,0.9)":"rgba(255,215,0,0.9)"}`,
      }}>{countdown}</span>
    );
    if(phase==="THROWING"&&handMode) return (
      // Hand mode: dice are STILL under the draggable lid (no shake)
      <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
        <div style={{display:"flex",gap:3}}>
          <DiceFace val={pendingDice.current[0]} size={30}/>
          <DiceFace val={pendingDice.current[1]} size={30}/>
        </div>
        <DiceFace val={pendingDice.current[2]} size={30}/>
      </div>
    );
    if(phase==="THROWING") return (
      // Auto mode: bát lắc → bấm mở → xúc xắc bay ra
      <>
        {/* Bát lắc — to hơn, tràn ra ngoài circle */}
        <div
          className={cupLifting ? "cup-lift-out cup-red-glow" : "cup-shake-3d cup-red-glow"}
          onClick={cupLifting ? undefined : (e)=>{
            e.stopPropagation();
            setCupLifting(true);
            setTimeout(()=>{ doResultRef.current(); setCupLifting(false); }, 1500);
          }}
          style={{
            position:"absolute",top:"50%",left:"50%",
            transform:"translate(-50%,-50%)",
            cursor:cupLifting?"default":"pointer",
            zIndex:6,
            clipPath:"circle(50% at 50% 50%)",
          }}
        >
          <DiceCupImg size={150}/>
        </div>
        {/* Hint "BẤM MỞ" — nhấp nháy bên dưới */}
        {!cupLifting&&(
          <div style={{
            position:"absolute",bottom:-18,left:"50%",transform:"translateX(-50%)",
            fontSize:9,fontWeight:900,color:"#FFD700",
            whiteSpace:"nowrap",letterSpacing:2,pointerEvents:"none",
            textShadow:"0 0 10px rgba(255,215,0,0.9), 0 0 20px rgba(255,150,0,0.6)",
            zIndex:7,animation:"winGlow 0.7s ease-in-out infinite",
          }}>✦ BẤM MỞ BÁT ✦</div>
        )}
        {/* placeholder — dice rendered outside CenterCircle */}
      </>
    );
    if(phase==="RESULT") return (
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"visible"}}>
        <DiceTriangle dice={dice} isTai={isTai} sum={sum} noAnim/>
        {/* Bowl-lift animation ONLY when player manually dragged the lid off */}
        {handMode&&lidRevealedByDrag&&(
          <div className="bowl-lift" style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}>
            <DiceCupImg size={110}/>
          </div>
        )}
      </div>
    );
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase, countdown, justRevealed, dice, isTai, sum, handMode, lidRevealedByDrag, cupLifting]);

  return (
    <div className="fixed inset-0 overflow-hidden select-none"
      onClick={()=>{setFocused(false);if(!bgmStarted.current){bgmStarted.current=true;startCasinoBGM();}}}
      style={{
        background:`url(${bgCasinoImg}) center/cover no-repeat`,
      }}
    >


      {/* ── DRAGGABLE LID (hand mode) — fixed on screen, independent of panel ── */}
      {lidPos&&phase==="THROWING"&&handMode&&(
        <div
          onMouseDown={onLidDragStart}
          onTouchStart={onLidDragStart}
          style={{
            position:"fixed",
            left:lidPos.x, top:lidPos.y,
            transform:"translate(-50%,-50%)",
            zIndex:20, cursor:"grab", touchAction:"none",
            userSelect:"none",
          }}
        >
          <div className="cup-red-glow" style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <DiceCupImg size={130}/>
            <div style={{
              marginTop:2,
              color:"#FFD700",fontSize:9,fontWeight:900,whiteSpace:"nowrap",letterSpacing:1,
              textShadow:"0 0 10px rgba(255,215,0,0.9)",
            }}>✦ KÉO MỞ BÁT ✦</div>
          </div>
        </div>
      )}

      {/* ── DRAGGABLE PANEL — grab anywhere ── */}
      <div
        ref={panelRef}
        onMouseDown={onPanelDragStart}
        onTouchStart={onPanelDragStart}
        onClick={(e)=>{e.stopPropagation();setFocused(true);}}
        style={{
          position:"absolute",left:pPos.x,top:pPos.y,
          transform:`translate(-50%,-50%) scale(${szF})`,
          transformOrigin:"center center",
          transition:"transform 0.3s cubic-bezier(.17,.67,.3,1.2), opacity 0.3s ease",
          opacity: focused ? 1 : 0.45,
          zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",
          cursor:"grab",touchAction:"none",willChange:"left,top",userSelect:"none",
          background:"transparent",
          borderRadius:0,
          padding:"0px 0px 6px 0px",
          boxShadow:"none",
        }}
      >

        {/* ── BettingBanner removed — jackpot now in table header ── */}

        {/* ── CASINO TABLE ── */}
        <div style={{position:"relative",width:PANEL_W,height:PANEL_H}}>

          {/* ── RESULT ANNOUNCEMENT BANNER ── */}
          {phase==="RESULT"&&(
            <div style={{
              position:"absolute",
              top:"50%",left:"50%",
              transform:"translate(-50%,-50%)",
              zIndex:15,pointerEvents:"none",
              animation:"resultSlideIn 0.4s cubic-bezier(.17,.67,.3,1.3) both",
            }}>
              <div style={{
                background:isTai
                  ?"linear-gradient(135deg,rgba(80,0,0,0.95),rgba(140,10,30,0.9),rgba(80,0,0,0.95))"
                  :"linear-gradient(135deg,rgba(0,10,60,0.95),rgba(20,40,140,0.9),rgba(0,10,60,0.95))",
                border:`2px solid ${isTai?"rgba(255,100,100,0.8)":"rgba(100,140,255,0.8)"}`,
                borderRadius:16,
                padding:"6px 22px",
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                boxShadow:isTai
                  ?"0 0 30px rgba(255,60,60,0.7),0 0 60px rgba(255,0,0,0.3)"
                  :"0 0 30px rgba(60,100,255,0.7),0 0 60px rgba(0,50,255,0.3)",
                backdropFilter:"blur(4px)",
              }}>
                <div style={{
                  fontSize:26,fontWeight:900,letterSpacing:4,
                  color:isTai?"#ff6666":"#88aaff",
                  textShadow:isTai
                    ?"0 0 20px rgba(255,60,60,1),0 0 40px rgba(255,0,0,0.6)"
                    :"0 0 20px rgba(80,130,255,1),0 0 40px rgba(0,80,255,0.6)",
                  lineHeight:1,
                }}>{isTai?"TÀI":"XỈU"}</div>
                <div style={{
                  fontSize:11,color:"rgba(255,255,255,0.7)",letterSpacing:2,fontWeight:700,
                }}>TỔNG {sum} {isTai?"(11–17)":"(3–10)"}</div>
              </div>
            </div>
          )}

          {/* ── DICE FLYING OVERLAY — visible when cup lifts ── */}
          {cupLifting&&phase==="THROWING"&&(
            <div style={{
              position:"absolute",
              top:"50%",left:"50%",
              pointerEvents:"none",
              zIndex:20,
              overflow:"visible",
            }}>
              <div className="dice-spin-1" style={{position:"absolute"}}>
                <DiceFace val={pendingDice.current[0]} size={56}/>
              </div>
              <div className="dice-spin-2" style={{position:"absolute"}}>
                <DiceFace val={pendingDice.current[1]} size={56}/>
              </div>
              <div className="dice-spin-3" style={{position:"absolute"}}>
                <DiceFace val={pendingDice.current[2]} size={56}/>
              </div>
            </div>
          )}

          {/* AI-generated table image as background */}
          <img
            src={casinoTableImg}
            alt=""
            draggable={false}
            style={{
              position:"absolute",inset:0,width:"100%",height:"100%",
              objectFit:"fill",borderRadius:PANEL_H/2,
              pointerEvents:"none",userSelect:"none",
              filter:"drop-shadow(0 0 18px rgba(180,100,0,0.7)) drop-shadow(0 0 6px rgba(255,200,0,0.3))",
              zIndex:0,
            }}
          />

          <div style={{position:"absolute",inset:12,display:"flex",flexDirection:"column",alignItems:"center",zIndex:1}}>
            {/* ── Compact header row: session | online | balance | jackpot ── */}
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2,width:"100%",justifyContent:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:12,fontWeight:800,color:"#FFD700",letterSpacing:1,fontFamily:"monospace",textShadow:"0 0 8px rgba(255,215,0,0.8)"}}>PHIÊN #{sessionId}</span>
              <span style={{color:"rgba(255,215,0,0.2)"}}>·</span>
              <div style={{display:"flex",alignItems:"center",gap:2,fontSize:8,fontWeight:700,color:"rgba(80,255,140,0.8)"}}>
                <span style={{display:"inline-block",width:4,height:4,borderRadius:"50%",
                  background:"#00e064",boxShadow:"0 0 4px #00e064",flexShrink:0,
                  animation:"haru-pulse 1.2s ease-in-out infinite"}}/>
                {onlinePlayers.toLocaleString()}
              </div>
              <span style={{color:"rgba(255,215,0,0.2)"}}>·</span>
              <button onClick={()=>setShowJackpotLog(true)} style={{
                display:"flex",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:0,
              }}>
                <span style={{fontSize:8}}>🏆</span>
                <span style={{fontSize:8,fontWeight:900,color:"#FFD700",
                  fontFamily:"monospace",textShadow:"0 0 6px rgba(255,200,0,0.6)",
                  animation:"jackpotPulse 2s ease-in-out infinite",display:"inline-block",
                }}>{fmtVN(jackpot)}</span>
              </button>
            </div>

            {/* Phase message */}
            <div style={{fontSize:10,color:"rgba(255,215,0,0.7)",marginBottom:4,minHeight:22,textAlign:"center",lineHeight:1.3}}>
              {phase==="BETTING"&&showWelcome&&(
                <span style={{color:"rgba(255,215,0,0.8)",animation:"fadeIn .3s ease"}}>✨ Xin mời đặt cược!</span>
              )}
              {phase==="BETTING"&&!showWelcome&&countdown===0&&(
                <span style={{color:"#FFA500",fontWeight:900}}>💰 Trả tiền — Cân cửa</span>
              )}
              {phase==="THROWING"&&<span style={{color:"#FFA500",fontWeight:900}}>⚖️ Đang cân cửa...</span>}
              {phase==="RESULT"&&(
                <div style={{fontSize:9,color:"rgba(255,215,0,0.45)"}}>còn {resultCountdown}s để bắt đầu phiên mới</div>
              )}
            </div>

            {/* TÀI | CIRCLE | XỈU */}
            {(()=>{
              const taiWins = phase==="RESULT" && isTai;
              const xiuWins = phase==="RESULT" && !isTai;
              const canBetTai = xiuBet===0; // chỉ đặt 1 cửa
              const canBetXiu = taiBet===0;
              return (
              <div style={{display:"flex",alignItems:"center",gap:6,width:"100%",marginTop:2}}>

              {/* ── TÀI side ── */}
              <div style={{
                flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                background:taiWins?"rgba(196,30,58,0.22)":taiBet>0?"rgba(196,30,58,0.12)":"transparent",
                borderRadius:12,padding:"5px 3px",transition:"all .3s",
                boxShadow:taiWins?"0 0 22px rgba(255,60,60,0.55)":taiBet>0?"0 0 8px rgba(255,60,60,0.18)":"none",
              }}>
                <div style={{
                  fontSize:taiWins?14:10,fontWeight:900,letterSpacing:1.5,
                  color:taiWins?"#ff6666":"rgba(255,100,100,0.5)",
                  textShadow:taiWins?"0 0 16px rgba(255,60,60,0.9),0 0 32px rgba(255,0,0,0.5)":"none",
                  transition:"all .3s",
                }}>TÀI</div>
                {/* Pool total */}
                <div style={{fontSize:9,color:"rgba(255,165,0,0.75)",fontWeight:600}}>{fmtVN(taiTotal)}</div>
                {/* Bet button */}
                {phase==="BETTING"&&canBetTai&&(
                  <button onClick={()=>setSelectedSide("TAI")} style={{
                    padding:"4px 13px",borderRadius:18,cursor:"pointer",transition:"all .2s",
                    background:selectedSide==="TAI"
                      ?"linear-gradient(180deg,#ff7777,#C41E3A)"
                      :"linear-gradient(180deg,#4a000e,#2a0008)",
                    border:`1.5px solid ${selectedSide==="TAI"?"#ff9999":"#6a0018"}`,
                    color:"#fff",fontWeight:900,fontSize:9,letterSpacing:0.5,whiteSpace:"nowrap",
                    boxShadow:selectedSide==="TAI"?"0 0 14px rgba(255,50,50,0.75)":"none",
                  }}>
                    {selectedSide==="TAI"?(chip>0?fmtVN(chip):"ĐÃ CHỌN"):"CƯỢC"}
                  </button>
                )}
                {phase==="BETTING"&&!canBetTai&&(
                  <span style={{fontSize:8,color:"rgba(255,100,100,0.35)",fontStyle:"italic"}}>đã đặt XỈU</span>
                )}
                {taiBet>0&&(
                  <div style={{fontSize:11,color:"#FFD700",fontWeight:900,textShadow:"0 0 7px rgba(255,215,0,0.65)"}}>{fmtVN(taiBet)}₫</div>
                )}
              </div>

              {/* ── Center circle + player counts ── */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flexShrink:0}}>
                <div ref={circleRef}><CenterCircle size={108}>{circleContent}</CenterCircle></div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:8,color:"rgba(255,110,110,0.7)",fontWeight:700}}>{taiCount} TÀI</span>
                  <span style={{width:1,height:8,background:"rgba(255,215,0,0.2)",display:"inline-block"}}/>
                  <span style={{fontSize:8,color:"rgba(130,160,255,0.7)",fontWeight:700}}>{xiuCount} XỈU</span>
                </div>
              </div>

              {/* ── XỈU side ── */}
              <div style={{
                flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                background:xiuWins?"rgba(50,80,200,0.22)":xiuBet>0?"rgba(50,80,200,0.12)":"transparent",
                borderRadius:12,padding:"5px 3px",transition:"all .3s",
                boxShadow:xiuWins?"0 0 22px rgba(100,130,255,0.55)":xiuBet>0?"0 0 8px rgba(100,130,255,0.18)":"none",
              }}>
                <div style={{
                  fontSize:xiuWins?14:10,fontWeight:900,letterSpacing:1.5,
                  color:xiuWins?"#88aaff":"rgba(100,130,255,0.5)",
                  textShadow:xiuWins?"0 0 16px rgba(80,120,255,0.9),0 0 32px rgba(60,80,255,0.5)":"none",
                  transition:"all .3s",
                }}>XỈU</div>
                <div style={{fontSize:9,color:"rgba(255,165,0,0.75)",fontWeight:600}}>{fmtVN(xiuTotal)}</div>
                {phase==="BETTING"&&canBetXiu&&(
                  <button onClick={()=>setSelectedSide("XIU")} style={{
                    padding:"4px 13px",borderRadius:18,cursor:"pointer",transition:"all .2s",
                    background:selectedSide==="XIU"
                      ?"linear-gradient(180deg,#7799ff,#3344cc)"
                      :"linear-gradient(180deg,#040420,#020218)",
                    border:`1.5px solid ${selectedSide==="XIU"?"#99bbff":"#1a1a6a"}`,
                    color:"#fff",fontWeight:900,fontSize:9,letterSpacing:0.5,whiteSpace:"nowrap",
                    boxShadow:selectedSide==="XIU"?"0 0 14px rgba(80,100,255,0.75)":"none",
                  }}>
                    {selectedSide==="XIU"?(chip>0?fmtVN(chip):"ĐÃ CHỌN"):"CƯỢC"}
                  </button>
                )}
                {phase==="BETTING"&&!canBetXiu&&(
                  <span style={{fontSize:8,color:"rgba(100,130,255,0.35)",fontStyle:"italic"}}>đã đặt TÀI</span>
                )}
                {xiuBet>0&&(
                  <div style={{fontSize:11,color:"#FFD700",fontWeight:900,textShadow:"0 0 7px rgba(255,215,0,0.65)"}}>{fmtVN(xiuBet)}₫</div>
                )}
              </div>
              </div>
              );
            })()}

            {/* ── Bead history strip + streaks ── */}
            <div style={{width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:4,marginTop:5}}>
              {/* Beads strip with pill background */}
              <div style={{
                display:"flex",alignItems:"center",gap:3,
                background:"rgba(0,0,0,0.45)",
                border:"1px solid rgba(216,162,74,0.35)",
                borderRadius:20,padding:"3px 8px",
              }}>
                {Array.from({length:13}).map((_,idx)=>{
                  const i=12-idx;
                  const h=history[i];
                  const rec=sessionBetLog[i];
                  return h?(
                    <Bead key={idx} val={h} onClick={rec?()=>setSelectedBeadIdx(i):undefined}/>
                  ):(
                    <div key={idx} style={{
                      width:15,height:15,borderRadius:"50%",flexShrink:0,
                      border:"1px dashed rgba(255,215,0,0.2)",background:"rgba(0,0,0,0.35)",
                    }}/>
                  );
                })}
              </div>
              {/* Streaks row */}
              <div style={{display:"flex",gap:10}}>
                <span style={{
                  fontSize:9,fontWeight:700,
                  color:winStreak>0?"rgba(255,215,0,0.85)":"rgba(255,255,255,0.35)",
                  background:winStreak>0?"rgba(255,215,0,0.1)":"transparent",
                  borderRadius:8,padding:"0 5px",
                }}>🔥 DÃY THẮNG: {winStreak}</span>
                <span style={{
                  fontSize:9,fontWeight:700,
                  color:loseStreak>0?"rgba(255,80,80,0.85)":"rgba(255,255,255,0.35)",
                  background:loseStreak>0?"rgba(255,50,50,0.1)":"transparent",
                  borderRadius:8,padding:"0 5px",
                }}>💀 DÃY THUA: {loseStreak}</span>
              </div>
            </div>
          </div>

          {/* ── Arc buttons around the oval sides ──
               LEFT: Trophy centre big (-180°), Book upper (-155°), Clock lower (-205°)
               RIGHT: Chart upper (-20°), Hand lower (20°)
          */}
          {(()=>{
            const A=224, B=114;
            type BtnDef={angle:number;icon:React.ReactNode;id:string;active:boolean;onClick:()=>void;big?:boolean};
            const mkBtn=({angle,icon,id,active,onClick}:BtnDef)=>{
              const r=angle*Math.PI/180;
              const cx=208+A*Math.cos(r), cy=100+B*Math.sin(r);
              const rot=Math.atan2(B*Math.cos(r),-A*Math.sin(r))*180/Math.PI;
              const sz=36;
              return(
                <div key={id} style={{position:"absolute",left:cx-sz/2,top:cy-sz/2,transform:`rotate(${rot}deg)`}}>
                  <button title={id} onClick={onClick} style={{
                    width:sz,height:sz,borderRadius:"50%",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    padding:0,cursor:"pointer",touchAction:"manipulation",
                    background:active
                      ?"linear-gradient(145deg,#ffe066,#c8860a)"
                      :"linear-gradient(145deg,#0a0400,#000000)",
                    border:`2px solid ${active?"#FFD700":"rgba(255,215,0,0.5)"}`,
                    boxShadow:active
                      ?"0 0 18px rgba(255,215,0,0.8),inset 0 1px 0 rgba(255,255,255,0.35)"
                      :"0 4px 12px rgba(0,0,0,1),0 0 0 1.5px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.07)",
                    transition:"all 0.15s ease",
                    WebkitTapHighlightColor:"transparent",
                  }}>
                    <span style={{transform:`rotate(${-rot}deg)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {icon}
                    </span>
                  </button>
                </div>
              );
            };
            const isz=18, bsz=22;
            const defs:BtnDef[]=[
              {angle:-180,icon:<IcoTrophy s={bsz}/>,id:"leaderboard",active:popup==="leaderboard",onClick:()=>setPopup(popup==="leaderboard"?null:"leaderboard"),big:true},
              {angle:-155,icon:<IcoBook   s={isz}/>,id:"rules",      active:popup==="rules",      onClick:()=>setPopup(popup==="rules"?null:"rules")},
              {angle:-205,icon:<IcoClock  s={isz}/>,id:"history",    active:popup==="history",    onClick:()=>setPopup(popup==="history"?null:"history")},
              {angle: -20,icon:<IcoChart  s={isz}/>,id:"soicau",     active:popup==="soicau",     onClick:()=>setPopup(popup==="soicau"?null:"soicau")},
              {angle:  20,icon:<IcoHand   s={isz}/>,id:"hand",       active:handMode,             onClick:()=>setHandMode(p=>!p)},
            ];
            return <>{defs.map(d=>mkBtn(d))}</>;
          })()}
        </div>


        {/* Chip selector — only visible when a side is selected */}
        {phase==="BETTING"&&selectedSide&&(
          <div style={{width:PANEL_W,marginTop:8}}>

            {/* Current chip amount display */}
            <div style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",
              background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,215,0,0.25)",
              borderRadius:10,padding:"5px 10px",marginBottom:7,
            }}>
              <span style={{fontSize:9,color:"rgba(255,215,0,0.6)",fontWeight:700,letterSpacing:0.5}}>
                ĐẶT {selectedSide}:
              </span>
              <span style={{
                fontSize:chip>0?14:11,fontWeight:900,
                color:chip>0?"#FFD700":"rgba(255,255,255,0.25)",
                textShadow:chip>0?"0 0 8px rgba(255,215,0,0.6)":"none",
                transition:"all .15s",
              }}>
                {chip>0 ? `${fmtVN(chip)}₫` : "Chọn mệnh giá…"}
              </span>
              {chip>0&&(
                <button onClick={()=>setChip(0)} style={{
                  fontSize:9,fontWeight:900,padding:"2px 7px",borderRadius:8,cursor:"pointer",
                  background:"rgba(180,30,30,0.35)",border:"1px solid rgba(255,80,80,0.4)",
                  color:"rgba(255,150,150,0.9)",
                }}>Xoá</button>
              )}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}}>
              {CHIPS.map(c=><ChipBtn key={c.value} label={c.label} selected={false} onClick={()=>setChip(prev=>prev+c.value)}/>)}
            </div>

            {/* Action buttons row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
              {/* XÁC NHẬN CƯỢC */}
              <button
                disabled={!selectedSide||chip<=0}
                onClick={()=>{
                  if(!selectedSide||chip<=0) return;
                  betPlacedAtRef.current=countdown;
                  playChip();
                  if(selectedSide==="TAI") setTaiBet(t=>t+chip);
                  else setXiuBet(x=>x+chip);
                  // Gửi cược thật lên Go server để broadcast cho tất cả người chơi
                  if(wsRef.current?.readyState===WebSocket.OPEN) wsRef.current.send(JSON.stringify({type:"bet",side:selectedSide,amount:chip,name:"Bạn"}));
                  setChip(0);
                  setSelectedSide(null);
                }}
                className="active:scale-95 transition-all"
                style={{
                  padding:"10px 4px",borderRadius:14,fontWeight:900,fontSize:11,letterSpacing:0.5,
                  cursor:(selectedSide&&chip>0)?"pointer":"not-allowed",
                  opacity:(selectedSide&&chip>0)?1:0.38,
                  background:(selectedSide&&chip>0)
                    ?"linear-gradient(160deg,#ffe566 0%,#FFD700 30%,#c8860a 70%,#a86800 100%)"
                    :"linear-gradient(180deg,#2a1e00,#1a1200)",
                  border:`2px solid ${(selectedSide&&chip>0)?"#ffe566":"#4a3800"}`,
                  color:(selectedSide&&chip>0)?"#1a0800":"rgba(255,215,0,0.4)",
                  boxShadow:(selectedSide&&chip>0)
                    ?"0 0 22px rgba(255,215,0,0.6),0 4px 12px rgba(0,0,0,0.6),inset 0 1.5px 0 rgba(255,255,255,0.35)"
                    :"none",
                  textShadow:(selectedSide&&chip>0)?"0 1px 0 rgba(255,255,255,0.4)":"none",
                }}>✅ XÁC NHẬN</button>

              {/* TẤT TAY */}
              <button
                onClick={()=>{
                  if(!selectedSide||balance<=0) return;
                  betPlacedAtRef.current=countdown;
                  const amt=balance;
                  if(selectedSide==="TAI") setTaiBet(t=>t+amt);
                  else setXiuBet(x=>x+amt);
                  if(wsRef.current?.readyState===WebSocket.OPEN) wsRef.current.send(JSON.stringify({type:"bet",side:selectedSide,amount:amt,name:"Bạn"}));
                  setChip(0);
                  setSelectedSide(null);
                }}
                className="active:scale-95 transition-all"
                style={{
                  padding:"10px 4px",borderRadius:14,fontWeight:900,fontSize:11,letterSpacing:0.5,
                  cursor:"pointer",
                  background:"linear-gradient(160deg,#ff6060 0%,#c41e1e 40%,#7a0000 100%)",
                  border:"2px solid #ff6666",
                  color:"#fff",
                  boxShadow:"0 0 20px rgba(220,30,30,0.55),0 4px 12px rgba(0,0,0,0.6),inset 0 1.5px 0 rgba(255,255,255,0.2)",
                  textShadow:"0 1px 0 rgba(0,0,0,0.35)",
                }}>🔥 TẤT TAY</button>
            </div>

            {/* HỦY — reset chip về 0 */}
            <button onClick={()=>{setSelectedSide(null);setChip(0);}} className="active:scale-95 transition-all" style={{
              width:"100%",padding:"8px 0",borderRadius:14,fontWeight:900,fontSize:11,letterSpacing:1,cursor:"pointer",
              background:"linear-gradient(180deg,rgba(80,20,0,0.7),rgba(30,10,0,0.8))",
              border:"1.5px solid rgba(180,60,0,0.45)",
              color:"rgba(255,140,80,0.85)",
              boxShadow:"0 2px 10px rgba(0,0,0,0.7)",
            }}>✕ HỦY</button>
          </div>
        )}

      </div>

      {/* ── POPUPS ── */}
      {popup==="rules"&&(
        <PopupShell title="HƯỚNG DẪN CHƠI" onClose={()=>setPopup(null)}>
          <div style={{padding:"14px 16px",fontSize:11,lineHeight:1.7,display:"flex",flexDirection:"column",gap:14}}>

            {/* Bước 1 — Kết quả */}
            <div>
              <div style={{color:"#FFD700",fontWeight:900,fontSize:12,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:"rgba(255,215,0,0.15)",borderRadius:6,padding:"1px 7px"}}>1</span> Kết quả là gì?
              </div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,marginBottom:8}}>
                Hệ thống lắc <strong style={{color:"#FFD700"}}>3 viên xúc xắc</strong> → cộng tổng điểm → ra kết quả.
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1,borderRadius:10,background:"rgba(136,153,255,0.12)",border:"1px solid rgba(136,153,255,0.4)",padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:22,marginBottom:2}}>🔵</div>
                  <div style={{fontSize:17,fontWeight:900,color:"#88aaff",letterSpacing:1}}>XỈU</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:3}}>Tổng <strong style={{color:"#88aaff"}}>3 – 10</strong></div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:3}}>Ví dụ: 1+3+4 = 8</div>
                </div>
                <div style={{display:"flex",alignItems:"center",color:"rgba(255,255,255,0.3)",fontSize:16,fontWeight:900}}>VS</div>
                <div style={{flex:1,borderRadius:10,background:"rgba(255,136,136,0.12)",border:"1px solid rgba(255,136,136,0.4)",padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:22,marginBottom:2}}>🔴</div>
                  <div style={{fontSize:17,fontWeight:900,color:"#ff8888",letterSpacing:1}}>TÀI</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:3}}>Tổng <strong style={{color:"#ff8888"}}>11 – 18</strong></div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:3}}>Ví dụ: 4+5+6 = 15</div>
                </div>
              </div>
            </div>

            {/* Bước 2 — Cách chơi */}
            <div style={{borderTop:"1px solid rgba(139,94,0,0.25)",paddingTop:12}}>
              <div style={{color:"#FFD700",fontWeight:900,fontSize:12,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:"rgba(255,215,0,0.15)",borderRadius:6,padding:"1px 7px"}}>2</span> Cách đặt cược
              </div>
              {[
                {icon:"💰", text:"Chọn mệnh giá chip (1K / 10K / 100K …)"},
                {icon:"🎯", text:"Bấm vào ô TÀI hoặc XỈU để chọn cửa"},
                {icon:"✅", text:"Bấm nút CƯỢC để xác nhận"},
                {icon:"⏳", text:"Chờ đồng hồ đếm về 0 — xúc xắc sẽ lắc"},
                {icon:"🎉", text:"Đoán đúng → nhận thưởng x1.95 tiền cược"},
              ].map(({icon,text},i)=>(
                <div key={i} style={{display:"flex",gap:10,marginBottom:7,alignItems:"center"}}>
                  <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                  <span style={{color:"rgba(255,255,255,0.7)",fontSize:10}}>{text}</span>
                </div>
              ))}
            </div>

            {/* Ví dụ tiền thưởng */}
            <div style={{borderRadius:10,background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,215,0,0.2)",padding:"10px 12px"}}>
              <div style={{color:"#FFD700",fontSize:10,fontWeight:900,marginBottom:6,textAlign:"center"}}>💵 VÍ DỤ TIỀN THƯỞNG</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>Đặt cược</div>
                  <div style={{fontSize:13,fontWeight:900,color:"#fff"}}>100.000₫</div>
                </div>
                <div style={{fontSize:18,color:"rgba(255,215,0,0.4)"}}>→</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>Đoán đúng, nhận về</div>
                  <div style={{fontSize:13,fontWeight:900,color:"#44ee88"}}>195.000₫</div>
                </div>
                <div style={{fontSize:18,color:"rgba(255,215,0,0.4)"}}>|</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.4)"}}>Đoán sai, mất</div>
                  <div style={{fontSize:13,fontWeight:900,color:"#ff6666"}}>100.000₫</div>
                </div>
              </div>
            </div>

            {/* Hũ thưởng */}
            <div style={{borderTop:"1px solid rgba(139,94,0,0.25)",paddingTop:12}}>
              <div style={{color:"#FFD700",fontWeight:900,fontSize:12,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:"rgba(255,215,0,0.15)",borderRadius:6,padding:"1px 7px"}}>3</span> 🏆 Hũ Jackpot
              </div>
              <div style={{color:"rgba(255,255,255,0.55)",fontSize:10,marginBottom:8}}>
                Mỗi lượt <strong style={{color:"#FFD700"}}>thua</strong> trích <strong style={{color:"#FFD700"}}>0.1%</strong> tiền thua vào hũ.
                Hũ nổ khi <strong style={{color:"#FFD700"}}>đủ cả 2 điều kiện</strong>:
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {/* ĐK 1 */}
                <div style={{display:"flex",alignItems:"center",gap:10,borderRadius:8,background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.25)",padding:"8px 12px"}}>
                  <span style={{fontSize:20,flexShrink:0}}>🎲</span>
                  <div>
                    <div style={{fontSize:10,color:"#FFD700",fontWeight:900}}>Xúc xắc ra 1-1-1 hoặc 6-6-6</div>
                    <div style={{fontSize:8,color:"rgba(255,255,255,0.4)",marginTop:1}}>Chỉ 2 bộ ba đặc biệt này mới kích hoạt nổ hũ</div>
                    <div style={{fontSize:8,color:"rgba(255,200,100,0.6)",marginTop:1}}>222 · 333 · 444 · 555 không tính</div>
                  </div>
                </div>
                {/* ĐK 2 */}
                <div style={{display:"flex",alignItems:"center",gap:10,borderRadius:8,background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.25)",padding:"8px 12px"}}>
                  <span style={{fontSize:20,flexShrink:0}}>💵</span>
                  <div>
                    <div style={{fontSize:10,color:"#FFD700",fontWeight:900}}>Có người đặt cược trong phiên đó</div>
                    <div style={{fontSize:8,color:"rgba(255,255,255,0.4)",marginTop:1}}>Phiên không có cược → không nổ hũ dù ra bộ ba</div>
                  </div>
                </div>
                <div style={{borderRadius:8,background:"rgba(255,150,0,0.08)",border:"1px solid rgba(255,200,0,0.2)",padding:"8px 10px",marginTop:2}}>
                  <div style={{fontSize:9,color:"rgba(255,200,0,0.9)",fontWeight:900,marginBottom:3}}>💥 Phân chia khi nổ hũ</div>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.5)",lineHeight:1.8}}>
                    🏠 Nhà cái ăn <strong style={{color:"#ff8888"}}>50%</strong> hũ<br/>
                    👥 <strong style={{color:"#FFD700"}}>50% còn lại</strong> chia <strong style={{color:"#4dff88"}}>đều</strong> cho tất cả người chơi<br/>
                    Ví dụ: hũ 100M, 2 người → mỗi người nhận <strong style={{color:"#4dff88"}}>25M</strong><br/>
                    Hũ reset về <strong style={{color:"#FFD700"}}>0</strong> sau khi nổ
                  </div>
                </div>
              </div>
            </div>

            <div style={{background:"rgba(255,215,0,0.06)",borderRadius:8,padding:"8px 10px"}}>
              <p style={{color:"rgba(255,215,0,0.5)",fontSize:9,lineHeight:1.7,margin:0}}>⚠️ Kết quả mỗi phiên hoàn toàn ngẫu nhiên và độc lập. Hãy quản lý vốn hợp lý và chơi có trách nhiệm.</p>
            </div>

          </div>
        </PopupShell>
      )}
      {popup==="leaderboard"&&(
        <PopupShell title="BẢNG XẾP HẠNG" onClose={()=>setPopup(null)}>
          <div>
            {/* Header */}
            <div style={{display:"grid",gridTemplateColumns:"32px 1fr 76px 52px 46px",padding:"5px 10px",fontSize:9,fontWeight:900,color:"rgba(255,215,0,0.5)",borderBottom:"1px solid rgba(139,94,0,0.25)",gap:3}}>
              <span>#</span><span>TÊN</span><span style={{textAlign:"right"}}>TỔNG THẮNG</span><span style={{textAlign:"right"}}>VÁN</span><span style={{textAlign:"right"}}>TỶ LỆ</span>
            </div>
            {leaderboard.map((p,i)=>{
              const crowns=["👑","🥈","🥉"];
              const winRate=p.gamesPlayed>0?Math.round(p.wins/p.gamesPlayed*100):0;
              const isMe=p.name==="Bạn";
              return (
                <div key={p.name} style={{display:"grid",gridTemplateColumns:"32px 1fr 76px 52px 46px",padding:"7px 10px",gap:3,borderBottom:"1px solid rgba(255,255,255,0.04)",background:isMe?"rgba(255,215,0,0.1)":i<3?`rgba(255,215,0,${0.07-i*0.02})`:"transparent",alignItems:"center"}}>
                  <span style={{fontSize:12,color:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":isMe?"#FFD700":"rgba(255,255,255,0.4)",fontWeight:900}}>{crowns[i]||`#${i+1}`}</span>
                  <span style={{fontSize:10,color:isMe?"#FFD700":"rgba(255,255,255,0.75)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:isMe?900:400}}>{p.name}</span>
                  <span style={{fontSize:10,color:"#FFA500",textAlign:"right"}}>{fmtVN(p.totalWin)}</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",textAlign:"right"}}>{p.gamesPlayed}</span>
                  <span style={{fontSize:10,color:winRate>=50?"#44ff88":"#ff6666",textAlign:"right"}}>{winRate}%</span>
                </div>
              );
            })}
            {/* Tỷ lệ & Nổ hũ */}
            <div style={{padding:"10px 12px",borderTop:"1px solid rgba(139,94,0,0.25)",marginTop:4}}>
              <div style={{fontSize:9,color:"rgba(255,215,0,0.7)",fontWeight:900,marginBottom:4}}>📊 TỶ LỆ & NỔ HŨ</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",lineHeight:1.8}}>
                • Thắng 1 cửa (TÀI/XỈU): nhận <span style={{color:"#FFD700"}}>x1.95</span> số tiền cược<br/>
                • Tỷ lệ thắng lý thuyết: <span style={{color:"#FFD700"}}>48.6%</span> mỗi cửa<br/>
                • Hũ jackpot: mỗi lần <span style={{color:"#FFD700"}}>thua</span> trích <span style={{color:"#FFD700"}}>0.1%</span> tiền thua vào hũ<br/>
                  &nbsp;&nbsp;Nổ hũ khi 1-1-1/6-6-6 <span style={{color:"#FFD700"}}>VÀ</span> số người cược là <span style={{color:"#FFD700"}}>số chẵn</span><br/>
                  &nbsp;&nbsp;Nhà cái 50% · 50% chia <span style={{color:"#4dff88"}}>đều</span> cho người chơi · hũ về 0
              </div>
            </div>
          </div>
        </PopupShell>
      )}
      {popup==="soicau"&&(
        <SoiCauPopup txHistory={history} diceHistory={diceHistory} onClose={()=>setPopup(null)}/>
      )}
      {popup==="history"&&(
        <HistoryPopup history={betHistory} onClose={()=>setPopup(null)}/>
      )}
      {selectedBeadIdx!==null&&(
        <SessionDetailPopup
          log={sessionBetLog}
          idx={selectedBeadIdx}
          onClose={()=>setSelectedBeadIdx(null)}
          onNav={(i)=>setSelectedBeadIdx(i)}
        />
      )}
      {showJackpotLog&&(
        <JackpotHistoryPopup log={jackpotLog} onClose={()=>setShowJackpotLog(false)}/>
      )}

      {/* ── NỔ HŨ JACKPOT overlay ── */}
      {jackpotBurst!==null&&(
        <div style={{
          position:"fixed",inset:0,zIndex:200,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          background:"rgba(0,0,0,0.82)",
          animation:"fadeIn .4s ease",
        }} onClick={()=>setJackpotBurst(null)}>
          {/* Firework emoji rain */}
          <div style={{fontSize:32,letterSpacing:8,marginBottom:8,animation:"fadeIn .3s ease"}}>
            🎆🎇✨🎆🎇✨🎆
          </div>
          {/* Main card */}
          <div style={{
            background:"linear-gradient(160deg,#3a1800,#7a3800,#3a1800)",
            border:"3px solid #FFD700",
            borderRadius:20,
            padding:"24px 36px",
            textAlign:"center",
            boxShadow:"0 0 60px rgba(255,200,0,0.8),0 0 120px rgba(255,150,0,0.4)",
            maxWidth:320,
          }}>
            <div style={{fontSize:40,marginBottom:6}}>💥🏆💥</div>
            <div style={{
              fontSize:22,fontWeight:900,color:"#FFD700",letterSpacing:2,
              fontFamily:"'Arial Black',Impact,sans-serif",
              textShadow:"0 0 20px rgba(255,200,0,1)",
              marginBottom:4,
            }}>NỔ HŨ JACKPOT!</div>
            <div style={{fontSize:11,color:"rgba(255,215,0,0.7)",marginBottom:12,letterSpacing:1}}>
              Chúc mừng! Bạn trúng jackpot!
            </div>
            <div style={{
              background:"linear-gradient(90deg,#4a2400,#c8860a,#FFD700,#c8860a,#4a2400)",
              borderRadius:12,padding:"8px 16px",marginBottom:12,
              boxShadow:"0 0 20px rgba(255,200,0,0.7)",
            }}>
              <div style={{fontSize:10,color:"rgba(255,248,190,0.8)",letterSpacing:1,marginBottom:2}}>TIỀN THƯỞNG</div>
              <div style={{
                fontSize:24,fontWeight:900,color:"#fff",
                fontFamily:"monospace",letterSpacing:1,
                textShadow:"0 0 12px rgba(255,220,0,1)",
              }}>+{fmtVN(jackpotBurst)} ₫</div>
            </div>
            <div style={{fontSize:9,color:"rgba(255,215,0,0.5)",letterSpacing:0.5}}>
              Hũ đã reset về 0 — tích lũy phiên mới 🎰
            </div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:8}}>Nhấn bất kỳ đâu để đóng</div>
          </div>
          <div style={{fontSize:32,letterSpacing:8,marginTop:8}}>
            🪙💰🪙💰🪙💰🪙
          </div>
        </div>
      )}

      {/* Late bet toast */}
      {lateBetToast&&(
        <div style={{
          position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          zIndex:90,padding:"14px 22px",borderRadius:14,textAlign:"center",
          background:"linear-gradient(135deg,#1a0a00,#2a1400)",
          border:"2px solid #FFD700",
          boxShadow:"0 0 30px rgba(255,215,0,0.4)",
          animation:"fadeIn .3s ease",
        }}>
          <div style={{fontSize:20,marginBottom:4}}>⚠️</div>
          <div style={{color:"#FFD700",fontWeight:900,fontSize:13,letterSpacing:1}}>HOÀN TIỀN</div>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:10,marginTop:4,lineHeight:1.5}}>
            Đặt cược trong 8 giây cuối.<br/>
            Bên thắng bị hoàn — tiền cược trả về.
          </div>
        </div>
      )}
    </div>
  );
}
