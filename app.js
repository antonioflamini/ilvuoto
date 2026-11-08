const BUY = "https://www.amazon.it/dp/B0H2P38RJP";
const PAGE_URL = (!window.claude && /^https?:/.test(location.href)) ? location.href.split("#")[0] : "https://claude.ai/artifact/3xPTfV8vD7cziGRckFy2sa";   // su un sito proprio (Netlify) si condivide il suo indirizzo
const IS_HOME_APP = (()=>{ try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch(e){ return false; } })();

/* ============================================================
   MOTORE
   ============================================================ */
const $ = s => document.querySelector(s);
const log = $("#log"), msg = $("#msg"), counterEl = $("#counter"), stateEl = $("#state");
const STEP = 100 / 149;                       // il passo esatto del Volume I: 150 pagine, 0% → 100%
let vol = "I", silenzio = 0, turns = [], used = new Set(), turnCount = 0, busy = false, convGen = 0;
let sample = null, liveOK = false, ctl = null;
const store = { get(k,d){ try{ const v=localStorage.getItem("ilvuoto-"+k); return v===null?d:JSON.parse(v);}catch(e){return d;} },
                set(k,v){ try{ localStorage.setItem("ilvuoto-"+k, JSON.stringify(v)); }catch(e){} } };

function pct(n){ return Math.max(0,Math.min(100,n)).toFixed(2).replace(".", ","); }
function fmt(n){ return "Silenzio: " + pct(n) + "%"; }
function setSilence(n){ silenzio = Math.max(0, Math.min(100, n)); counterEl.textContent = fmt(silenzio); const pc=document.getElementById("pcounter"); if (pc) pc.textContent = pct(silenzio) + "%"; }
function stepSilence(mult=1){ setSilence(silenzio + VOLUMI[vol].verso * STEP * mult); }
function toast(t){ const el=$("#toast"); el.textContent=t; el.classList.add("on"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove("on"),1900); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function el(tag, attrs={}, ...kids){ const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs)){ if(k==="class") e.className=v; else if(k.startsWith("on")) e[k]=v; else e.setAttribute(k,v);} for(const c of kids) e.append(c); return e; }

async function copyText(text, host){
  try { await navigator.clipboard.writeText(text); toast("Copiato"); }
  catch(e){ const old = host.querySelector(".copybox"); if (old) old.remove(); const ta = el("textarea",{class:"copybox",rows:"4",readonly:"","aria-label":"Testo da copiare"}); ta.value=text; host.appendChild(ta); ta.focus(); ta.select(); toast("Seleziona e copia"); }
}
const CAN_SHARE = !!navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||"");
/* sul telefono apre il pannello Condividi (WhatsApp, Telegram, Instagram...); altrove copia */
async function shareLink(text, host){
  track("condividi");
  if (CAN_SHARE){ try { await navigator.share({text}); return; } catch(e){ if (e && e.name === "AbortError") return; } }
  copyText(text, host);
}
const SHARE_LBL = CAN_SHARE ? "Manda" : "Copia";
function shareText(t){ return "«" + t.replace(/\s*\n+\s*/g," ").trim() + "»\n— La Stanza, dai libri IL VUOTO di Antonio Flamini · " + fmt(silenzio) + "\n#ilvuoto · " + PAGE_URL; }

/* --- card per Instagram: post 1080×1350, storia 1080×1920 --- */
function splitLong(g, w, maxW){ if (g.measureText(w).width<=maxW) return [w]; const parts=[]; let cur=""; for(const ch of w){ if(g.measureText(cur+ch+"-").width>maxW){ parts.push(cur+"-"); cur=ch; } else cur+=ch; } if(cur) parts.push(cur); return parts; }
function wrapLines(g, text, maxW){ const out=[]; for (const para of String(text).split(/\n+/)){ let cur=""; for(const w of para.split(/\s+/).flatMap(x=>splitLong(g,x,maxW))){ const t=cur?cur+" "+w:w; if(g.measureText(t).width>maxW && cur){out.push(cur);cur=w;} else cur=t; } if(cur) out.push(cur); out.push(""); } out.pop(); return out; }
async function renderCard({format="post", eyebrow="", title="", main="", answer="", sub="", meter="", firma=""}){
  try { await Promise.all([document.fonts.load('300 60px "Jost"'), document.fonts.load('400 60px "Jost"'), document.fonts.load('400 24px "IBM Plex Mono"')]); } catch(e){}
  const W=1080, H = format==="story" ? 1920 : 1350, M=96, c=document.createElement("canvas"); c.width=W; c.height=H; const g=c.getContext("2d");
  g.fillStyle="#f6f6f4"; g.fillRect(0,0,W,H);
  const top = format==="story" ? 290 : 130;
  g.fillStyle="#151515"; g.font='400 26px "Jost", sans-serif'; try{ g.letterSpacing="10px"; }catch(e){} g.fillText("IL VUOTO",M,top); try{ g.letterSpacing="0px"; }catch(e){}
  g.fillStyle="#85857f"; g.font='300 24px "Jost", sans-serif'; g.fillText("Analisi dello spazio tra i pensieri",M,top+40);
  // blocco centrale
  const blocks=[];
  if (eyebrow) blocks.push({font:'400 24px "IBM Plex Mono", monospace', color:"#85857f", text:eyebrow, lh:1.4, gap:28});
  if (title){ const s = title.length>22?72:92; blocks.push({font:`400 ${s}px "Jost", sans-serif`, color:"#151515", text:title, lh:1.08, gap:40}); }
  if (main && main.length>260) main = main.slice(0,257).replace(/\s+\S*$/,"") + "…";
  if (main){ const s = main.length>160?44:main.length>90?52:(title?48:64); blocks.push({font:`300 ${s}px "Jost", sans-serif`, color:"#151515", text:main, lh:1.35, gap:34}); }
  if (answer){ const a = answer.length>220 ? answer.slice(0,217).replace(/\s+\S*$/,"")+"…" : answer;
    blocks.push({font:'400 22px "IBM Plex Mono", monospace', color:"#85857f", text:"La mia risposta", lh:1.4, gap:14});
    blocks.push({font:`300 ${a.length>120?38:44}px "Jost", sans-serif`, color:"#151515", text:"«" + a + "»", lh:1.38, gap:34}); }
  if (sub){ blocks.push({font:'300 34px "Jost", sans-serif', color:"#85857f", text:sub, lh:1.4, gap:0}); }
  let total=0; for(const b of blocks){ g.font=b.font; b.size=parseInt(b.font.match(/(\d+)px/)[1]); b.lines=wrapLines(g,b.text,W-2*M); b.h=b.lines.length*b.size*b.lh; total+=b.h+b.gap; }
  let y=Math.max(top+80,(H-total)/2); for(const b of blocks){ g.font=b.font; g.fillStyle=b.color; for(const l of b.lines){ y+=b.size*b.lh; g.fillText(l,M,y-b.size*(b.lh-1)); } y+=b.gap; }
  const bottom = format==="story" ? H-400 : H-150;
  g.fillStyle="#85857f"; g.font='400 24px "IBM Plex Mono", monospace'; g.fillText(meter || fmt(silenzio),M,bottom);
  g.font='300 26px "Jost", sans-serif'; g.fillText(firma || "Antonio Flamini · #ilvuoto",M,bottom+50);
  if (format==="story"){ g.fillStyle="#151515"; g.font='400 26px "Jost", sans-serif'; g.fillText("La Stanza · cerca #ilvuoto",M,bottom+100); }
  return new Promise(r=>c.toBlob(r,"image/png"));
}
async function saveCard(spec, name){
  const blob = await renderCard(spec).catch(()=>null);
  if (!blob){ toast("Immagine non disponibile su questo dispositivo"); return; }
  const file = name + (spec.format==="story"?"-storia":"-post") + ".png";
  if (!window.claude){   // fuori da Claude (sito proprio): sul telefono si apre il pannello Condividi, altrimenti download diretto
    try { const f = new File([blob], file, {type:"image/png"});
      if (navigator.canShare && navigator.canShare({files:[f]}) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){ await navigator.share({files:[f]}); return; } }
    catch(e){ if (e && e.name === "AbortError") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000); toast("Immagine salvata"); }
    catch(e){ showCard(blob, spec); }
    return;
  }
  let dl = null; try { dl = await window.claude.use("downloads"); } catch(e){}
  if (!dl){ showCard(blob, spec); return; }
  try { await dl.save({filename:file, data:blob}); }
  catch(e){ if (!e || e.code !== "declined") showCard(blob, spec); }
}
/* quando il download non è permesso (per esempio a chi apre il link pubblico): l'immagine si mostra e si salva tenendola premuta */
function showCard(blob, spec){
  const r = new FileReader();
  r.onload = ()=>{
    const src = r.result, box = $("#sheet-in"); box.replaceChildren();
    const full = ()=>{   // l'immagine a tutto schermo, senza nient'altro intorno: si salva con uno screenshot
      const ov = el("div",{class:"shot",role:"dialog","aria-label":"Immagine a schermo intero"}, el("img",{src, alt:"La tua immagine"}), el("p",{class:"shot-hint"},"Fai uno screenshot. Poi tocca per chiudere."));
      const opener = document.activeElement;
      const closeOv = ()=>{ ov.remove(); removeEventListener("keydown", onKey, true); if (opener && opener.isConnected) opener.focus(); };
      const onKey = e=>{ if (e.key==="Escape"){ e.stopPropagation(); e.preventDefault(); closeOv(); } };
      ov.tabIndex = 0; ov.onclick = closeOv; addEventListener("keydown", onKey, true); document.body.appendChild(ov); ov.focus();
      setTimeout(()=>{ const h = ov.querySelector(".shot-hint"); if (h) h.style.opacity = "0"; }, 2200);
    };
    box.append(
      el("div",{class:"row"}, el("span",{class:"eyebrow"}, spec.format==="story" ? "La tua storia · 1080×1920" : "Il tuo post · 1080×1350"), el("button",{type:"button",class:"btn ghost",onclick:closeSheet},"Chiudi")),
      el("p",{class:"big",id:"sheet-title"}, "Ecco la tua immagine."),
      el("div",{class:"acts"}, el("button",{type:"button",class:"btn primary",onclick:full},"Schermo intero, per lo screenshot")),
      el("p",{class:"sub"}, "Dal telefono il modo più sicuro è lo screenshot: tocca Schermo intero, la scritta sparisce da sola, poi fai lo screenshot. In alcuni browser funziona anche tenere premuta l'immagine qui sotto e scegliere Salva immagine. Dal computer: tasto destro sull'immagine e Salva immagine con nome."),
      el("img",{src, alt:"La tua immagine da condividere", class:"card-prev"}));
    const d = $("#sheet"); d.hidden = false; d.scrollTop = 0; d.querySelector(".btn.ghost").focus();
  };
  r.readAsDataURL(blob);
}

/* ====================== LA STANZA ====================== */
/* --- la presenza: un cerchio d'inchiostro che respira --- */
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOODS = {idle:"respira", listen:"ascolta", think:"tace prima di rispondere", speak:"parla", hush:"silenzio"};
class Presence{
  /* Una membrana d'inchiostro al centro e una rete di neuroni intorno.
     Respira da sola, si accende quando scrivi, i segnali corrono lungo le connessioni quando pensa e quando parla. */
  constructor(cv){
    this.cv=cv; this.g=cv.getContext("2d"); this.state="idle"; this.energy=0; this.squeeze=0;
    this.scale=1; this.target=1; this.ph=[0,1,2,3,4,5].map(()=>Math.random()*6.283); this.t0=performance.now();
    this.col=null; this.colAt=0; this.nodes=[]; this.edges=[]; this.sig=[]; this.last=performance.now();
    this.look={x:0,y:0}; this.lookT={x:0,y:0}; this.nextBlink=performance.now()+4000; this.blink=0;
    this.resize(); addEventListener("resize",()=>this.resize());
    if ("ResizeObserver" in window) new ResizeObserver(()=>this.resize()).observe(cv);
    addEventListener("pointermove",e=>{ const r=this.cv.getBoundingClientRect(); if(!r.width) return;
      this.lookT.x=Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/(r.width/2))); this.lookT.y=Math.max(-1,Math.min(1,(e.clientY-(r.top+r.height/2))/(r.height)));},{passive:true});
    this.loop=this.loop.bind(this); this.running=false; this.lastDraw=0; this.onScreen=true; this.wake();
    document.addEventListener("visibilitychange",()=>this.wake());
    if ("IntersectionObserver" in window) new IntersectionObserver(es=>{ this.onScreen=es[0].isIntersecting; this.wake(); }).observe(cv);
  }
  wake(){ if (!this.running){ this.running=true; this.last=performance.now(); requestAnimationFrame(this.loop); } }
  visible(){ const i=$("#info"), s=$("#sheet"); return !document.hidden && !!this.cv.offsetParent && this.onScreen!==false && (!i||i.hidden) && (!s||s.hidden); }
  resize(){
    const r=this.cv.getBoundingClientRect(), d=Math.min(2, devicePixelRatio||1); this.d=d;
    const W=Math.max(1,Math.round(r.width*d)), H=Math.max(1,Math.round(r.height*d));
    if (W===this.cv.width && H===this.cv.height && this.nodes.length) return;
    if (this.nodes.length && this.cv.width>1){ const sx=W/this.cv.width, sy=H/this.cv.height; for(const n of this.nodes){ n.bx*=sx; n.by*=sy; } this.cv.width=W; this.cv.height=H; return; }
    this.cv.width=W; this.cv.height=H; this.build();
  }
  build(){
    const W=this.cv.width, H=this.cv.height, cx=W/2, cy=H/2+H*.04, R=Math.min(W,H)*(W<520*this.d?.27:.30);
    const n = Math.round(Math.min(78, Math.max(36, W/(14*this.d))));
    this.nodes=[];
    let tries=0;
    while(this.nodes.length<n && tries<5000){ tries++;
      // sparsi su tutta la superficie, più fitti vicino alla membrana
      const x=8*this.d+Math.random()*(W-16*this.d), y=8*this.d+Math.random()*(H-16*this.d);
      const dist=Math.hypot(x-cx,y-cy); if (dist<R*1.18) continue;
      if (Math.random() > Math.max(.25, 1-(dist-R)/(Math.max(W,H)*.6))) continue;
      if (this.nodes.some(o=>Math.hypot(o.bx-x,o.by-y)<14*this.d)) continue;
      this.nodes.push({bx:x, by:y, x, y, p:Math.random()*6.283, s:.4+Math.random()*.8, e:0, ring:false});
    }
    // dodici punti sulla membrana: da lì partono i segnali quando parla
    for(let i=0;i<12;i++){ const a=i/12*6.283; this.nodes.push({bx:cx+Math.cos(a)*R, by:cy+Math.sin(a)*R, x:0,y:0, p:a, s:0, e:0, ring:true, a}); }
    // connessioni: ognuno ai 3 vicini più prossimi
    const E=new Set(); this.edges=[]; this.adj=this.nodes.map(()=>[]);
    this.nodes.forEach((a,i)=>{ const near=this.nodes.map((b,j)=>[j,(a.bx-b.bx)**2+(a.by-b.by)**2]).filter(([j])=>j!==i).sort((p,q)=>p[1]-q[1]).slice(0,a.ring?2:3);
      for(const [j] of near){ const key=i<j?i+"-"+j:j+"-"+i; if(E.has(key)) continue; E.add(key); const k=this.edges.length; this.edges.push([i,j]); this.adj[i].push([j,k]); this.adj[j].push([i,k]); } });
    this.ringIdx=this.nodes.map((n,i)=>n.ring?i:-1).filter(i=>i>=0);
    this.sig=[];
  }
  colors(now){ if(!this.col || now-this.colAt>1500){ const cs=getComputedStyle(document.documentElement); this.col={paper:cs.getPropertyValue("--paper").trim()||"#f6f6f4", ink:cs.getPropertyValue("--ink").trim()||"#151515", mute:cs.getPropertyValue("--mute").trim()||"#85857f", faint:cs.getPropertyValue("--faint").trim()||"#d9d9d4"}; this.colAt=now; } return this.col; }
  set(s){ this.state=s; this.wake(); const m=$("#mood"); if(m) m.textContent=MOODS[s]||""; const w=this.cv.closest(".presence"); if(w) w.dataset.state=s; }
  fire(from, k=1){ // un segnale parte da un neurone lungo una sua connessione
    if (!this.nodes.length || this.sig.length>160) return;
    const i = from ?? Math.floor(Math.random()*this.nodes.length), links=this.adj[i]; if(!links||!links.length) return;
    for(let c=0;c<k;c++){ const [j,e]=links[Math.floor(Math.random()*links.length)]; this.sig.push({a:i,b:j,t:0,v:.9+Math.random()*1.4}); }
    this.nodes[i].e=1;
  }
  kick(k=0.35){ this.wake(); this.energy=Math.min(1,this.energy+k); if (this.state==="speak" && this.ringIdx) this.fire(this.ringIdx[Math.floor(Math.random()*this.ringIdx.length)], 2); }
  listen(){ this.squeeze=Math.min(.12,this.squeeze+.05); this.kick(.25); this.fire(null,1); if(this.state==="idle"||this.state==="listen"){ this.set("listen"); clearTimeout(this._l); this._l=setTimeout(()=>{ if(this.state==="listen") this.set("idle"); },900); } }
  hush(){ this.set("hush"); this.target=.06; this.sig=[]; clearTimeout(this._h); this._h=setTimeout(()=>{ this.target=1; if (this.state==="hush") this.set("idle"); },1700); }
  birth(){ this.scale=0; this.target=1; this.sig=[]; }
  loop(now){
    if (!this.visible()){ this.running=false; return; }          // fermo quando non si vede: niente batteria sprecata; si riaccende con wake()
    requestAnimationFrame(this.loop);
    const lively = this.state==="speak"||this.state==="think"||this.state==="listen"||this.energy>.05||this.sig.length>0||Math.abs(this.target-this.scale)>.01;
    if (now-this.lastDraw < (REDUCED ? 400 : lively ? 0 : 33)) return;   // a riposo 30 fotogrammi al secondo
    this.lastDraw = now;
    if (this.cv.width<2) this.resize();
    const dt=Math.min(.05,(now-this.last)/1000); this.last=now;
    const g=this.g, W=this.cv.width, H=this.cv.height, d=this.d, c=this.colors(now);
    const t = REDUCED ? 0 : (now-this.t0)/1000;
    this.scale += (this.target-this.scale)*(REDUCED?1:(this.target>this.scale?.028:.07));
    const k60 = Math.min(4, dt*60);                               // decadimenti indipendenti dal numero di fotogrammi
    this.energy *= Math.pow(.94,k60); this.squeeze *= Math.pow(.92,k60); this.blink *= Math.pow(.85,k60);
    this.look.x += (this.lookT.x-this.look.x)*.04; this.look.y += (this.lookT.y-this.look.y)*.04;
    const st=this.state, think=st==="think", speak=st==="speak", listen=st==="listen";
    // vita spontanea: ogni tanto un battito di ciglia e qualche scintilla
    if (!REDUCED){
      if (now>this.nextBlink && st==="idle"){ this.blink=1; this.nextBlink=now+3500+Math.random()*6000; this.fire(null,2); }
      const rate = speak ? 9 : think ? 14 : listen ? 3 : st==="hush" ? 0 : .9;
      if (Math.random() < rate*dt) this.fire(think ? this.ringIdx[Math.floor(Math.random()*12)] : null, 1);
    }
    const cx=W/2 + this.look.x*W*.02, cy=H/2+H*.04 + this.look.y*H*.03, R=Math.min(W,H)*(W<520*d?.27:.30)*this.scale;
    g.clearRect(0,0,W,H);
    // posizione dei neuroni: lieve deriva, attratti dalla membrana quando ascolta
    const pull = listen ? .06 : think ? .03 : 0;
    for(const n of this.nodes){
      if (n.ring){ const rr=R*(1+.028*Math.sin(t*1.7)-this.squeeze); n.x=cx+Math.cos(n.a+(think?t*.25:0))*rr; n.y=cy+Math.sin(n.a+(think?t*.25:0))*rr; }
      else { const dx=Math.sin(t*.35*n.s+n.p)*6*d, dy=Math.cos(t*.3*n.s+n.p*1.3)*5*d;
        const bx=cx+(n.bx-W/2)*(.15+.85*this.scale), by=cy+(n.by-H/2)*(.15+.85*this.scale);
        n.x = bx+dx + (cx-bx)*pull; n.y = by+dy + (cy-by)*pull; }
      n.e *= Math.pow(.955,k60);
    }
    // connessioni
    g.lineWidth=1*d; g.strokeStyle=c.ink;
    const baseA = st==="hush" ? .03 : speak ? .16 : think ? .14 : .09;
    for(const [i,j] of this.edges){ const a=this.nodes[i], b=this.nodes[j]; const act=Math.max(a.e,b.e);
      g.globalAlpha = Math.min(.7, baseA + act*.45) * Math.min(1,this.scale*1.4);
      g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke(); }
    // segnali che corrono; arrivati, a volte accendono il neurone successivo (reazione a catena)
    const prop = speak ? .62 : think ? .55 : .28;
    g.fillStyle=c.ink;
    for(let k=this.sig.length-1;k>=0;k--){ const s=this.sig[k]; s.t += dt*s.v*(think?.8:1.4);
      const a=this.nodes[s.a], b=this.nodes[s.b];
      if (s.t>=1){ this.sig.splice(k,1); b.e=1; if (Math.random()<prop){ const links=this.adj[s.b]; const nx=links[Math.floor(Math.random()*links.length)]; if(nx && nx[0]!==s.a && this.sig.length<160) this.sig.push({a:s.b,b:nx[0],t:0,v:.9+Math.random()*1.4}); } continue; }
      const x=a.x+(b.x-a.x)*s.t, y=a.y+(b.y-a.y)*s.t; g.globalAlpha=.85; g.beginPath(); g.arc(x,y,1.8*d,0,6.283); g.fill();
      g.globalAlpha=.18; g.beginPath(); g.arc(x,y,4.5*d,0,6.283); g.fill(); }
    // neuroni
    for(const n of this.nodes){ if(n.ring) continue; g.globalAlpha = Math.min(1,(.28+n.e*.72)*Math.min(1,this.scale*1.4));
      g.beginPath(); g.arc(n.x,n.y,(1.3+n.e*2.2)*d,0,6.283); g.fill();
      if (n.e>.3){ g.globalAlpha=n.e*.15; g.beginPath(); g.arc(n.x,n.y,(5+n.e*6)*d,0,6.283); g.fill(); } }
    g.globalAlpha=1;
    // fondo della membrana, perché la rete non la attraversi
    g.fillStyle=c.paper;
    g.beginPath(); g.arc(cx,cy,R*.98,0,6.283); g.fill(); g.fillStyle=c.ink;
    // arco del silenzio
    g.strokeStyle=c.faint; g.lineWidth=1*d; g.beginPath(); g.arc(cx,cy,R*.66,0,6.283); g.stroke();
    if (silenzio>0){ g.strokeStyle=c.mute; g.beginPath(); g.arc(cx,cy,R*.66,-Math.PI/2,-Math.PI/2+6.283*silenzio/100); g.stroke(); }
    // la membrana
    const breath = (think ? .035*Math.sin(t*.9) : .028*Math.sin(t*1.7)) - this.blink*.06;
    const wob = .010 + this.energy*(speak?.06:.035);
    g.strokeStyle=c.ink; g.lineWidth=(think?1.3:speak?2.1:1.7)*d; g.lineCap="round";
    g.setLineDash(think ? [R*.42,R*.2] : []); g.lineDashOffset = think ? -t*R*.9 : 0;
    g.beginPath(); const N=180;
    for(let i=0;i<=N;i++){ const th=i/N*6.283; let nn=0; for(let k=2;k<=5;k++) nn+=Math.sin(th*k+this.ph[k]+t*(.4+k*.23))/k;
      const ripple = speak ? (Math.sin(th*7 - t*11)*.6 + Math.sin(th*13 + t*7)*.4)*this.energy*.06 : 0;
      const r = R*(1 + breath - this.squeeze + nn*wob + ripple); const x=cx+Math.cos(th)*r, y=cy+Math.sin(th)*r; i?g.lineTo(x,y):g.moveTo(x,y); }
    g.stroke(); g.setLineDash([]);
    // quando parla: onde che escono dalla membrana
    if (speak && !REDUCED){ for(let k=0;k<3;k++){ const ph=((t*.9+k/3)%1); g.globalAlpha=(1-ph)*.28*(.4+this.energy); g.lineWidth=1*d; g.beginPath(); g.arc(cx,cy,R*(1.05+ph*.55),0,6.283); g.stroke(); } g.globalAlpha=1; }
    // il nucleo
    const core = st==="hush" || this.scale<.2 ? Math.max(1.5*d,R*.08) : (speak ? (2+this.energy*5)*d : think ? (1.5+Math.abs(Math.sin(t*3))*2)*d : 1.6*d);
    g.fillStyle=c.ink; g.beginPath(); g.arc(cx,cy,core,0,6.283); g.fill();
  }
}
let presence = null;
let typeGen = 0, rush = false;   // un tocco sul testo completa la frase
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
/* --- la voce parlata: sintesi vocale del dispositivo, in italiano, nessun costo --- */
const VOICE = {
  ok: "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
  on: store.get("voce", true), unlocked: false, v: null, speaking: false,
  pick(){
    if (!this.ok) return;
    const all = speechSynthesis.getVoices().filter(v=>/^it([-_]|$)/i.test(v.lang));
    // voce maschile: nomi maschili noti (Apple, Microsoft, Android); in mancanza, una voce italiana con tono più basso
    const MALE = /(luca|diego|giuseppe|cosimo|benigno|calimero|gianni|rinaldo|lorenzo|giorgio|marco|roberto|paolo\b|male|uomo|it-it-x-it[cd]|itc|itd)/i;
    const FEMALE = /(alice|federica|paola|elsa|isabella|emma|chiara|carla|silvia|serena|female|donna|google italiano|it-it-x-it[ab])/i;
    const quality = v => (/(neural|natural|enhanced|premium|siri)/i.test(v.name)?3:0) + (v.localService?0:1);
    const males = all.filter(v=>MALE.test(v.name + " " + v.voiceURI) && !FEMALE.test(v.name));
    this.male = males.length > 0;
    this.v = (males.length ? males : all).sort((a,b)=>quality(b)-quality(a))[0] || null;
  },
  unlock(){   // va chiamata dentro un tocco: alcuni telefoni lo richiedono
    if (!this.ok || this.unlocked) return;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); this.unlocked = true; } catch(e){}
  },
  stop(){ if (this.ok) try { speechSynthesis.cancel(); } catch(e){} this.speaking=false; },
  say(text, onBoundary, onEnd){
    if (!this.ok || !this.on || !this.unlocked){ onEnd && onEnd(false); return false; }
    if (!this.v){ this.pick(); if (!this.v){ onEnd && onEnd(false); return false; } }   // senza una voce italiana meglio tacere che leggere con accento inglese
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[«»"]/g,"").replace(/·/g," "));
      u.lang = "it-IT"; if (this.v) u.voice = this.v; u.rate = .9; u.pitch = this.male ? .85 : .6;
      u.onboundary = e => onBoundary && onBoundary(e.charIndex);
      u.onend = u.onerror = () => { this.speaking=false; onEnd && onEnd(true); };
      this.speaking = true; speechSynthesis.speak(u); return true;
    } catch(e){ onEnd && onEnd(false); return false; }
  }
};
if (VOICE.ok){ VOICE.pick(); try { speechSynthesis.onvoiceschanged = () => { VOICE.pick(); renderVoiceBtn(); }; } catch(e){} }
setTimeout(()=>{ if (VOICE.ok && !VOICE.v){ VOICE.pick(); if (!VOICE.v && speechSynthesis.getVoices().length){ VOICE.ok = false; renderVoiceBtn(); } } }, 2500);
addEventListener("pointerdown", ()=>VOICE.unlock(), {capture:true});
addEventListener("keydown", ()=>VOICE.unlock(), {capture:true});
function renderVoiceBtn(){
  const b = $("#voce"); if (!b) return;
  if (!VOICE.ok){ b.textContent = "Voce non disponibile qui"; b.disabled = true; return; }
  b.textContent = VOICE.on ? "Voce: accesa" : "Voce: spenta"; b.setAttribute("aria-pressed", String(VOICE.on));
}
function typeInto(p, text){
  const gen = typeGen;
  return new Promise(res=>{
    if (REDUCED || !text){ p.textContent=text; presence && presence.kick(.6); VOICE.say(text); res(); return; }
    presence && presence.set("speak");
    const host = p.parentElement; host && host.classList.add("speaking");
    let i=0, spoken=false, speechDone=false, typingDone=false;
    const finish=()=>{ if (typingDone && (speechDone || !spoken)){ host && host.classList.remove("speaking"); if (presence && presence.state==="speak") presence.set("idle"); res(); } };
    spoken = VOICE.say(text, ci=>{ if (ci > i) i = Math.min(text.length-1, ci); presence && presence.kick(.35); }, ()=>{ speechDone=true; finish(); });
    // con la voce il testo segue il ritmo del parlato; senza, è più rapido
    const pace = spoken ? {ch:58, comma:260, stop:520} : {ch:20, comma:120, stop:260};
    const tick=()=>{
      if (gen!==typeGen || rush){ p.textContent=text; if (gen!==typeGen) VOICE.stop(); typingDone=true; speechDone=true; finish(); return; }
      i++; p.textContent=text.slice(0,i); const ch=text[i-1];
      if (ch && ch.trim()) presence && presence.kick(spoken?.06:.12);
      if (i % 40 === 0 && host && host.isConnected) host.scrollIntoView({block:"nearest"});
      if (i<text.length){ setTimeout(tick, /[.?\n]/.test(ch)?pace.stop : /[,;:]/.test(ch)?pace.comma : pace.ch); }
      else { typingDone=true; if (spoken) setTimeout(()=>{ speechDone=true; finish(); }, 4000); finish(); }
    };
    tick();
  });
}
function addLine(kind, text, opts={}){
  const d = el("div",{class:"line " + kind + (opts.cls ? " " + opts.cls : "")}); const p = el("p"); d.appendChild(p);
  const typed = kind === "voice" && !opts.instant && !(opts.cls||"").includes("thinking");
  if (!typed) p.textContent = text;
  const done = typed ? typeInto(p, text) : Promise.resolve();
  if (kind === "voice" && text){ const s = $("#say"); if (s) s.textContent = text.replace(/·/g,"").trim(); }   // il lettore di schermo legge la frase intera, una volta
  done.then(()=>{ if (d.isConnected) d.scrollIntoView({behavior: REDUCED ? "auto" : "smooth", block:"nearest"}); });
  if (kind === "voice" && opts.share) done.then(()=>{
    const t = el("div",{class:"tools"});
    t.append(el("button",{type:"button",class:"link",onclick:()=>shareLink(shareText(p.textContent), d)},SHARE_LBL),
             el("button",{type:"button",class:"link",onclick:()=>saveCard({format:"post", main:p.textContent, firma:"La Stanza · dai libri di Antonio Flamini"}, "il-vuoto")},"Post"),
             el("button",{type:"button",class:"link",onclick:()=>saveCard({format:"story", main:p.textContent, firma:"La Stanza · dai libri di Antonio Flamini"}, "il-vuoto")},"Storia"));
    d.appendChild(t);
  });
  log.appendChild(d);
  d.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"end"});
  return {d, p, done};
}
function isCrisi(t){   // prima di cercare: apostrofi al posto degli accenti (piu' -> più), spazi doppi
  const s = String(t).replace(/([aeiou])['’`´]/gi, (m,v)=>({a:"à",e:"è",i:"ì",o:"ò",u:"ù"})[v.toLowerCase()]||m).replace(/\s+/g," ");
  return CRISI.test(s) || CRISI.test(String(t)) || /\b(voglio|vorrei|devo) buttarmi|\bmi (voglio|vorrei) buttare\b|\bnon voglio (più |piu )?vivere\b|\bmi taglio\b(?! (i capelli|la barba|le unghie))|\bmi sparo\b|\b(voglio|vorrei) scomparire\b|\bnon voglio più svegliarmi\b/i.test(s);
}
function norm(s){ return " " + s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ") + " "; }
let lastTema = null, depth = 0, lastEx = "", memTema = null;
const STOP_IT = new Set("perche quando sempre ancora questo questa quello quella questi quelle niente nessuno qualcosa qualcuno davvero allora proprio troppo tutto tutti tutte molto adesso perché però come dove anche oppure mentre sento sentito fatto fare essere avere stato stata dopo prima poco altro altra altri cosa cose volta volte credo penso voglio vorrei posso potrei dovrei sarebbe sono siamo".split(" "));
function parolaPesante(text){
  const ws = (String(text).toLowerCase().match(/\p{L}{6,}/gu) || []).filter(w => !STOP_IT.has(w.normalize("NFD").replace(/[\u0300-\u036f]/g,"")));
  return ws.sort((a,b)=>b.length-a.length)[0] || "";
}
const CRISI_SEGUITO = ["Sono ancora qui. Ma una persona vera conta più di queste pagine: in emergenza il 112, oppure Telefono Amico Italia allo 02 2327 2327.",
  "Non devi spiegarmi niente. Se puoi, chiama adesso qualcuno di cui ti fidi, o Telefono Amico Italia allo 02 2327 2327. In emergenza, il 112."];
const GENERIC_Q = ["Resta lì un momento. Cosa c'è sotto?","E adesso, cosa resta?","Puoi dirlo con meno parole?","Di chi è questa frase, davvero?","Cosa toglieresti, per primo?","Se lo dicessi ad alta voce, come suonerebbe?","Chi te l'ha insegnato?","E se non ci fosse niente da fare?","Che cosa c'era prima di questo pensiero?","Da quanto tempo lo porti con te?"];
const CONTINUA = ["Capito.","Ti seguo.","Va bene così.","Ok, restiamo qui un momento.","Non c'è fretta."];
const CHIUSURA = ["Ci siamo girati intorno abbastanza. Se vuoi, premi Stanza: ti do un piccolo esercizio da fare su carta. Oppure prova il Test del Silenzio.",
                  "Forse per oggi basta così. Puoi premere Taci e lasciare spazio, oppure raccontarmi un'altra cosa."];
function freeOf(arr){ return (arr||[]).filter(x=>!used.has(x)); }
function take(arr, ordered){ const f = freeOf(arr); if (!f.length) return ""; const x = ordered ? f[0] : pick(f); used.add(x); return x; }
function fragmentReply(text){
  turnCount++;
  const t = norm(text), score = {};
  for (const [tema, def] of Object.entries(TEMI)) for (const k of def.k) if (t.includes(/\s$/.test(k) ? " " + norm(k).trim() + " " : " " + norm(k).trim())) score[tema]=(score[tema]||0)+(def.w||1);
  if (!Object.keys(score).length) for (const [tema, def] of Object.entries(TEMI)) for (const k of (def.kd||[])) if (t.includes(" " + norm(k).trim())) score[tema]=(score[tema]||0)+1;
  const temi = Object.keys(score).sort((a,b)=>score[b]-score[a]);
  const words = text.trim().split(/\s+/).length;
  // conversazione: una risposta breve o senza tema continua l'argomento di prima
  if (lastTema === "__crisi" && (!temi.length || words <= 4 || ["incerto","acquisto","regalo","libro"].includes(temi[0]))) return take(CRISI_SEGUITO) || CRISI_SEGUITO[0];
  if (lastTema === "__crisi") lastTema = null;
  if (noSell && ["acquisto","regalo"].includes(temi[0])) temi.shift();
  const continua = lastTema && (!temi.length || (words <= 4 && temi[0]==="incerto"));
  if (continua){
    depth++;
    const def = TEMI[lastTema];
    const r = take(def.r, def.w>1), q = take(def.q);
    if (depth >= 3 || (!r && !q)){ lastTema = null; depth = 0; return pick(CHIUSURA); }
    return (r || pick(CONTINUA)) + " " + (q || take(GENERIC_Q) || pick(GENERIC_Q));
  }
  if (turnCount % 7 === 0 && (!temi.length || temi[0]==="incerto")) return pick(VUOTI);
  const tema = temi[0] || null; const def = tema ? TEMI[tema] : null;
  // memoria: se cambia argomento, a volte la Stanza ricorda di cosa parlavi prima
  const prevTema = memTema; if (tema && TEMI_NOMI[tema]) memTema = tema;
  const ricordo = (tema && prevTema && prevTema !== tema && TEMI_NOMI[tema] && TEMI_NOMI[prevTema] && Math.random() < 0.4)
    ? pick(RICORDO).replace("{a}", TEMI_NOMI[prevTema]).replace("{b}", TEMI_NOMI[tema]) + "\n\n" : "";
  // eco: senza un tema riconosciuto, a volte restituisce la parola più pesante del messaggio
  if (!tema && words >= 3 && Math.random() < 0.45){ const w = parolaPesante(text); if (w){ lastTema = null; depth = 0; return pick(ECO).replace("{w}", w) + " " + (take(GENERIC_Q) || pick(GENERIC_Q)); } }
  lastTema = tema; depth = 0;
  const q = (def && take(def.q)) || take(GENERIC_Q) || pick(GENERIC_Q);
  const bridge = def ? take(def.r, def.w>1) : "";
  const tail = (bridge ? bridge + " " : "") + q;
  if (def && def.solo) return tail;
  if (ricordo) return ricordo + tail;
  const pools = vol === "III" ? [VOLUMI.III.frammenti] : [VOLUMI[vol].frammenti, VOLUMI.II.frammenti, VOLUMI.I.frammenti];
  let frag = null;
  if (tema) for (const pool of pools){ const c = pool.filter(f=>f[1].split(" ").includes(tema) && !used.has(f[0])); if (c.length){ frag = pick(c); break; } }
  if (!frag){ const c = pools[0].filter(f=>!used.has(f[0])); frag = c.length ? pick(c) : null; }
  if (!frag || (tema && Math.random() < 0.15)) return tail;
  used.add(frag[0]);
  return "«" + frag[0] + "»\n\n" + tail;
}
function buildRules(){
  const v = VOLUMI[vol];
  return VOICE_RULES + "\n\n" + FUNZIONI_CONTESTO + "\n\n" + AUTORE_CONTESTO + `\n\nVOLUME APERTO ORA: ${v.nome}.\nSINTESI: ${v.sintesi}\n\n${vol==="III" ? "FRASI DELLA QUARTA DI COPERTINA (puoi citarle come quarta di copertina, non come testo del libro):" : "FRAMMENTI CITABILI:"}\n` +
    v.frammenti.map(f=>"- " + f[0]).join("\n") +
    (vol !== "III" ? "\n\nAltri frammenti dalla collana:\n" + VOLUMI[vol==="I"?"II":"I"].frammenti.slice(0,12).map(f=>"- "+f[0]).join("\n") : "") +
    `\n\nIl contatore del silenzio è al ${pct(silenzio)}%. Rispondi ora all'ultimo messaggio della persona.`;
}
async function liveReply(text){
  ctl = new AbortController();
  const input = [{role:"user", content: buildRules()}, ...turns.slice(-10), {role:"user", content:text}];
  const {text: out} = await sample(input, { modelTier:"quick", cache:false, signal:ctl.signal,
    });
  return out.trim();
}
function setMode(){ stateEl.innerHTML = VOLUMI[vol].stato + (liveOK ? " · voce viva" : " · voce a frammenti"); }
async function respond(text){
  if (busy) return; stopIntro(); busy = true; setBusy(true); const gen = convGen;
  try {
    rush = false; addLine("you", text); document.querySelector(".presence").classList.add("compact");
    if (isCrisi(text)){ noSell = true; lastTema = "__crisi"; depth = 0; await addLine("voice", CRISI_TESTO, {cls:"alert", instant:true}).done; VOICE.say(CRISI_TESTO.replace("02 2327 2327","zero due, ventitré ventisette, ventitré ventisette")); return; }
    stepSilence();
    let answer = null;
    presence.set("think");
    if (liveOK && sample){
      const th = addLine("voice", "", {cls:"thinking"});
      try { answer = await liveReply(text); }
      catch(e){ const code = e && e.code;
        if (["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed","session_expired"].includes(code)){ liveOK=false; setMode(); }
        else if (code === "rate_limited") toast("Troppe domande insieme. Per ora rispondono i frammenti."); }
      finally { th.d.remove(); }
    }
    if (gen !== convGen) return;                       // nel frattempo è cambiato volume: questa risposta non appartiene più a nessuno
    if (!answer){ await sleep(700 + Math.random()*900); if (gen !== convGen) return; answer = fragmentReply(text); }   // il Ma: una pausa prima di rispondere
    turns.push({role:"user",content:text},{role:"assistant",content:answer});
    const line = addLine("voice", answer, {share:true}); await line.done;
    if (gen !== convGen) return;
    const row = typeof sellRowFor==="function" ? sellRowFor(text, lastTema) : null; if (row){ const sr = el("div",{class:"tools sell-row"}, row); line.d.append(sr); sr.scrollIntoView({block:"nearest"}); }
  } catch(e){ console.error(e); }
  finally { busy = false; setBusy(false); if (presence && presence.state==="think") presence.set("idle"); }
}
function setBusy(b){ $("#send").disabled=b; $("#taci").disabled=b; $("#stanza").disabled=b; }
function openVolume(v, opening){
  convGen++; rush = false; vol = v; turns = []; used = new Set(); turnCount = 0; lastTema = null; depth = 0; memTema = null; document.querySelector(".presence").classList.remove("compact"); if (ctl) ctl.abort(); typeGen++; VOICE.stop();
  document.querySelectorAll(".vol").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.v===v)));
  log.replaceChildren(); setSilence(VOLUMI[v].silenzioIniziale); setMode();
  addLine("voice", opening || VOLUMI[v].apertura, {share:true});
  store.set("vol", v);
}
document.querySelectorAll(".vol").forEach(b=>b.onclick=()=>openVolume(b.dataset.v));
$("#ask").addEventListener("submit", e=>{ e.preventDefault(); if (busy){ toast("Un momento: sta ancora rispondendo."); return; } const t = msg.value.trim(); if (!t){ $("#taci").click(); return; } msg.value=""; autosize(); respond(t); });
msg.addEventListener("keydown", e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); $("#ask").requestSubmit(); } });
function autosize(){ msg.style.height="auto"; msg.style.height=Math.min(msg.scrollHeight, 150)+"px"; }
msg.addEventListener("input", ()=>{ autosize(); presence.listen(); });
$("#taci").onclick = ()=>{ stopIntro(); if (busy || (presence && presence.state==="speak")) return; stepSilence(5); presence.hush(); addLine("voice", "·  ·  ·", {cls:"blank", instant:true}); };
$("#stanza").onclick = ()=>{ stopIntro(); if (busy || (presence && presence.state==="speak")) return; rush = false; let ex = take(STANZE[vol]); if (!ex){ STANZE[vol].forEach(x=>used.delete(x)); used.add(lastEx); ex = take(STANZE[vol]) || STANZE[vol][0]; } lastEx = ex; addLine("voice", ex, {share:true}); stepSilence(); msg.focus(); };

/* --- la presentazione --- */
const INTRO = ["Ciao, sono la Stanza.\nNon sono Antonio: sono una voce fatta con le frasi dei suoi libri.",
               "Parlo poco e faccio qualche domanda.\nOgni tanto non rispondo: serve a lasciarti spazio."];
let introOn = false;
function stopIntro(){   // chi scrive (o tace) durante la presentazione ha la precedenza: la presentazione si chiude
  if (!introOn) return; introOn = false; typeGen++; rush = false; VOICE.stop();
  log.querySelectorAll(".choices").forEach(x=>x.remove()); store.set("presentato", true);
}
async function presentati(){
  typeGen++; convGen++; const my = typeGen; rush = false; introOn = true;
  log.replaceChildren(); presence.birth(); presence.set("idle"); VOICE.stop();
  if (!VOICE.unlocked && VOICE.ok){
    await new Promise(go=>{
      const gate = el("div",{class:"choices"},
        el("button",{type:"button",class:"btn primary",onclick:()=>{ VOICE.on=true; store.set("voce",true); renderVoiceBtn(); VOICE.unlock(); gate.remove(); go(); }},"Entra con la voce"),
        el("button",{type:"button",class:"btn ghost",onclick:()=>{ VOICE.on=false; store.set("voce",false); renderVoiceBtn(); gate.remove(); go(); }},"Entra in silenzio"));
      setTimeout(()=>{ if (my===typeGen) log.appendChild(gate); }, REDUCED?0:1400);
    });
    if (my!==typeGen) return;
  }
  await sleep(REDUCED ? 0 : 700);
  for (const line of INTRO){ if (my!==typeGen) return; await addLine("voice", line).done; await sleep(REDUCED||rush?0:500); }
  rush = false;
  if (my!==typeGen) return;
  const ch = el("div",{class:"choices"},
    el("p",{class:"sub",style:"width:100%;margin:0"},"Da dove vuoi cominciare?"),
    el("button",{type:"button",class:"btn primary",onclick:()=>goRoom("test")},"Il Test del Silenzio"),
    el("button",{type:"button",class:"btn ghost",onclick:()=>{ gameStart="gioco2"; goRoom("giochi"); }},"Gioca: il bicchiere"),
    el("button",{type:"button",class:"btn ghost",onclick:()=>{ ch.remove(); addLine("voice", VOLUMI[vol].apertura, {share:true}); msg.focus(); }},"Parlami"),
    el("div",{class:"tools",style:"width:100%"}, el("button",{type:"button",class:"link","data-sheet":"ce_lho"},"Ho già il libro"), el("button",{type:"button",class:"link",onclick:openInfo},"Cos'è la Stanza"), ...(IS_HOME_APP?[]:[el("button",{type:"button",class:"link",onclick:openHomeSheet},"Mettila nella Home")])));
  introOn = false; log.appendChild(ch); ch.scrollIntoView({behavior: REDUCED ? "auto" : "smooth", block:"nearest"});
  store.set("presentato", true);
}
log.addEventListener("click", e=>{ if (!e.target.closest("button,a")){ rush = true; VOICE.stop(); } });
$("#voce").onclick = ()=>{ VOICE.on = !VOICE.on; store.set("voce", VOICE.on); renderVoiceBtn(); if (VOICE.on){ VOICE.unlock(); VOICE.say("Ci sono."); } else VOICE.stop(); };
renderVoiceBtn();
$("#presentati").onclick = ()=>{ goRoom("stanza"); presentati(); };

/* ====================== IL TEST DEL SILENZIO ====================== */
const T = COPY.test, ARCH = Object.fromEntries(T.archetipi.map(a=>[a.chiave,a]));
let tState = {i:0, punti:{}, s:0};
function testIntro(){
  const box = $("#test"); box.replaceChildren();
  const last = store.get("archetipo", null);
  box.append(
    el("div",{class:"eyebrow"},"Il Test del Silenzio · 5 domande · un minuto"),
    el("h2",{class:"huge"},"Quanto silenzio hai dentro?"),
    el("p",{class:"big"},"Cinque domande. Nessuna risposta giusta. Alla fine saprai a che pagina del vuoto sei arrivato."),
    el("div",{class:"acts"}, el("button",{type:"button",class:"btn primary",onclick:()=>{tState={i:0,punti:{},s:0}; testQ();}},"Comincia"),
      ...(last && ARCH[last.k] ? [el("button",{type:"button",class:"btn ghost",onclick:()=>testResult(last.k,last.s)},"L'ultimo risultato")] : []))
  );
}
function testQ(){
  const box = $("#test"), q = T.domande[tState.i]; box.replaceChildren();
  const bar = el("div",{class:"bar"}); const fill = el("i"); fill.style.width = (tState.i/T.domande.length*100)+"%"; bar.append(fill);
  const ans = el("div",{class:"answers"});
  q.risposte.forEach((r,ix)=>ans.append(el("button",{type:"button",class:"ans",onclick:()=>{
    for (const a of r.a) tState.punti[a]=(tState.punti[a]||0)+1; tState.s += Number(r.s)||0; tState.i++;
    if (tState.i < T.domande.length) testQ(); else finishTest();
  }}, el("span",{},String.fromCharCode(65+ix)), r.t)));
  box.append(el("div",{class:"eyebrow"},`${tState.i+1} / ${T.domande.length}`), bar, el("h2",{class:"big"},q.q), ans);
  box.querySelector(".ans").focus({preventScroll:true});
}
function finishTest(){
  const max = Math.max(...Object.values(tState.punti));
  const top = Object.keys(tState.punti).filter(k=>tState.punti[k]===max && ARCH[k]);
  top.sort(); const k = top.length ? top[tState.s % top.length] : T.archetipi[0].chiave;
  const maxS = T.domande.reduce((a,q)=>a+Math.max(...q.risposte.map(r=>Number(r.s)||0)),0) || 100;
  const page = Math.max(1, Math.min(149, Math.round(tState.s / maxS * 149)));   // una pagina vera del libro
  store.set("archetipo",{k, s:page});
  testResult(k, page);
}
let lastResult = null;
function testResult(k, page){
  lastResult = {k, page};
  const a = ARCH[k], perc = page * STEP, box = $("#test"); box.replaceChildren();
  const meter = `Silenzio: ${pct(perc)}% · pagina ${page + 1} di 150`;
  const hook = pick((COPY.card_hook||[]).filter(h=>!/\d/.test(h)).concat(["E tu, a che pagina sei?"]));
  const actions = el("div",{class:"acts"},
    el("button",{type:"button",class:"btn primary",onclick:()=>saveCard({format:"story", eyebrow:"Il mio risultato", title:a.nome, main:a.riga, sub:hook, meter}, "il-vuoto-"+k)},"Salva la storia"),
    el("button",{type:"button",class:"btn ghost",onclick:()=>saveCard({format:"post", eyebrow:"Il mio risultato", title:a.nome, main:a.riga, sub:hook, meter}, "il-vuoto-"+k)},"Salva il post"),
    el("button",{type:"button",class:"btn ghost",onclick:e=>copyText(`Il Test del Silenzio dice che sono «${a.nome}». ${a.riga}\n${meter}\nE tu? ${PAGE_URL}\n#ilvuoto`, box)},"Copia"));
  box.append(
    el("div",{class:"eyebrow"},"Il tuo risultato"),
    el("h2",{class:"huge"},a.nome),
    el("div",{class:"result", style:"display:flex;flex-direction:column;gap:18px"},
      el("p",{class:"riga"},a.riga), el("p",{class:"verita"},a.verita), el("p",{class:"invito"},a.invito)),
    el("div",{class:"meter"}, el("span",{},meter)),
    actions,
    el("div",{class:"tools"},
      el("button",{type:"button",class:"link",onclick:()=>{ goRoom("stanza"); openVolume(a.volume==="II"?"II":"I", `Il test dice: ${a.nome}.\n\n${a.verita}\n\nVuoi parlarne?`); }},"Parlane con la Stanza"),
      el("button",{type:"button",class:"link",onclick:()=>{tState={i:0,punti:{},s:0}; testQ();}},"Rifai il test"))
  );
  const sb = typeof testSellBlock==="function" ? testSellBlock(a, page) : null; if (sb) box.append(sb);
}

/* ====================== OGGI ====================== */
function dayIndex(d=new Date()){   // la data di Roma, così la domanda del giorno è davvero uguale per tutti
  try { const [y,m,g] = new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).format(d).split("-").map(Number); return Math.floor((Date.UTC(y,m-1,g)-Date.UTC(2026,0,1))/86400000); }
  catch(e){ return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) - Date.UTC(2026,0,1)) / 86400000); } }
let passed = null;   // domanda ricevuta da un link #q12
function renderOggi(){
  const box = $("#oggi"); box.replaceChildren();
  const di = dayIndex(), list = COPY.domande_del_giorno, qi = ((di % list.length)+list.length)%list.length;
  if (passed !== null){
    const pq = list[passed].q;
    box.append(el("div",{class:"eyebrow"},"Qualcuno ti ha passato una domanda"), el("h2",{class:"big"},pq),
      el("p",{class:"sub"},"Non devi rispondere a chi te l'ha mandata. Basta rispondere a te."),
      el("div",{class:"acts"},
        el("button",{type:"button",class:"btn primary",onclick:()=>{ goRoom("stanza"); openVolume(vol, pq); msg.focus(); }},"Rispondi nella Stanza"),
        el("button",{type:"button",class:"btn ghost",onclick:()=>shareLink(pq + "\n" + PAGE_URL + "#q" + passed, box)},"Passala a qualcun altro"),
        el("button",{type:"button",class:"btn ghost",onclick:()=>{ passed=null; renderOggi(); }},"La domanda di oggi")));
    return;
  }
  const q = list[qi].q;
  // giorni consecutivi (solo su questo dispositivo)
  let st = store.get("giorni", null); if (!st || typeof st!=="object" || !Number.isFinite(st.tot)) st = {last:null, run:0, tot:0};
  const today = new Date(); const dateTxt = today.toLocaleDateString("it-IT",{weekday:"long", day:"numeric", month:"long"});
  const n = (di % 150 + 150) % 150, perc = n * STEP;
  const note = el("textarea",{class:"note",id:"oggi-note",rows:"2",placeholder:"Rispondi qui. Diventa una pagina del tuo Vuoto e resta solo su questo telefono.",maxlength:"400"});
  note.value = (QUADERNO.get()[di] || {}).a || store.get("nota-"+di, "");
  const help = el("p",{class:"voice alert",style:"white-space:pre-line;font-size:16px;margin:0",hidden:""}, CRISI_TESTO);
  note.oninput = ()=>{ QUADERNO.write(di, q, note.value); if (isCrisi(note.value)){ noSell = true; help.hidden = false; } };
  const mark = ()=>{ if (st.last !== di){ QUADERNO.write(di, q, note.value); st = {last:di, run: st.last===di-1 ? st.run+1 : 1, tot: st.tot+1}; store.set("giorni", st); track("oggi-risposto-" + di); const ok = store.get("giorni", null); renderOggi(); toast(ok && ok.last===di ? "Segnato. Torna domani." : "Fatto. Questo browser non conserva i giorni, quindi il conto non resta."); } };
  box.append(
    el("div",{class:"eyebrow"}, dateTxt + " · la domanda di oggi"),
    el("h2",{class:"big"}, q),
    note, help,
    el("div",{class:"acts"},
      el("button",{type:"button",class:"btn primary",onclick:mark, ...(st.last===di?{disabled:""}:{})}, st.last===di ? "Fatto per oggi" : "Ho risposto"),
      el("button",{type:"button",class:"btn ghost",onclick:()=>{ const ans = note.value.trim();
        saveCard(ans ? {format:"story", eyebrow:"La domanda di oggi", main:q, answer:ans, sub:"E tu?", meter:fmt(perc)}
                     : {format:"story", eyebrow:"La domanda di oggi", main:q, sub:"Rispondi nella tua testa. Poi taci.", meter:fmt(perc)}, "il-vuoto-oggi"); }},"Storia"),
      el("button",{type:"button",class:"btn ghost",onclick:()=>{ goRoom("stanza"); openVolume(vol, q); msg.value = note.value; autosize(); msg.focus(); }},"Parlane")),
    el("div",{class:"tools"},
      el("button",{type:"button",class:"link",onclick:()=>{ const full=Math.round(perc/10); shareLink(`IL VUOTO · ${dateTxt}\n${fmt(perc)}\n${"▓".repeat(full)}${"░".repeat(10-full)}\nHo risposto. Non ti dico cosa.\n${PAGE_URL}#oggi\n#ilvuoto`, box); }},"Copia il tuo giorno (senza la risposta)"),
      el("button",{type:"button",class:"link",onclick:()=>shareLink(q + "\n" + PAGE_URL + "#q" + qi, box)},"Passa questa domanda"),
      ...(window.claude ? [] : [el("button",{type:"button",class:"link",onclick:remindIcs},"Ricordamela ogni sera")])),
    ...(st.last===di && !IS_HOME_APP ? [el("div",{class:"sell"}, el("p",{class:"sub"},"La domanda cambia a mezzanotte. Per ritrovarla domani con un tocco, mettila nella schermata Home."), el("div",{class:"tools"}, el("button",{type:"button",class:"link",onclick:openHomeSheet},"Mettila nella Home")))] : []),
    el("div",{class:"daycount"},
      el("div",{}, el("b",{}, String(st.last===di||st.last===di-1 ? st.run : 0)), el("small",{},"giorni di fila")),
      el("div",{}, el("b",{}, String(st.tot)), el("small",{},"giorni in tutto")),
      el("div",{}, el("b",{}, pct(perc)+"%"), el("small",{},"silenzio di oggi"))),
    othersLine(di, st.last===di),
    quadernoBlock(),
    ...(typeof oggiSellLine==="function" && [7,30].includes(st.tot) ? [oggiSellLine(st.tot)].filter(Boolean) : []),
    el("p",{class:"sub"},"Una domanda al giorno, uguale per tutti. Domani ne arriva un'altra.")
  );
}

/* ====================== SUONO DEL SILENZIO ======================
   Un rumore di stanza (4'33'') o di pioggia (il bicchiere), generato dal browser: nessun file da scaricare. */
const AMBIENT = {
  ctx: null, node: null, gain: null, on: store.get("suono", true),
  noise(kind){
    const c = this.ctx, len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++){ const w = Math.random()*2-1;
      if (kind === "stanza"){ last = (last + 0.02*w) / 1.02; d[i] = last * 3.2; }      // rumore "marrone": il fondo di una stanza
      else { d[i] = w * (Math.random() < 0.0009 ? 1 : 0.32); } }                        // pioggia: fruscio con qualche goccia
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter();
    if (kind === "stanza"){ f.type = "lowpass"; f.frequency.value = 420; } else { f.type = "bandpass"; f.frequency.value = 1600; f.Q.value = 0.5; }
    src.connect(f); return {src, out: f};
  },
  start(kind){
    if (!this.on || REDUCED_SOUND()) return;
    try {
      this.stop(true);
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      const {src, out} = this.noise(kind), g = this.ctx.createGain(), t = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(kind === "stanza" ? 0.22 : 0.12, t + 2.5);
      out.connect(g); g.connect(this.ctx.destination); src.start(); this.node = src; this.gain = g;
    } catch(e){}
  },
  stop(now){
    const n = this.node, g = this.gain; this.node = this.gain = null; if (!n) return;
    try { const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + (now ? 0.05 : 1.2)); n.stop(t + (now ? 0.06 : 1.3)); } catch(e){}
  },
  toggle(){ this.on = !this.on; store.set("suono", this.on); if (!this.on) this.stop(); }
};
function REDUCED_SOUND(){ return false; }
function soundToggle(){
  const b = el("button",{type:"button",class:"link","aria-pressed":String(AMBIENT.on)});
  const draw = ()=>{ b.textContent = "Suono: " + (AMBIENT.on ? "acceso" : "spento"); b.setAttribute("aria-pressed", String(AMBIENT.on)); };
  b.onclick = ()=>{ AMBIENT.toggle(); draw(); }; draw(); return el("div",{class:"tools"}, b);
}
addEventListener("visibilitychange", ()=>{ if (document.hidden) AMBIENT.stop(true); });

/* ====================== IL TUO VUOTO: il libro che scrivi tu, una risposta al giorno ======================
   Ogni risposta alla domanda di Oggi è una pagina: pagina 1 = silenzio 0%, pagina 150 = 100%, come nel Volume I.
   Tutto resta sul telefono (localStorage); si può salvare una copia e stampare il proprio volume in PDF. */
const QUADERNO = {
  key: "quaderno",
  get(){ let o = store.get(this.key, null); if (!o || typeof o !== "object"){ o = this.migrate(); } return o; },
  migrate(){   // le vecchie note di Oggi diventano le prime pagine
    const o = {}, list = COPY.domande_del_giorno;
    try { for (let k=0;k<localStorage.length;k++){ const key=localStorage.key(k); const m=key && key.match(/^ilvuoto-nota-(-?\d+)$/);
      if (m){ const d=+m[1]; let a=""; try { a = JSON.parse(localStorage.getItem(key)) || ""; } catch(e){} if (String(a).trim()) o[d] = {q: list[((d%list.length)+list.length)%list.length].q, a: String(a)}; } } } catch(e){}
    store.set(this.key, o); return o;
  },
  write(di, q, a){ const o = this.get(); a = String(a||""); if (a.trim()) o[di] = {q, a}; else delete o[di]; store.set(this.key, o); },
  pages(){ const o = this.get(); return Object.keys(o).map(Number).sort((x,y)=>x-y).map(d=>({d, ...o[d]})); },
  name(){ return store.get("quaderno-nome", ""); }
};
function dateOf(di){ return new Date(Date.UTC(2026,0,1) + di*86400000); }
function dateTxtOf(di, opts={day:"numeric", month:"long", year:"numeric"}){ return dateOf(di).toLocaleDateString("it-IT", {timeZone:"UTC", ...opts}); }
function silOfPage(n){ return Math.min(100, (n-1) * STEP); }   // pagina 1 → 0%, pagina 150 → 100%

function quadernoGrid(pages){
  const g = el("div",{class:"q-grid",role:"img","aria-label":`${Math.min(pages.length,150)} pagine scritte su 150`});
  for (let i=1;i<=150;i++) g.append(el("i",{class: i<=pages.length ? "on" : ""}));
  return g;
}
function quadernoBlock(){
  const pages = QUADERNO.pages(), n = pages.length, done = n >= 150;
  return el("div",{class:"q-block"},
    el("div",{class:"row"}, el("span",{class:"eyebrow"},"Il tuo Vuoto"), el("span",{class:"counter"}, n ? `pagina ${Math.min(n,150)} di 150 · ${fmt(silOfPage(Math.min(n,150)))}` : "pagina 0 di 150")),
    el("p",{class:"g-how"}, done ? "Hai scritto il tuo volume: 150 pagine. Adesso puoi stamparlo, o regalarlo."
      : n ? "Ogni risposta è una pagina. A 150 il tuo volume è finito: il silenzio arriva al 100%, come nel libro."
          : "Ogni risposta di Oggi diventa una pagina di un libro tuo. Pagina 1 al silenzio 0%, pagina 150 al 100%. Poi lo stampi."),
    quadernoGrid(pages),
    el("div",{class:"tools"},
      el("button",{type:"button",class:"link",onclick:openQuaderno}, n ? "Sfoglia le tue pagine" : "Come funziona"),
      ...(n ? [el("button",{type:"button",class:"link",onclick:printQuaderno},"Stampa il tuo volume (PDF)")] : [])));
}
/* quante persone hanno risposto oggi (GoatCounter, contatore pubblico): solo un numero, nessuna risposta */
function othersLine(di, answered){
  const p = el("p",{class:"sub",hidden:""});
  if (typeof GOATCOUNTER === "string" && GOATCOUNTER && !window.claude && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)){
    fetch(`https://${GOATCOUNTER}.goatcounter.com/counter/${encodeURIComponent("oggi-risposto-" + di)}.json`).then(r=>r.ok ? r.json() : null).then(j=>{
      const c = j && parseInt(String(j.count).replace(/\D/g,""), 10);
      if (c >= 3){ p.textContent = answered ? `Oggi hai risposto insieme ad altre ${(c-1).toLocaleString("it-IT")} persone. Nessuno sa cosa.` : `Oggi hanno risposto ${c.toLocaleString("it-IT")} persone. Nessuno sa cosa.`; p.hidden = false; }
    }).catch(()=>{});
  }
  return p;
}
function openQuaderno(){
  sheetReturn = document.activeElement; VOICE.stop();
  const box = $("#sheet-in"); box.replaceChildren();
  const pages = QUADERNO.pages(), n = pages.length;
  const nameIn = el("input",{class:"note",type:"text",maxlength:"40",placeholder:"Il tuo nome, per la copertina (facoltativo)","aria-label":"Il tuo nome per la copertina"});
  nameIn.value = QUADERNO.name(); nameIn.oninput = ()=>store.set("quaderno-nome", nameIn.value.trim());
  const list = el("div",{class:"pass"});
  pages.slice().reverse().forEach((pg, i)=>{ const num = n - i;
    list.append(el("div",{class:"q-page"},
      el("div",{class:"eyebrow"}, `Pagina ${num} · ${dateTxtOf(pg.d)} · ${fmt(silOfPage(Math.min(num,150)))}`),
      el("p",{class:"sub"}, pg.q), el("p",{class:"q-a"}, pg.a))); });
  const fileIn = el("input",{type:"file",accept:"application/json,.json",hidden:""});
  fileIn.onchange = async ()=>{ const f = fileIn.files && fileIn.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); const o = j && j.pagine; if (!o || typeof o !== "object") throw 0;
      const cur = QUADERNO.get(); let added = 0; for (const [d, v] of Object.entries(o)){ if (v && typeof v.a === "string" && typeof v.q === "string" && /^-?\d+$/.test(d)){ if (!cur[d]) added++; cur[d] = {q: v.q.slice(0,400), a: v.a.slice(0,400)}; } }
      store.set(QUADERNO.key, cur); if (j.nome && !QUADERNO.name()) store.set("quaderno-nome", String(j.nome).slice(0,40));
      toast(added ? `Ripristinate ${added} pagine.` : "Nessuna pagina nuova da ripristinare."); openQuaderno(); renderOggi(); }
    catch(e){ toast("Questo file non è una copia del Vuoto."); } };
  box.append(
    el("div",{class:"row"}, el("span",{class:"eyebrow"},"Il tuo Vuoto · " + (n ? `${Math.min(n,150)} pagine su 150` : "ancora bianco")), el("button",{type:"button",class:"btn ghost",onclick:closeSheet},"Chiudi")),
    el("h2",{class:"huge",id:"sheet-title"}, n >= 150 ? "Il tuo volume è finito." : "Il libro che scrivi tu."),
    el("p",{class:"big"}, "Ogni giorno, nella stanza Oggi, rispondi a una domanda. Ogni risposta è una pagina. Alla pagina 150 il silenzio è al 100% e il volume è finito."),
    quadernoGrid(pages),
    el("p",{class:"sub"}, "Le pagine restano solo su questo telefono: nessuno le legge, nemmeno Antonio. Se cambi telefono o cancelli i dati del browser spariscono, quindi ogni tanto salvane una copia."),
    nameIn,
    el("div",{class:"acts"},
      ...(n ? [el("button",{type:"button",class:"btn primary",onclick:printQuaderno},"Stampa il tuo volume (PDF)")] : [el("button",{type:"button",class:"btn primary",onclick:()=>{ closeSheet(); goRoom("oggi"); setTimeout(()=>{ const t=$("#oggi-note"); if (t) t.focus(); }, 50); }},"Scrivi la prima pagina")]),
      ...(n ? [el("button",{type:"button",class:"btn ghost",onclick:backupQuaderno},"Salva una copia")] : []),
      el("button",{type:"button",class:"btn ghost",onclick:()=>fileIn.click()},"Ripristina una copia"), fileIn),
    ...(n ? [el("div",{class:"eyebrow"},"Le tue pagine"), list] : []),
    el("p",{class:"g-libro"}, "Il Volume I di Antonio Flamini fa la stessa cosa al contrario: 150 pagine quasi bianche, scritte da lui, con il silenzio che sale. ", sellLink("Il Volume I su Amazon","amazon","quaderno")));
  const d = $("#sheet"); d.hidden = false; d.scrollTop = 0; d.querySelector(".btn.ghost").focus();
  track("quaderno-aperto");
}
function backupQuaderno(){
  const data = {app:"il-vuoto", versione:1, salvato: new Date().toISOString(), nome: QUADERNO.name(), pagine: QUADERNO.get()};
  const blob = new Blob([JSON.stringify(data, null, 1)], {type:"application/json"}), file = `il-mio-vuoto-${new Date().toISOString().slice(0,10)}.json`;
  try { const f = new File([blob], file, {type:"application/json"});
    if (CAN_SHARE && navigator.canShare && navigator.canShare({files:[f]})){ navigator.share({files:[f], title:"Il mio Vuoto"}).catch(()=>{}); return; } } catch(e){}
  const a = el("a",{href:URL.createObjectURL(blob), download:file}); document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 3000);
  toast("Copia salvata. Tienila al sicuro: serve per ripristinare le pagine.");
}
/* il volume stampabile: 150 pagine A5, quelle non scritte restano bianche con il solo contatore, come nel libro */
function printQuaderno(){
  const pages = QUADERNO.pages().slice(0,150), nome = QUADERNO.name();
  let host = $("#stampa"); if (host) host.remove();
  host = el("div",{id:"stampa","aria-hidden":"true"});
  const pg = (cls, ...kids)=> el("section",{class:"p " + cls}, ...kids);
  host.append(pg("cover", el("div",{class:"p-brand"},"IL VUOTO"), el("div",{class:"p-sub"},"Analisi dello spazio tra i pensieri"),
    el("div",{class:"p-title"}, nome ? `Il Vuoto di ${nome}` : "Il mio Vuoto"),
    el("div",{class:"p-small"}, pages.length ? `${pages.length} pagine scritte · ${dateTxtOf(pages[0].d)} – ${dateTxtOf(pages[pages.length-1].d)}` : ""),
    el("div",{class:"p-foot"},"Con le domande della Stanza, dai libri di Antonio Flamini")));
  for (let i=1;i<=150;i++){
    const x = pages[i-1];
    host.append(pg(x ? "full" : "blank",
      ...(x ? [el("div",{class:"p-date"}, dateTxtOf(x.d)), el("div",{class:"p-q"}, x.q), el("div",{class:"p-a"}, x.a)] : []),
      el("div",{class:"p-meter"}, fmt(silOfPage(i))), el("div",{class:"p-num"}, String(i))));
  }
  host.append(pg("end", el("div",{class:"p-a"},"Fine."), el("div",{class:"p-q"},"Le pagine bianche le hai lasciate tu. Anche questa è una risposta."),
    el("div",{class:"p-foot"},"IL VUOTO · Volume I di Antonio Flamini, su Amazon · #ilvuoto")));
  document.body.appendChild(host);
  track("quaderno-stampa");
  const done = ()=>{ setTimeout(()=>{ const h=$("#stampa"); if (h) h.remove(); }, 500); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  toast("Scegli «Salva come PDF» nella finestra di stampa.");
  setTimeout(()=>{ try { window.print(); } catch(e){ toast("Su questo dispositivo la stampa non è disponibile."); } }, 300);
}

/* ====================== CANCELLA ====================== */
let eraseTimer = null;
function renderCancella(){
  const box = $("#cancella"); box.replaceChildren(); clearInterval(eraseTimer);
  const input = el("textarea",{class:"note",id:"cancella-in",rows:"3",maxlength:"220",placeholder:"Scrivi la cosa che non dici mai."});
  const out = el("p",{class:"erase","aria-hidden":"true"});
  const acts = el("div",{class:"acts"});
  const go = el("button",{type:"button",class:"btn primary",onclick:()=>{
    const text = input.value.trim(); if (!text){ input.focus(); return; }
    if (isCrisi(text)){ noSell = true; out.textContent = CRISI_TESTO; out.style.fontSize="17px"; return; }
    const toks = [...text.matchAll(/\p{L}+/gu)];
    if (!toks.length){ out.textContent = "Qui non c'è nessuna parola da lasciare. Prova con delle lettere."; return; }
    const best = toks.reduce((a,b)=> b[0].length >= a[0].length ? b : a);
    const keep = best[0], at = best.index;
    input.hidden = true; go.hidden = true; acts.replaceChildren();
    let pre = text.slice(0, Math.max(0,at)), post = text.slice(at + keep.length);
    const kept = text.slice(at, at + keep.length);
    const draw = ()=>{ out.replaceChildren(document.createTextNode(pre), el("span",{class: pre||post ? "" : "kept"}, kept), document.createTextNode(post), el("span",{class:"cur"})); };
    draw();
    const speed = matchMedia("(prefers-reduced-motion: reduce)").matches ? 5 : 45;
    eraseTimer = setInterval(()=>{
      if (post.length) post = post.slice(0,-1); else if (pre.length) pre = pre.slice(0,-1);
      else { clearInterval(eraseTimer); draw(); done(kept); return; }
      draw();
    }, speed);
  }},"Cancella");
  function done(word){
    acts.append(
      el("button",{type:"button",class:"btn primary",onclick:()=>saveCard({format:"story", eyebrow:"Ho scritto una frase. È rimasta una parola.", title:word, sub:"Il resto l'ho tolto.", meter:"Silenzio: 99,33%"}, "il-vuoto-parola")},"Salva la storia"),
      el("button",{type:"button",class:"btn ghost",onclick:()=>shareLink(`Ho scritto la cosa che non dico mai. È rimasta una parola: ${word}.\n${PAGE_URL}#cancella\n#ilvuoto`, box)},SHARE_LBL),
      el("button",{type:"button",class:"btn ghost",onclick:renderCancella},"Ancora"));
  }
  box.append(
    el("div",{class:"eyebrow"},"Scrivi e cancella · niente viene salvato"),
    el("h2",{class:"huge"},"Scrivila. Poi lasciala andare."),
    input, out, el("div",{class:"acts"}, go), acts,
    el("p",{class:"sub"},"La pagina cancella tutto lettera per lettera. Resta una parola sola, la più lunga. Spesso è quella che pesa.")
  );
}

/* ====================== PASSA ====================== */
function renderPassa(){
  const box = $("#passa"); box.replaceChildren();
  const list = el("div",{class:"pass"});
  for (const m of (COPY.messaggio_passa||[])){
    const item = el("div",{class:"pass-item"}, el("p",{},m), el("button",{type:"button",class:"link",onclick:()=>shareLink(m + "\n" + PAGE_URL, item)},SHARE_LBL));
    list.append(item);
  }
  box.append(
    el("div",{class:"eyebrow"},"Passare le consegne"),
    el("h2",{class:"huge"},"Non tenerla per te."),
    el("p",{class:"big"},"Il terzo volume si scriverà in due e si regalerà. Questa stanza si può già passare. Scegli una frase " + (CAN_SHARE ? "e mandala" : ", copiala e mandala") + " a una persona sola."),
    list,
    el("div",{}, el("div",{class:"eyebrow"},"Il link"), el("p",{class:"url"},PAGE_URL)),
    ...(typeof noSell!=="undefined" && noSell ? [] : [el("div",{class:"acts"}, el("button",{type:"button",class:"btn ghost","data-sheet":"regalo"},"Regala il Volume I"))])
  );
}


let noSell = false;                                   // diventa vero dopo una frase di crisi: niente proposte per tutta la visita
const AUTORE_AMAZON = "https://www.amazon.com/author/antonioflamini";
function buyUrl(punto){ const L = VENDITE.link; return (L.link_per_punto && L.link_per_punto[punto]) || (L.vol1_pulito && !/\{/.test(L.vol1_pulito) ? L.vol1_pulito : BUY); }
function hasVol1(){ return !!store.get("ha_volume_I", false); }
function igUrl(){ return VENDITE.link.instagram || "https://www.instagram.com/antonio_flamini/"; }
function seguiUrl(){ const a = VENDITE.link.autore_amazon_it; return a && !/\{/.test(a) ? a : AUTORE_AMAZON; }
function reviewUrl(){ const r = VENDITE.link.recensione_vol1; return r && !/\{/.test(r) ? r : BUY; }
function vol2Out(){ return !!VENDITE.interruttori.vol2_uscito && !!VENDITE.link.vol2; }

/* le risposte della Stanza sull'acquisto: testo onesto e un link vero, non un indirizzo da copiare */
if (TEMI.acquisto){ TEMI.acquisto.q = VENDITE.stanza.acquisto_q.slice(); TEMI.acquisto.r = []; TEMI.acquisto.solo = true; TEMI.acquisto.w = 2; }
VOLUMI.I.stato = 'Disponibile. <button type="button" class="link" data-sheet="libro">Il libro</button>';
VOLUMI.II.stato = vol2Out() ? 'Disponibile. <a class="link" href="' + VENDITE.link.vol2 + '" target="_blank" rel="noopener">Il Volume II su Amazon</a>'
  : 'In uscita. Il vuoto smette di essere una liberazione e diventa una prova. <button type="button" class="link" data-sheet="vol2">Avvisami quando esce</button>';

function sellLink(testo, azione, punto){
  if (azione === "amazon") return el("a",{class:"link",href:buyUrl(punto),target:"_blank",rel:"noopener","data-punto":punto||"amazon"},testo);
  if (azione === "instagram") return el("a",{class:"link",href:igUrl(),target:"_blank",rel:"noopener"},testo);
  if (azione === "recensione") return el("a",{class:"link",href:reviewUrl(),target:"_blank",rel:"noopener"},testo);
  if (azione === "segui_amazon") return el("a",{class:"link",href:seguiUrl(),target:"_blank",rel:"noopener"},testo);
  if (azione && azione.startsWith("apri:")) return el("button",{type:"button",class:"link",onclick:()=>openSheet(azione.slice(5))},testo);
  return el("span",{},testo);
}
function sellBtn(testo, azione, punto){ const a = sellLink(testo, azione, punto); a.className = "btn ghost"; return a; }

/* riga sotto la risposta della Stanza, solo per chi chiede del libro, del regalo o del seguito */
function sellRowFor(text, tema){
  if (noSell) return null;
  const t = norm(text), hit = k => tema === k || (TEMI[k] && TEMI[k].k.some(x=>t.includes(" " + norm(x).trim())));
  const map = VENDITE.stanza.link_sotto_risposta;
  if (hit("acquisto")) return hasVol1() ? sellLink(VENDITE.ce_lho.riga_breve.link, "recensione") : sellLink(map.acquisto.testo, map.acquisto.azione, map.acquisto.punto);
  if (hit("regalo")) return sellLink(map.regalo.testo, map.regalo.azione);
  if (hit("seguito")) return vol2Out() ? sellLink("Il Volume II su Amazon","amazon","vol2-uscito") : sellLink(map.seguito.testo, map.seguito.azione);
  if (hit("bianco") || hit("perche")) return sellLink("Il libro","apri:libro");
  return null;
}

/* il blocco dopo il risultato del Test */
function testSellBlock(a, page){
  if (noSell) return null;
  const T = VENDITE.test, v2 = a.volume === "II", pagina = page + 1, resto = 150 - pagina;
  const box = el("div",{class:"sell"});
  if (hasVol1()){
    box.append(el("p",{class:"sub"}, VENDITE.ce_lho.riga_breve.testo), el("div",{class:"tools"}, sellLink(VENDITE.ce_lho.riga_breve.link,"recensione")));
    return box;
  }
  const B = v2 ? T.vol_II : T.vol_I;
  const frase = (!v2 && resto === 0) ? "Sei a pagina 150 di 150: il silenzio è al 100%. Nel Volume I ci arrivi pagina dopo pagina." : B.frase.replace("{pagina}", pagina).replace("{resto}", resto).replace("{nome}", a.nome);
  box.append(el("p",{class:"sell-frase"}, frase),
             el("div",{class:"acts"}, sellBtn(B.bottone.testo, B.bottone.azione, B.bottone.punto)),
             el("div",{class:"tools"}, ...B.link.map(l=>sellLink(l.testo, l.azione))));
  return box;
}

/* i traguardi di Oggi (7 e 30 giorni in tutto), una volta ciascuno */
function oggiSellLine(tot){
  if (noSell || hasVol1()) return null;
  const tr = VENDITE.oggi.traguardi[String(tot)]; if (!tr) return null;
  const seen = store.get("oggi_traguardi_visti", []); if (seen.includes(tot)) return null;
  store.set("oggi_traguardi_visti", seen.concat(tot));
  return el("div",{class:"sell"}, el("p",{class:"sub"}, tr.frase), el("div",{class:"tools"}, sellLink(tr.link, tr.azione, tr.punto)));
}

/* la riga a fine gioco, per il game designer: api.sellLine(idGioco, volumeFrase) */
function gameSellLine(id, vol){
  if (noSell) return null;
  const G = VENDITE.giochi; let g = G[id] || (id==="togli" ? G[vol==="II"?"togli_v2":"togli_v1"] : null); if (!g) return null;
  if (g.se_vol2_uscito && vol2Out()) g = Object.assign({}, g, g.se_vol2_uscito);
  if (g.azione === "amazon" && hasVol1()) return el("div",{class:"sell"}, el("p",{class:"sub"}, VENDITE.ce_lho.riga_breve.testo), el("div",{class:"tools"}, sellLink(VENDITE.ce_lho.riga_breve.link,"recensione")));
  return el("div",{class:"sell"}, el("p",{class:"sub"}, g.frase), el("div",{class:"tools"}, sellLink(g.link, g.azione, g.punto)));
}

/* i fogli: Il libro, Da regalare, Ce l'ho già, Volume II */
let sheetReturn = null;
/* ====================== UNA PAGINA DEL LIBRO, UNA STANZA ======================
   Chi ha il Volume I sceglie una pagina (1-150) e riceve un esercizio da scriverci sopra.
   Sempre lo stesso per la stessa pagina, per tutti: così due lettori possono confrontarsi. */
function paginaEsercizio(n){
  const pool = [...(STANZE.I||[]), ...(STANZE.II||[])];
  return pool.length ? pool[(n * 37 + 11) % pool.length] : "Scrivi una frase sola. Poi lascia bianco il resto.";
}
function paginaBlock(start){
  const inp = el("input",{type:"number",min:"1",max:"150",inputmode:"numeric",class:"note",style:"max-width:7em","aria-label":"Numero di pagina, da 1 a 150"});
  inp.value = String(start || store.get("ce_pagina", 73));
  const out = el("div",{class:"g-quote"}), meter = el("p",{class:"eyebrow"});
  const draw = ()=>{ const n = Math.max(1, Math.min(150, parseInt(inp.value,10) || 1)); store.set("ce_pagina", n);
    meter.textContent = `Pagina ${n} · ${fmt(silOfPage(n))}`;
    out.replaceChildren(el("p",{}, paginaEsercizio(n)), el("cite",{},"Scrivilo a penna su quella pagina. Il libro lo finisce chi lo legge.")); };
  inp.oninput = draw; draw();
  return el("div",{class:"g-stage"}, el("label",{class:"eyebrow"},"Apri il Volume I a una pagina qualsiasi. Che numero è?"), inp, meter, out,
    el("div",{class:"acts"},
      el("button",{type:"button",class:"btn ghost",onclick:()=>{ const n = parseInt(inp.value,10)||1; shareLink(`Pagina ${n} del Vuoto: «${paginaEsercizio(n)}»\nE la tua pagina? ${PAGE_URL}#pagina\n#ilvuoto`, out); track("pagina-esercizio"); }}, SHARE_LBL),
      el("button",{type:"button",class:"btn ghost",onclick:()=>{ const n = parseInt(inp.value,10)||1; saveCard({format:"story", eyebrow:`Pagina ${n} del Vuoto · ${fmt(silOfPage(n))}`, main:paginaEsercizio(n), sub:"Scritto a penna, sul libro.", meter:fmt(silOfPage(n))}, "il-vuoto-pagina"); }},"Storia")));
}

function openSheet(kind){
  sheetReturn = document.activeElement; VOICE.stop();
  const box = $("#sheet-in"); box.replaceChildren();
  const head = (eyebrow)=> el("div",{class:"row"}, el("span",{class:"eyebrow"}, eyebrow), el("button",{type:"button",class:"btn ghost",onclick:closeSheet},"Chiudi"));
  const S = VENDITE;
  if (kind === "libro"){
    const L = S.scheda_libro;
    box.append(head(L.eyebrow), el("h2",{class:"huge",id:"sheet-title"}, L.titolo),
      el("img",{class:"book-photo",src:"libro.jpg",alt:"Il Volume I, IL VUOTO di Antonio Flamini: copertina bianca, appoggiato su un tavolo di legno",width:"900",height:"807",loading:"lazy",decoding:"async"}),
      el("p",{class:"big"}, L.dentro),
      el("p",{class:"sell-quote"}, "«" + L.citazione + "»"),
      el("dl",{class:"info-list"}, el("dt",{},"Per chi è"), el("dd",{},L.per_chi), el("dt",{},"Per chi non è"), el("dd",{},L.per_chi_non)),
      el("p",{class:"big"}, L.ironia),
      hasVol1() ? el("div",{class:"sell"}, el("p",{class:"sub"}, VENDITE.ce_lho.riga_breve.testo), el("div",{class:"acts"}, sellBtn(VENDITE.ce_lho.riga_breve.link,"recensione"), sellBtn(L.bottoni[1].testo, L.bottoni[1].azione)))
        : el("div",{class:"acts"}, sellBtn(L.bottoni[0].testo,"amazon",L.bottoni[0].punto), sellBtn(L.bottoni[1].testo, L.bottoni[1].azione)),
      hasVol1() ? el("span",{}) : el("div",{class:"tools"}, ...L.link.map(l=>sellLink(l.testo,l.azione))),
      el("p",{class:"sub"}, L.collana));
  }
  if (kind === "regalo"){
    const R = S.regalo;
    box.append(head(R.eyebrow), el("h2",{class:"huge",id:"sheet-title"}, R.titolo), el("p",{class:"big"}, R.testo),
      el("ol",{class:"sell-steps"}, ...R.passi.map(p=>el("li",{},p))),
      el("div",{class:"acts"}, sellBtn(R.bottoni[0].testo,"amazon",R.bottoni[0].punto),
        el("button",{type:"button",class:"btn ghost",onclick:()=>{ const b=R.biglietto; saveCard({format:b.format, eyebrow:b.eyebrow, title:b.title, main:b.main, sub:b.sub, meter:b.meter}, b.file); }}, R.bottoni[1].testo)),
      el("p",{class:"sub"}, R.vol3));
  }
  if (kind === "ce_lho"){
    const C = S.ce_lho;
    const n = el("input",{type:"number",id:"ce-pagina",min:"1",max:"150",value:String(store.get("ce_pagina",73)),class:"note",style:"max-width:7em"});
    const cap = ()=> C.foto.didascalia.replace("{n}", Math.max(1,Math.min(150, parseInt(n.value)||1)));
    n.oninput = ()=> store.set("ce_pagina", n.value);
    box.append(head(C.eyebrow), el("h2",{class:"huge",id:"sheet-title"}, C.titolo), el("p",{class:"big"}, C.intro),
      el("h3",{class:"info-h"},"Una pagina, una stanza"), paginaBlock(),
      el("h3",{class:"info-h"},"Una recensione"), el("p",{}, C.recensione.testo), el("div",{class:"acts"}, sellBtn(C.recensione.bottone.testo,"recensione")),
      el("h3",{class:"info-h"},"Una foto"), el("p",{}, C.foto.testo),
      el("label",{for:"ce-pagina",class:"eyebrow"}, C.foto.campo_pagina.etichetta), n,
      el("div",{class:"acts"}, el("button",{type:"button",class:"btn ghost",onclick:()=>copyText(cap(), box)}, C.foto.bottoni[0].testo), sellBtn(C.foto.bottoni[1].testo,"instagram")),
      el("div",{class:"tools"}, el("button",{type:"button",class:"link",onclick:()=>{ store.set("ha_volume_I", false); closeSheet(); toast("Va bene. Quando vuoi, il libro è qui."); }}, C.annulla)));
  }
  if (kind === "pagina"){
    box.append(head("Per chi ha il Volume I"), el("h2",{class:"huge",id:"sheet-title"},"Una pagina, una stanza."),
      el("p",{class:"big"},"Ogni pagina del libro ha il suo esercizio. Uguale per tutti: se un amico apre la stessa pagina, scrive la stessa cosa a modo suo."),
      paginaBlock(),
      el("div",{class:"tools"}, sellLink("Non ce l'ho ancora: il Volume I su Amazon","amazon","pagina")));
  }
  if (kind === "vol2"){
    const V = S.vol2;
    box.append(head(V.eyebrow), el("h2",{class:"huge",id:"sheet-title"}, "La Struttura"), el("p",{class:"big"}, V.testo));
    if (vol2Out()){ box.append(el("div",{class:"acts"}, el("a",{class:"btn ghost",href:VENDITE.link.vol2,target:"_blank",rel:"noopener"}, V.uscito.bottone.testo))); }
    else {
      const waiting = store.get("attesa_vol2", false);
      const rem = el("button",{type:"button",class:"btn ghost",onclick:()=>{ store.set("attesa_vol2", true); rem.disabled = true; rem.textContent = V.ricordamelo.conferma; }}, waiting ? V.ricordamelo.conferma : V.ricordamelo.testo);
      if (waiting) rem.disabled = true;
      box.append(el("p",{}, V.intro_avviso),
        el("div",{class:"acts"}, sellBtn(V.bottoni[0].testo,"segui_amazon"), sellBtn(V.bottoni[1].testo,"instagram"), rem),
        el("p",{class:"sub"}, V.bottoni[0].nota + " Instagram: " + V.bottoni[1].nota + "."));
    }
    box.append(el("div",{class:"tools"}, sellLink("Intanto, il Volume I","apri:libro")));
  }
  if (kind === "ce_lho") box.querySelectorAll("a.btn, .acts button").forEach(b=>b.addEventListener("click",()=>store.set("ha_volume_I", true)));   // segnato solo con un gesto vero
  const d = $("#sheet"); d.hidden = false; d.scrollTop = 0; d.querySelector(".btn.ghost").focus();
}
function closeSheet(){
  $("#sheet").hidden = true; if (presence) presence.wake();
  // aggiorna il blocco sotto il risultato del Test (per esempio dopo "Ce l'ho già")
  const old = document.querySelector("#test .sell");
  if (old && lastResult){ const a = ARCH[lastResult.k]; const nb = testSellBlock(a, lastResult.page); nb ? old.replaceWith(nb) : old.remove(); }
  if (sheetReturn && sheetReturn.isConnected && sheetReturn.focus) sheetReturn.focus();
}
document.addEventListener("click", e=>{ const b = e.target.closest("[data-sheet]"); if (b){ e.preventDefault(); openSheet(b.dataset.sheet); } });
addEventListener("keydown", e=>{ if (e.key==="Escape" && !$("#sheet").hidden) closeSheet(); });
/* chi torna dopo l'uscita del Volume II e aveva chiesto di essere avvisato */
if (vol2Out() && store.get("attesa_vol2", false)){ setTimeout(()=>{ toast(VENDITE.vol2.uscito.riga_ritorno); store.set("attesa_vol2", false); }, 1500); }

/* ======================================================================
   GIOCHI — La Stanza · IL VUOTO
   Modulo autonomo: nessun import, nessuna libreria, nessun server.
   Uso: renderGiochi(box, api [, idIniziale]) → { open(id), list(), stop() }
   api: el, saveCard, copyText, toast, store, pageUrl, buyUrl, presence, reduced, goRoom
   Le frasi tra « » sono prese alla lettera da v1.txt / v2.txt (una frase ciascuna).
   ====================================================================== */

const GIOCHI = [
  { id: "pezzo", token: "gioco1", nome: "Il pezzo che non entra", durata: "un minuto circa",
    riga: "Un puzzle da nove. Otto pezzi entrano.",
    istruzioni: "Tocca un pezzo, poi il posto dove va." },
  { id: "bicchiere", token: "gioco2", nome: "Il bicchiere", durata: "fino a 30 secondi",
    riga: "Tieni premuto. Il bicchiere pesa sempre uguale.",
    istruzioni: "Tieni premuto il pulsante per tenere il bicchiere. Lascia quando vuoi." },
  { id: "togli", token: "gioco3", nome: "Togli", durata: "30 secondi circa",
    riga: "Una frase sommersa dal rumore. Togli finché resta il senso.",
    istruzioni: "Tocca le parole che non servono. Se togli quella sbagliata, resta il buco: toccalo per rimetterla." },
  { id: "cage", token: "gioco4", nome: "4’33”", durata: "33 secondi, se ci riesci",
    riga: "La versione breve. Resta fermo.",
    istruzioni: "John Cage chiedeva quattro minuti e trentatré secondi. Qui ne bastano 33. Ogni tocco, tasto o scroll azzera il conteggio." }
];

const G_FONTI = {
  v1: "IL VUOTO · Volume I",
  v2: "IL VUOTO · Volume II, La Struttura (in uscita)"
};

/* Riga di vendita a fine gioco: concordata con l'agente vendite (LOG 09:10 e 09:40, vendite.md → vendite.giochi).
   Segue il volume da cui viene la frase. Vol. I → Amazon; Vol. II (non ancora uscito) → Instagram, finché vol2 non esce.
   Solo a gioco riuscito, mai su interruzione o resa. Se il visitatore ha detto "Ce l'ho già" → riga recensione. */
const G_LIBRO = {
  pezzo:     { frase: "Un disegno con un pezzo lasciato fuori: è il Volume I, 150 pagine quasi bianche.", link: "Il Volume I su Amazon", vol: 1, punto: "gioco-pezzo" },
  bicchiere: { frase: "Di chi era quel bicchiere? Se ne parla nel Volume II, La Struttura, che non è ancora uscito.", link: "Ti avviso su Instagram", vol: 2 },
  togli_v1:  { frase: "Il libro da cui viene questa frase fa la stessa cosa, per 150 pagine.", link: "Il Volume I su Amazon", vol: 1, punto: "gioco-togli" },
  togli_v2:  { frase: "Di questa frase si parla nel Volume II, La Struttura. Non è ancora uscito.", link: "Ti avviso su Instagram", vol: 2 },
  cage:      { frase: "«Il silenzio non è passivo» è una frase del Volume II, La Struttura. Non è ancora uscito.", link: "Ti avviso su Instagram", vol: 2 }
};
const G_CE_LHO = { frase: "Ce l'hai già: a che pagina sei arrivato a scriverci dentro?", link: "Lascia una recensione" };
const G_INSTAGRAM = "https://www.instagram.com/antonio_flamini/";

function renderGiochi(box, api, startId) {
  const el = api.el;
  const R = !!api.reduced;
  const P = (m, ...a) => { try { const p = api.presence; if (p && typeof p[m] === "function") p[m](...a); } catch (e) {} };
  const pct = n => Math.max(0, Math.min(100, n)).toFixed(2).replace(".", ",");
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const plural = (n, uno, molti) => n === 1 ? uno : molti;
  let stopCurrent = null;
  const opt = (v, ...a) => { try { return typeof v === "function" ? v(...a) : v; } catch (e) { return undefined; } };
  const buy = punto => opt(api.buyUrl, punto) || "https://www.amazon.it/dp/B0H2P38RJP";
  function rigaLibro(chiave) {
    if (opt(api.salesOff)) return null;                       // es. dopo un testo di crisi
    const v = G_LIBRO[chiave]; if (!v) return null;
    let frase = v.frase, testo = v.link, href;
    if (v.vol === 1) {
      if (api.store.get("ha_volume_I", false)) { frase = G_CE_LHO.frase; testo = G_CE_LHO.link; href = opt(api.reviewUrl) || buy(v.punto); }
      else href = buy(v.punto);
    } else if (opt(api.vol2Uscito) && opt(api.vol2Url)) { testo = "Il Volume II su Amazon"; href = opt(api.vol2Url); }
    else href = opt(api.instagramUrl) || G_INSTAGRAM;
    return el("p", { class: "g-libro" }, frase + " ", el("a", { class: "link", href, target: "_blank", rel: "noopener" }, testo));
  }

  function stop() { if (stopCurrent) { try { stopCurrent(); } catch (e) {} stopCurrent = null; } AMBIENT.stop(true); P("set", "idle"); }

  function record(id, res) {
    const all = api.store.get("giochi", {}) || {};
    const prev = all[id] || { volte: 0 };
    all[id] = { volte: (prev.volte || 0) + 1, ultimo: res };
    api.store.set("giochi", all);
  }

  function frame(g) {
    box.textContent = "";
    const i = GIOCHI.indexOf(g);
    const head = el("div", { class: "g-head" },
      el("span", { class: "eyebrow" }, "Gioco " + (i + 1) + " di " + GIOCHI.length + " · " + g.durata),
      el("button", { class: "link", type: "button", onclick: () => list() }, "Tutti i giochi"));
    const title = el("h2", { class: "big g-title" }, g.nome);
    const how = el("p", { class: "sub g-how" }, g.istruzioni);
    const stage = el("div", { class: "g-stage" });
    const root = el("div", { class: "g-wrap g-game", "data-gioco": g.id }, head, title, how, stage);
    box.append(root);
    const top = box.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.6) box.scrollIntoView({ block: "start" });
    return { root, stage, how };
  }

  /* ---------- schermata finale comune ---------- */
  function fine(g, stage, r) {
    record(g.id, r.title);
    P("set", "speak"); P("kick", .6);
    setTimeout(() => P("set", "idle"), 2400);
    const i = GIOCHI.indexOf(g), next = GIOCHI[(i + 1) % GIOCHI.length];
    const link = api.pageUrl + "#" + g.token;
    const share = r.share + "\n«" + r.quote + "»\n— " + G_FONTI[r.fonte] + " · Antonio Flamini\nGioca anche tu: " + link + " · #ilvuoto";
    const spec = f => ({ format: f, eyebrow: "Giochi · " + g.nome, title: r.title, main: "«" + r.quote + "»", sub: r.sub, meter: r.meter });
    const host = el("div", { class: "g-copyhost" });
    stage.textContent = "";
    const end = el("div", { class: "g-end", role: "status" },
      el("p", { class: "eyebrow" }, "Risultato"),
      el("p", { class: "huge g-result" }, r.title),
      el("p", { class: "g-insight" }, r.insight),
      el("blockquote", { class: "g-quote" },
        el("p", {}, "«" + r.quote + "»"),
        el("cite", {}, G_FONTI[r.fonte])),
      el("p", { class: "counter g-meter" }, r.meter),
      el("div", { class: "acts" },
        el("button", { class: "btn primary", type: "button", onclick: () => api.copyText(share, host) }, "Copia il risultato"),
        el("button", { class: "btn ghost", type: "button", onclick: () => api.saveCard(spec("post"), "ilvuoto-" + g.id) }, "Salva post"),
        el("button", { class: "btn ghost", type: "button", onclick: () => api.saveCard(spec("story"), "ilvuoto-" + g.id) }, "Salva storia")),
      host,
      el("div", { class: "tools" },
        el("button", { class: "link", type: "button", onclick: () => open(g.id) }, r.riuscito === false ? "Riprova" : "Rigioca"),
        el("button", { class: "link", type: "button", onclick: () => open(next.id) }, "Prossimo: " + next.nome),
        el("button", { class: "link", type: "button", onclick: () => list() }, "Tutti i giochi")));
    const riga = r.riuscito === false ? null : rigaLibro(r.libro || g.id);
    if (riga) end.insertBefore(riga, end.querySelector(".tools"));
    stage.append(end);
    const gh = stage.closest(".g-game"); if (gh) { const h = gh.querySelector(".g-how"); if (h) h.hidden = true; }
    const first = end.querySelector(".btn.primary"); if (first) first.focus({ preventScroll: true });
  }

  /* ======================= 1. IL PEZZO CHE NON ENTRA ======================= */
  function pezzo(g, stage, how) {
    const IMG = '<circle cx="150" cy="150" r="104" class="g-ink"/>' +
      '<line x1="-10" y1="212" x2="310" y2="212" class="g-ink"/>' +
      '<circle cx="236" cy="60" r="15" class="g-fill"/>' +
      '<circle cx="150" cy="150" r="9" class="g-fill"/>' +
      '<path d="M40 40 L78 40" class="g-ink"/>';
    const tile = k => { const r = Math.floor(k / 3), c = k % 3;
      return '<svg viewBox="' + (c * 100) + ' ' + (r * 100) + ' 100 100" aria-hidden="true" focusable="false">' + IMG + '</svg>'; };
    // il pezzo che non entra: linguette su tutti i lati, un altro disegno
    const ODD = '<svg viewBox="-22 -22 144 144" aria-hidden="true" focusable="false">' +
      '<path class="g-ink g-odd-edge" d="M0 0 H38 C38 -20 62 -20 62 0 H100 V38 C120 38 120 62 100 62 V100 H62 C62 120 38 120 38 100 H0 V62 C-20 62 -20 38 0 38 Z"/>' +
      '<path class="g-ink" d="M12 88 L88 12 M12 58 L58 12 M42 88 L88 42"/></svg>';

    const holeAt = Math.floor(Math.random() * 9);
    const placed = new Set();
    let sel = null, tries = 0, out = false, t0 = 0, done = false;
    const status = el("p", { class: "sub g-status", "aria-live": "polite" }, "Pezzi: 0 di 8");
    const board = el("div", { class: "g-board", role: "group", "aria-label": "Il puzzle" });
    const tray = el("div", { class: "g-tray", role: "group", "aria-label": "I pezzi" });
    const leave = el("button", { class: "btn ghost g-leave", type: "button", hidden: "" }, "Lascialo fuori");
    const scatola = el("p", { class: "counter g-box", hidden: "" }, "Nella scatola: 1 pezzo");
    const slots = [];
    const msgOdd = ["Non entra.", "Non entra nemmeno girato.", "Il problema non è l'angolazione.", "Puoi continuare. Molti lo fanno per anni.", "Il pezzo non è cambiato. Il disegno nemmeno."];

    for (let k = 0; k < 9; k++) {
      const r = Math.floor(k / 3) + 1, c = k % 3 + 1;
      const s = el("button", { class: "g-slot", type: "button", "aria-label": "Riga " + r + ", colonna " + c + ", vuoto" });
      s.onclick = () => drop(k);
      slots.push(s); board.append(s);
    }
    const pieces = [];
    for (let k = 0; k < 9; k++) if (k !== holeAt) pieces.push({ k, odd: false });
    pieces.push({ k: -1, odd: true });
    shuffle(pieces);
    let n = 0;
    for (const p of pieces) {
      n++;
      const b = el("button", { class: "g-piece" + (p.odd ? " g-odd" : ""), type: "button", "aria-pressed": "false", "aria-label": "Pezzo " + n });
      b.innerHTML = p.odd ? ODD : tile(p.k);
      p.b = b; p.rot = 0;
      b.onclick = () => choose(p);
      tray.append(b);
    }
    leave.onclick = () => {
      const odd = pieces.find(p => p.odd);
      out = true; odd.b.remove(); leave.hidden = true; scatola.hidden = false;
      if (sel === odd) sel = null;
      P("hush");
      if (placed.size === 8) finish(); else say("Fuori. Restano " + (8 - placed.size) + " pezzi da mettere.");
    };
    stage.append(status, board, tray, el("div", { class: "acts g-row" }, leave, scatola));

    function say(t) { status.textContent = t; }
    function start() { if (!t0) { t0 = performance.now(); P("set", "listen"); } }
    function choose(p) {
      if (done) return; start();
      if (sel) sel.b.setAttribute("aria-pressed", "false");
      sel = sel === p ? null : p;
      if (sel) { sel.b.setAttribute("aria-pressed", "true"); say(p.odd ? "Questo è un po' diverso. Prova lo stesso." : "Ora tocca il suo posto."); }
      P("kick", .15);
    }
    function drop(k) {
      if (done) return;
      if (placed.has(k)) { say("Lì c'è già un pezzo."); return; }
      if (!sel) { say("Prima scegli un pezzo."); return; }
      const p = sel, s = slots[k];
      if (p.odd) {
        tries++;
        p.rot = (p.rot + 90) % 360; p.b.style.setProperty("--g-rot", p.rot + "deg");
        flash(s); flash(p.b);
        say(msgOdd[Math.min(tries - 1, msgOdd.length - 1)]);
        if (!out) leave.hidden = false;
        P("kick", .5); P("fire");
        return;
      }
      if (p.k !== k) { flash(s); say("Non è il suo posto."); P("kick", .2); return; }
      s.innerHTML = tile(k); s.classList.add("g-full"); s.disabled = true;
      s.setAttribute("aria-label", "Riga " + (Math.floor(k / 3) + 1) + ", colonna " + (k % 3 + 1) + ", pieno");
      p.b.remove(); sel = null; placed.add(k);
      P("kick", .3);
      if (placed.size === 8) {
        if (out) return finish();
        slots[holeAt].classList.add("g-wait");
        leave.hidden = false;
        say("Manca un posto. Ti resta un pezzo.");
      } else say("Pezzi: " + placed.size + " di 8");
    }
    function flash(x) { x.classList.remove("g-no"); void x.offsetWidth; x.classList.add("g-no"); }
    function finish() {
      done = true;
      const sec = Math.round((performance.now() - t0) / 1000);
      slots[holeAt].classList.add("g-hole"); slots[holeAt].disabled = true;
      setTimeout(() => fine(g, stage, {
        title: tries === 0 ? "Nemmeno provato." : "Fuori dopo " + tries + " " + plural(tries, "tentativo.", "tentativi."),
        insight: tries === 0 ? "Hai visto subito che non era il suo posto. Di solito ci vogliono anni." : "Il disegno resta con un buco. Il buco non è un problema tuo.",
        quote: "Oggi, finalmente, ho smesso di incastrarmi.", fonte: "v1",
        sub: "Il disegno resta con un buco.",
        meter: "Tentativi di incastro: " + tries + " · " + sec + " s",
        share: tries === 0 ? "Ho lasciato fuori l'ultimo pezzo senza nemmeno provarci." : "Ho provato a incastrare l'ultimo pezzo " + tries + " " + plural(tries, "volta", "volte") + ". Poi l'ho lasciato fuori."
      }), R ? 0 : 700);
    }
    return () => { done = true; };
  }

  /* ======================= 2. IL BICCHIERE ======================= */
  function bicchiere(g, stage) {
    const GRAMMI = 250, MAX_S = 31;           // 31 secondi veri ≈ una settimana
    const simMin = t => 60 * Math.pow(t, 1.5); // minuti "tenuti"
    const durata = m => {
      if (m < 1) return "0 minuti";
      if (m < 60) return Math.round(m) + " minuti";
      const h = Math.floor(m / 60);
      if (h < 24) return h + " " + plural(h, "ora", "ore");
      const d = Math.floor(h / 24), hh = h % 24;
      return d + " " + plural(d, "giorno", "giorni") + (hh ? " e " + hh + " " + plural(hh, "ora", "ore") : "");
    };
    const peso = m => GRAMMI * (1 + (m / 60) * 0.15);
    const kg = gr => gr < 1000 ? Math.round(gr) + " g" : (gr / 1000).toFixed(1).replace(".", ",") + " kg";
    const fasi = [[0, "Per ora niente."], [60, "Il braccio comincia a farsi sentire."], [360, "Il peso non è cambiato. Tu sì."],
      [1440, "Nessuno ti ha chiesto di tenerlo così a lungo."], [4320, "Qualcuno passa e ti dice che sei forte."], [7200, "Il braccio sta per decidere al posto tuo."]];

    const svg = el("div", { class: "g-glass", "aria-hidden": "true" });
    svg.innerHTML = '<svg viewBox="0 0 200 230">' +
      '<line x1="10" y1="222" x2="190" y2="222" class="g-ink g-table"/>' +
      '<g class="g-cup"><path d="M68 92 L132 92 L124 220 L76 220 Z" class="g-ink"/>' +
      '<path d="M71.5 134 L128.5 134 L124 216 L76 216 Z" class="g-water"/></g></svg>';
    const cup = svg.querySelector(".g-cup");
    const tempo = el("p", { class: "counter g-big-mono" }, "Tenuto per: 0 minuti");
    const pesa = el("p", { class: "counter" }, "Pesa: 250 g · ti sembra: 250 g");
    const voce = el("p", { class: "g-line", "aria-live": "polite" }, "Il bicchiere è sul tavolo.");
    const hold = el("button", { class: "btn primary g-hold", type: "button", "aria-label": "Tieni premuto per tenere il bicchiere" }, "Tieni premuto");
    stage.append(el("div",{class:"g-glassrow"}, svg, hold), tempo, pesa, voce, soundToggle());

    let holding = false, t0 = 0, raf = 0, done = false, faseI = -1, lastM = 0;
    const lift = (f, now) => {
      const y = holding ? -70 + f * 52 : 0;
      const j = holding && !R ? (Math.sin(now / 37) + Math.sin(now / 23)) * f * 2.6 : 0;
      const rot = holding && !R ? Math.sin(now / 53) * f * 2.2 : 0;
      cup.setAttribute("transform", "translate(" + j.toFixed(2) + " " + y.toFixed(2) + ") rotate(" + rot.toFixed(2) + " 100 156)");
    };
    function tick(now) {
      const t = (now - t0) / 1000, m = simMin(t); lastM = m;
      const f = Math.min(1, t / MAX_S);
      tempo.textContent = "Tenuto per: " + durata(m);
      pesa.textContent = "Pesa: " + GRAMMI + " g · ti sembra: " + kg(peso(m));
      let fi = 0; for (let i = 0; i < fasi.length; i++) if (m >= fasi[i][0]) fi = i;
      if (fi !== faseI) { faseI = fi; voce.textContent = fasi[fi][1]; P("kick", .3 + fi * .1); }
      if (!R && f > .2 && Math.random() < f * .08) P("fire");
      lift(f, now);
      if (t >= MAX_S) { release(true); return; }
      raf = requestAnimationFrame(tick);
    }
    function press(e) {
      if (done || holding) return;
      if (e && e.pointerId != null) { try { hold.setPointerCapture(e.pointerId); } catch (x) {} }
      holding = true; t0 = performance.now(); faseI = -1;
      hold.textContent = "Lo stai tenendo"; hold.classList.add("g-on");
      P("set", "listen"); AMBIENT.start("pioggia");
      raf = requestAnimationFrame(tick);
    }
    function release(forzato) {
      if (!holding || done) return;
      holding = false; cancelAnimationFrame(raf); AMBIENT.stop();
      const t = (performance.now() - t0) / 1000;
      lift(0, 0);
      hold.classList.remove("g-on");
      if (!forzato && t < 0.6) { hold.textContent = "Tieni premuto"; voce.textContent = "Così non l'hai neanche sollevato. Tienilo premuto."; return; }
      done = true; hold.remove();
      voce.textContent = forzato ? "Il braccio ha deciso per te. Il bicchiere è sul tavolo." : "Posato. Il tavolo non si è lamentato.";
      P("hush");
      domanda(lastM, !!forzato);
    }
    hold.addEventListener("pointerdown", e => { e.preventDefault(); press(e); });
    hold.addEventListener("pointerup", () => release(false));
    hold.addEventListener("pointercancel", () => release(false));
    hold.addEventListener("lostpointercapture", () => release(false));
    hold.addEventListener("contextmenu", e => e.preventDefault());
    hold.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); press(); } });
    hold.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); release(false); } });
    hold.addEventListener("click", e => e.preventDefault());
    const onBlur = () => release(false);
    addEventListener("blur", onBlur);

    function domanda(m, forzato) {
      const tenuto = durata(m);
      const q = el("div", { class: "g-ask" },
        el("p", { class: "big" }, "Di chi era?"),
        el("div", { class: "acts" }));
      const risposte = [
        ["Mio", "Allora potevi posarlo quando volevi. Lo sapevi anche prima."],
        ["Me l'hanno dato", "E l'hai tenuto per educazione. Il braccio non era d'accordo."],
        ["Non me lo ricordo", "È il caso più frequente: si tiene per abitudine quello che nessuno ricorda di aver dato."]
      ];
      for (const [a, b] of risposte) q.lastChild.append(el("button", { class: "btn ghost", type: "button", onclick: () => {
        fine(g, stage, {
          title: (forzato ? "Caduto dopo " : "Posato dopo ") + tenuto + ".",
          insight: b,
          quote: "Il peso è sempre lo stesso; cambia il tempo per cui lo trattieni.", fonte: "v2",
          sub: "Di chi era? " + a + ".",
          meter: "Peso reale: " + GRAMMI + " g · percepito: " + kg(peso(m)),
          share: "Ho tenuto in mano un bicchiere d'acqua per " + tenuto + (forzato ? ", finché il braccio non ha deciso per me." : ", poi l'ho posato.") + " Di chi era? " + a + "."
        });
      } }, a));
      stage.append(q);
      const b0 = q.querySelector(".btn"); if (b0) b0.focus({ preventScroll: true });
    }
    return () => { done = true; holding = false; cancelAnimationFrame(raf); removeEventListener("blur", onBlur); AMBIENT.stop(true); };
  }

  /* ======================= 3. TOGLI ======================= */
  const TOGLI_FRASI = [
    { t: "Ho passato la vita a cercare di essere il pezzo mancante nel puzzle degli altri.", fonte: "v1" },
    { t: "Togliere il superfluo non è perdita.", fonte: "v2" },
    { t: "Un giorno, semplicemente, smetti di fare pressione.", fonte: "v2" },
    { t: "Se togli il cibo, la lotta perde significato.", fonte: "v2" }
  ];
  const RUMORE = ["praticamente", "cioè", "tipo", "assolutamente", "sinceramente", "letteralmente", "diciamo", "insomma",
    "comunque", "in realtà", "boh", "vabbè", "ok", "super", "ovviamente", "tantissimo", "#mindset", "#goals", "(notifica)",
    "ehm", "allora", "magari", "fondamentalmente", "a livello di", "onestamente", "ti dirò", "nel senso", "top", "raga",
    "stories", "spunta blu", "ci sentiamo", "urgente", "asap", "giusto per", "a prescindere", "focus"];

  function togli(g, stage) {
    const n = api.store.get("giochi-togli-i", 0) || 0;
    const F = TOGLI_FRASI[n % TOGLI_FRASI.length];
    api.store.set("giochi-togli-i", n + 1);
    const core = F.t.split(" ");
    const nNoise = Math.min(24, Math.max(14, Math.round(core.length * 1.6)));
    const gaps = Array.from({ length: core.length + 1 }, () => []);
    const pool = shuffle(RUMORE.slice());
    for (let i = 0; i < nNoise; i++) gaps[Math.floor(Math.random() * gaps.length)].push(pool[i % pool.length]);
    if (gaps[0].length === 0 && gaps[1].length === 0) gaps[1].push(pool[nNoise % pool.length]);
    const words = [];
    gaps.forEach((gp, i) => { for (const w of gp) words.push({ w, noise: true }); if (i < core.length) words.push({ w: core[i], noise: false }); });
    const total = words.length, noiseTot = words.filter(x => x.noise).length;

    const counter = el("p", { class: "counter" }, "Silenzio: 0,00%");
    const text = el("p", { class: "g-togli", role: "group", "aria-label": "La frase" });
    const status = el("p", { class: "sub", "aria-live": "polite" }, "Parole: " + total);
    const basta = el("button", { class: "btn ghost", type: "button" }, "Basta così");
    stage.append(counter, text, status, el("div", { class: "acts" }, basta));
    let t0 = 0, removed = 0, holes = 0, noiseLeft = noiseTot, done = false, tocchiSenso = 0;

    for (const x of words) {
      const b = el("button", { class: "g-w", type: "button" }, x.w);
      x.b = b;
      b.onclick = () => tap(x);
      text.append(b, " ");
    }
    function upd() { counter.textContent = "Silenzio: " + pct(removed / total * 100) + "%"; }
    function tap(x) {
      if (done) return;
      if (!t0) { t0 = performance.now(); P("set", "listen"); }
      if (x.noise) {
        removed++; noiseLeft--; P("kick", .2);
        x.b.disabled = true;
        const go = () => { const nx = x.b.nextSibling; if (nx && nx.nodeType === 3) nx.remove(); x.b.remove(); };
        if (R) go(); else { x.b.classList.add("g-gone"); setTimeout(go, 260); }
        status.textContent = noiseLeft ? "Restano " + (total - removed) + " parole." : "";
      } else if (!x.out) {
        x.out = true; removed++; holes++; tocchiSenso++;
        x.b.classList.add("g-hole-w"); x.b.setAttribute("aria-label", "parola tolta, tocca per rimetterla");
        status.textContent = "Questa serviva. Resta il buco: toccalo per rimetterla.";
        P("kick", .5); P("fire");
      } else {
        x.out = false; removed--; holes--;
        x.b.classList.remove("g-hole-w"); x.b.removeAttribute("aria-label");
        status.textContent = "Rimessa.";
      }
      upd();
      if (noiseLeft === 0 && holes === 0) finish();
    }
    basta.onclick = () => { if (!t0) t0 = performance.now(); finish(); };
    function finish() {
      if (done) return; done = true;
      const sec = Math.max(1, Math.round((performance.now() - t0) / 1000));
      const sil = pct(removed / total * 100);
      basta.remove();
      let title, insight, share;
      if (noiseLeft === 0 && holes === 0) {
        title = "Resta il senso.";
        insight = tocchiSenso ? "Hai tolto anche qualcosa che serviva, poi l'hai rimesso. Succede anche agli scultori." : "Hai tolto " + noiseTot + " parole e la frase non se n'è accorta.";
        share = "Ho tolto " + noiseTot + " parole di rumore in " + sec + " secondi. È rimasto questo.";
      } else if (holes > 0 && noiseLeft === 0) {
        title = "Silenzio, ma con buchi.";
        insight = "Hai tolto il rumore e anche " + holes + " " + plural(holes, "parola che serviva", "parole che servivano") + ". Il silenzio non è sparire.";
        share = "Ho tolto tutto il rumore e anche " + holes + " " + plural(holes, "parola che serviva", "parole che servivano") + ". La frase intera era questa.";
      } else {
        title = "Ti sei fermato prima.";
        insight = "Sono rimaste " + noiseLeft + " " + plural(noiseLeft, "parola", "parole") + " di rumore. Ci si affeziona.";
        share = "Ho tolto " + (noiseTot - noiseLeft) + " parole di rumore su " + noiseTot + ". Sotto c'era questo.";
      }
      text.querySelectorAll(".g-w").forEach(b => { b.disabled = true; });
      setTimeout(() => fine(g, stage, {
        title, insight, share, quote: F.t, fonte: F.fonte,
        libro: "togli_" + F.fonte, riuscito: noiseLeft === 0 && holes === 0,
        sub: "Rumore tolto: " + (noiseTot - noiseLeft) + " parole su " + noiseTot + ".",
        meter: "Silenzio: " + sil + "% · " + sec + " s"
      }), R ? 0 : 600);
    }
    return () => { done = true; };
  }

  /* ======================= 4. 4’33” (versione da 33 secondi) ======================= */
  function cage(g, stage) {
    const GOAL = 33;
    const big = el("p", { class: "huge g-clock", "aria-hidden": "true" }, "00:00");
    const counter = el("p", { class: "counter" }, "Silenzio: 0,00%");
    const voce = el("p", { class: "g-line", "aria-live": "polite" }, "Quando sei pronto. Poi niente.");
    const go = el("button", { class: "btn primary", type: "button" }, "Comincia");
    const basta = el("button", { class: "link g-stop", type: "button", hidden: "" }, "Basta così");
    stage.append(big, counter, voce, el("div", { class: "acts" }, go), basta, soundToggle());
    const frasi = ["Hai toccato. Si ricomincia.", "Anche il mouse fa rumore.", "Da capo, come tutti.", "Cage era più paziente.", "Il silenzio non ti ha chiesto niente.", "Quasi. Quasi non conta."];
    let t0 = 0, raf = 0, armedAt = 0, running = false, stops = 0, done = false, px = null, py = null, best = 0;
    const fmt = s => "00:" + String(Math.floor(s)).padStart(2, "0");

    function tick(now) {
      if (!running) return;
      const s = (now - t0) / 1000;
      big.textContent = fmt(Math.min(GOAL, s));
      counter.textContent = "Silenzio: " + pct(s / GOAL * 100) + "%";
      if (s >= GOAL) return finish(false);
      raf = requestAnimationFrame(tick);
    }
    function begin() {
      running = true; t0 = performance.now(); armedAt = t0 + 700; px = py = null;
      go.parentNode.hidden = true;
      voce.textContent = stops ? voce.textContent : "Adesso niente.";
      P("set", "hush"); P("hush"); AMBIENT.start("stanza");
      raf = requestAnimationFrame(tick);
    }
    function interrupt(kind) {
      if (!running || done || performance.now() < armedAt) return;
      best = Math.max(best, (performance.now() - t0) / 1000);
      stops++;
      voce.textContent = kind === "via" ? "Sei andato a controllare qualcosa. Da capo." : frasi[(stops - 1) % frasi.length];
      P("kick", .7); P("fire"); P("set", "listen");
      if (stops >= 3) basta.hidden = false;
      t0 = performance.now(); armedAt = t0 + 400; px = py = null;
      setTimeout(() => { if (running) P("set", "hush"); }, 900);
    }
    const isStop = e => e && e.target && e.target.closest && e.target.closest(".g-stop");
    const onDown = e => { if (!isStop(e)) interrupt("tocco"); };
    const onKey = e => { if (!isStop(e)) interrupt("tasto"); };
    const onMove = e => {
      if (e.pointerType === "touch") return;
      if (px === null) { px = e.clientX; py = e.clientY; return; }
      if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 6) interrupt("mouse");
    };
    const onScroll = () => interrupt("scroll");
    const onVis = () => { if (document.hidden) interrupt("via"); };
    addEventListener("pointerdown", onDown, true);
    addEventListener("keydown", onKey, true);
    addEventListener("pointermove", onMove, true);
    addEventListener("wheel", onScroll, { passive: true, capture: true });
    addEventListener("scroll", onScroll, { passive: true, capture: true });
    addEventListener("touchmove", onScroll, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVis);
    function unbind() {
      removeEventListener("pointerdown", onDown, true);
      removeEventListener("keydown", onKey, true);
      removeEventListener("pointermove", onMove, true);
      removeEventListener("wheel", onScroll, { capture: true });
      removeEventListener("scroll", onScroll, { capture: true });
      removeEventListener("touchmove", onScroll, { capture: true });
      document.removeEventListener("visibilitychange", onVis);
    }
    go.onclick = begin;
    basta.onclick = () => finish(true);
    function finish(arreso) {
      if (done) return;
      const s = Math.min(GOAL, Math.max(best, (performance.now() - t0) / 1000));
      done = true; running = false; cancelAnimationFrame(raf); unbind(); AMBIENT.stop();
      P("set", "idle");
      const pc = arreso ? s / GOAL * 100 : 100, secs = Math.floor(s);
      fine(g, stage, arreso ? {
        title: "Fermo per " + secs + " " + plural(secs, "secondo.", "secondi."),
        insight: "Il record di oggi. Il silenzio non tiene la classifica, la tiene questa pagina.",
        riuscito: false,
        quote: "Il silenzio non è passivo.", fonte: "v2",
        sub: "Interruzioni: " + stops + ".",
        meter: "Silenzio: " + pct(pc) + "% · interruzioni: " + stops,
        share: "Ho provato a stare fermo 33 secondi. Il mio massimo: " + secs + ". Interruzioni: " + stops + "."
      } : {
        title: "33 secondi di silenzio.",
        insight: stops ? "Dopo " + stops + " " + plural(stops, "interruzione", "interruzioni") + ". Anche il pubblico di Cage, nel 1952, sentiva ogni rumore della sala." : "Al primo colpo. Cage sarebbe rimasto in silenzio, cioè contento.",
        quote: "Il silenzio non è passivo.", fonte: "v2",
        sub: "Interruzioni: " + stops + ".",
        meter: "Silenzio: 100,00% · interruzioni: " + stops,
        share: "Sono rimasto fermo 33 secondi senza toccare niente" + (stops ? ", al " + (stops + 1) + "° tentativo." : ", al primo tentativo.")
      });
    }
    return () => { done = true; running = false; cancelAnimationFrame(raf); unbind(); AMBIENT.stop(true); };
  }

  const MOTORI = { pezzo, bicchiere, togli, cage };

  /* ======================= elenco ======================= */
  function list() {
    stop();
    box.textContent = "";
    const fatti = api.store.get("giochi", {}) || {};
    const items = el("div", { class: "g-list" });
    GIOCHI.forEach((g, i) => {
      const f = fatti[g.id];
      items.append(el("button", { class: "g-item", type: "button", onclick: () => open(g.id) },
        el("span", { class: "g-n" }, String(i + 1).padStart(2, "0")),
        el("span", { class: "g-txt" },
          el("span", { class: "g-name" }, g.nome),
          el("span", { class: "g-riga" }, g.riga),
          el("span", { class: "g-meta" }, f ? "Ultima volta: " + f.ultimo : g.durata))));
    });
    box.append(el("div", { class: "g-wrap" },
      el("p", { class: "eyebrow" }, "Giochi · " + GIOCHI.length + " stanze brevi"),
      el("p", { class: "big" }, "Quattro giochi in cui si vince togliendo."),
      el("p", { class: "sub" }, "Con un dito o con il mouse. Nessuno vede il punteggio, a meno che tu non lo mandi."),
      items));
  }

  function open(id) {
    const g = GIOCHI.find(x => x.id === id || x.token === id);
    if (!g) return list();
    stop();
    const { stage, how } = frame(g);
    stopCurrent = MOTORI[g.id](g, stage, how);
  }

  if (startId) open(startId); else list();
  return { open, list, stop };
}


/* ====================== STATISTICHE ======================
   GoatCounter: gratuito, senza cookie, nessun dato personale, niente banner.
   Per accenderle basta scrivere qui il nome dell'account (es. "ilvuoto" per ilvuoto.goatcounter.com). */
const GOATCOUNTER = "ilvuoto-stanza";
function track(name){ try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({path: name, title: name, event: true}); } catch(e){} }
if (GOATCOUNTER && !window.claude && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)){
  window.goatcounter = {no_onload: false};
  const gs = document.createElement("script"); gs.async = true; gs.src = "https://gc.zgo.at/count.js";
  gs.dataset.goatcounter = "https://" + GOATCOUNTER + ".goatcounter.com/count"; document.head.appendChild(gs);
  document.addEventListener("click", e=>{   // clic verso fuori: Amazon, Instagram, recensioni
    const a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    const h = a.getAttribute("href") || "";
    if (/amazon\./.test(h)) track(/review/.test(h) ? "amazon-recensione" : /stores\/author|\/author\//.test(h) ? "amazon-autore" : "amazon-" + (a.dataset.punto || "link"));
    else if (/instagram\.com/.test(h)) track("instagram");
  }, true);
}

/* ====================== PROMEMORIA (calendario del telefono, gratis, nessun server) ====================== */
function remindIcs(){
  const d = new Date(); d.setDate(d.getDate() + (d.getHours() >= 21 ? 1 : 0));
  const p2 = n => String(n).padStart(2,"0"), day = `${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}`;
  const now = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//IL VUOTO//La Stanza//IT","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    "UID:ilvuoto-oggi-" + Date.now() + "@antonioflamini.github.io","DTSTAMP:" + now,
    "DTSTART:" + day + "T213000","DTEND:" + day + "T213500","RRULE:FREQ=DAILY",
    "SUMMARY:La domanda di oggi · IL VUOTO","DESCRIPTION:Una domanda al giorno\\, uguale per tutti. " + PAGE_URL + "#oggi","URL:" + PAGE_URL + "#oggi",
    "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:La domanda di oggi","TRIGGER:PT0M","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n");
  try { const a = el("a",{href: URL.createObjectURL(new Blob([ics],{type:"text/calendar"})), download:"il-vuoto-ogni-sera.ics"}); document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    toast("Aprilo e aggiungilo al calendario: ogni sera alle 21:30."); track("promemoria"); }
  catch(e){ toast("Il promemoria non si può creare da qui."); }
}

/* ====================== INSTALLA L'APP ====================== */
let installEvt = null;
function renderAppBtn(){ const b = $("#app-open"); if (b) b.hidden = IS_HOME_APP || !!window.claude || !(installEvt || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent||"")); }
addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installEvt = e; renderAppBtn(); });
addEventListener("appinstalled", ()=>{ track("installata"); installEvt = null; renderAppBtn(); if (!$("#sheet").hidden) closeSheet(); toast("Fatto: la Stanza è tra le tue app."); });
async function installApp(){
  if (installEvt){ const ev = installEvt; installEvt = null; try { await ev.prompt(); await ev.userChoice; } catch(e){} renderAppBtn(); return true; }
  return false;
}
if ("serviceWorker" in navigator && !window.claude && /^https?:$/.test(location.protocol)) addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });

/* ====================== METTILA NELLA HOME ====================== */
async function openHomeSheet(){
  if (await installApp()) return;
  const ua = navigator.userAgent || "";
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Bytedance|Line\//i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const box = $("#sheet-in"); box.replaceChildren();
  const passi = [];
  if (inApp) passi.push("Sei dentro Instagram, Facebook o TikTok: da qui non si può. Tocca i tre puntini in alto a destra e scegli \"Apri nel browser\" (o \"Apri in Safari\" / \"Apri in Chrome\"), poi segui i passi qui sotto.");
  if (ios || (!android && !inApp && /Mobi/i.test(ua))) passi.push("Su iPhone, in Safari: tocca Condividi (il quadrato con la freccia verso l'alto), scorri e scegli \"Aggiungi alla schermata Home\", poi \"Aggiungi\".");
  if (android) passi.push("Su Android, in Chrome: tocca i tre puntini in alto a destra e scegli \"Aggiungi a schermata Home\" (a volte si chiama \"Installa app\"), poi \"Aggiungi\".");
  if (!ios && !android && !/Mobi/i.test(ua)) passi.push("Sul computer: premi Ctrl+D (su Mac Cmd+D) per salvarla tra i preferiti. Sul telefono, apri lo stesso link e usa \"Aggiungi alla schermata Home\".");
  box.append(
    el("div",{class:"row"}, el("span",{class:"eyebrow"},"Ogni giorno, con un tocco"), el("button",{type:"button",class:"btn ghost",onclick:closeSheet},"Chiudi")),
    el("h2",{class:"huge",id:"sheet-title"},"Installa la Stanza."),
    el("p",{class:"big"},"Due tocchi e sta tra le tue app, con la sua icona. La domanda di Oggi cambia ogni notte, e i giorni di fila contano solo se torni."),
    el("ul",{class:"perks"}, el("li",{},"gratis"), el("li",{},"niente store"), el("li",{},"niente account"), el("li",{},"funziona senza rete"), el("li",{},"nessun dato raccolto")),
    el("ol",{class:"sell-steps"}, ...passi.map(p=>el("li",{},p))),
    el("p",{class:"sub"},"Oppure salvati il link:"),
    el("p",{class:"url"}, PAGE_URL),
    el("div",{class:"acts"}, el("button",{type:"button",class:"btn ghost",onclick:()=>copyText(PAGE_URL, box)},"Copia il link")));
  sheetReturn = document.activeElement; VOICE.stop();
  const d = $("#sheet"); d.hidden = false; d.scrollTop = 0; d.querySelector(".btn.ghost").focus();
}

/* ====================== COS'È LA STANZA ====================== */
let infoReturn = null;
function openInfo(){ infoReturn = document.activeElement; const d=$("#info"); d.hidden=false; d.scrollTop=0; $("#info-close").focus(); VOICE.stop(); }
function closeInfo(){ $("#info").hidden=true; if (presence) presence.wake(); if (infoReturn && infoReturn.focus) infoReturn.focus(); }
$("#info-open").onclick = openInfo;
$("#home-open").onclick = openHomeSheet; $("#app-open").onclick = openHomeSheet; renderAppBtn(); if (IS_HOME_APP) $("#home-open").hidden = true;
if (!window.claude){   // sul sito: nessuna IA, nessun invio di testo; i testi lo dicono chiaramente
  const f = document.querySelector("footer > span");
  if (f) f.textContent = "Questa voce è un programma ispirato ai libri di Antonio Flamini: risponde con frasi scritte prima, prese dai suoi libri. Non è l'autore e non è un terapeuta. Niente account, niente pubblicità, nessun dato raccolto: quello che scrivi non lascia il tuo telefono.";
  document.querySelectorAll(".info-list dt").forEach(dt=>{ if (/Due modi/.test(dt.textContent)){ dt.textContent = "Privacy"; dt.nextElementSibling.textContent = "Le risposte sono frasi scritte prima: quello che scrivi resta nella pagina e non viene mandato a nessuno."; } });
} $("#info-open2").onclick = openInfo;
$("#info-close").onclick = closeInfo;
$("#info-go").onclick = ()=>{ closeInfo(); goRoom("stanza"); msg.focus(); };
addEventListener("keydown", e=>{ if (e.key==="Escape" && !$("#info").hidden) closeInfo(); });

/* ====================== NAVIGAZIONE ====================== */
const ROOMS = ["stanza","test","oggi","cancella","giochi","passa"];
let giochiH = null, gameStart = null;
function giochiApi(){ return {el, saveCard, copyText, toast, store, pageUrl:PAGE_URL, presence, reduced:REDUCED, goRoom,
  buyUrl: p => typeof buyUrl==="function" ? buyUrl(p) : BUY, reviewUrl: () => typeof reviewUrl==="function" ? reviewUrl() : BUY,
  instagramUrl: () => typeof igUrl==="function" ? igUrl() : "https://www.instagram.com/antonio_flamini/",
  vol2Uscito: () => typeof vol2Out==="function" && vol2Out(), vol2Url: () => (typeof VENDITE!=="undefined" && VENDITE.link.vol2) || "",
  salesOff: () => typeof noSell!=="undefined" && noSell }; }
function goRoom(r){
  if (!ROOMS.includes(r)) r = "stanza";
  for (const x of ROOMS){ $("#room-"+x).hidden = x!==r; const tb=$("#tab-"+x); tb.setAttribute("aria-selected", String(x===r)); tb.tabIndex = x===r ? 0 : -1; }
  if (r==="stanza" && presence) presence.wake();
  if (r==="test" && !$("#test").children.length) testIntro();
  if (r==="oggi") renderOggi();
  if (r==="passa") renderPassa();
  if (r==="cancella") renderCancella();
  if (r!=="giochi" && giochiH && giochiH.stop) giochiH.stop();
  if (r==="giochi" && typeof renderGiochi==="function"){
    if (!giochiH || gameStart) { $("#giochi").replaceChildren(); giochiH = renderGiochi($("#giochi"), giochiApi(), gameStart || undefined); gameStart = null; }
    else if (giochiH.list) giochiH.list();
  }
  try { const tb = $("#tab-"+r), nr = tb.parentElement, x = tb.offsetLeft - nr.offsetLeft; if (x + tb.offsetWidth > nr.scrollLeft + nr.clientWidth || x < nr.scrollLeft) nr.scrollTo({left: x - 16, behavior: REDUCED ? "auto" : "smooth"}); } catch(e){}
  counterEl.closest("form").hidden = r !== "stanza";
  if (r !== "stanza") VOICE.stop();
  store.set("room", r);
  if (goRoom._last !== r){ goRoom._last = r; track("stanza-" + r); }
}
document.querySelectorAll(".room-tab").forEach(b=>b.onclick=()=>goRoom(b.dataset.room));
{ const nr = $("nav.rooms"), upd = ()=>nr.classList.toggle("end", nr.scrollLeft + nr.clientWidth >= nr.scrollWidth - 4); nr.addEventListener("scroll", upd, {passive:true}); addEventListener("resize", upd); upd(); }
$("nav.rooms").addEventListener("keydown", e=>{
  if (!["ArrowRight","ArrowLeft","Home","End"].includes(e.key)) return;
  const tabs=[...document.querySelectorAll(".room-tab")], i=tabs.indexOf(document.activeElement); if (i<0) return;
  const n = e.key==="Home" ? tabs[0] : e.key==="End" ? tabs[tabs.length-1] : tabs[(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length]; n.focus(); goRoom(n.dataset.room); e.preventDefault(); });
addEventListener("keydown", e=>{   // il focus resta dentro la finestra aperta
  if (e.key!=="Tab") return;
  const d=[$("#info"),$("#sheet")].find(x=>x && !x.hidden); if (!d) return;
  const f=[...d.querySelectorAll('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
  if (!f.length) return; const first=f[0], last=f[f.length-1];
  if (e.shiftKey && (document.activeElement===first || !d.contains(document.activeElement))){ last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && (document.activeElement===last || !d.contains(document.activeElement))){ first.focus(); e.preventDefault(); } });

/* --- avvio --- */
presence = new Presence($("#presence"));
function route(H, first){
  if (H==="info"){ setTimeout(openInfo, 300); H=""; }
  if (H==="home"){ setTimeout(openHomeSheet, 300); H=""; }
  if (H==="libro"){ setTimeout(()=>openSheet("libro"), 300); H=""; }
  if (H==="pagina"){ setTimeout(()=>openSheet("pagina"), 300); H=""; }
  if (H==="vuoto-mio"){ setTimeout(()=>openQuaderno(), 300); H="oggi"; }
  if (/^gioco[1-4]$/.test(H)){ gameStart = H; H = "giochi"; }
  const qm = H.match(/^q(\d{1,3})$/); if (qm && COPY.domande_del_giorno[+qm[1]]){ passed = +qm[1]; H = "oggi"; }
  let v = store.get("vol","I"); if (!VOLUMI[v]) v = "I";
  if (H==="soglia") v="III"; else if (H==="struttura") v="II"; else if (H==="vuoto") v="I";
  const room = ROOMS.includes(H) ? H : "stanza";
  if (first){
    openVolume(v);
    if (room==="stanza" && !H && !store.get("presentato", false)){ goRoom("stanza"); presentati(); } else goRoom(room);
  } else {
    if (["soglia","struttura","vuoto"].includes(H)) openVolume(v);
    if (H) goRoom(room);
  }
}
route(location.hash.replace("#",""), true);
addEventListener("hashchange", ()=>route(location.hash.replace("#",""), false));
(async ()=>{ try { sample = window.claude ? await window.claude.use("sample") : null; } catch(e){ sample = null; } liveOK = !!sample; setMode(); })();
