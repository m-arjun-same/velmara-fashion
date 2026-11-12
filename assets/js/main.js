/* VELMARA V3 — own JS. Motion system rebuilt from the mirror study's mechanics:
   no native scroll; ONE wheel/touch/keyboard dispatcher + chapter state machine;
   per-chapter 0..1 / px scalars with chapter lerp weights (.085 works, .12 sub, .05 hero fluid);
   Iris (forward) / Page Turn (backward) chapter transitions (GSAP, approved sample 3); reusable noise burn
   (loader exit, philosophy entry); works text gate + breathing locks;
   12fps film grain over works. Every system is original code written for Velmara. */
(function(){
"use strict";
var clamp=function(v,a,b){return Math.min(b,Math.max(a,v));};
var vh=function(){return window.innerHeight;};
var easeIO=function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;};

/* ================= Tokyo clock + traditional hour (English only, 10s refresh) ================= */
var EDO_N=["Rat","Ox","Tiger","Rabbit","Dragon","Serpent","Horse","Goat","Monkey","Rooster","Dog","Boar"];
var EDO_B=[9,8,7,6,5,4,9,8,7,6,5,4];
var TSU={9:"Kokonotsu",8:"Yatsu",7:"Nanatsu",6:"Muttsu",5:"Itsutsu",4:"Yotsu"};
function tokyoNow(){try{return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Tokyo"}));}catch(e){return new Date();}}
function clock(){
  var d=tokyoNow(),hh=("0"+d.getHours()).slice(-2),mm=("0"+d.getMinutes()).slice(-2);
  document.querySelectorAll(".js-clock").forEach(function(e){e.textContent=hh+":"+mm;});
  var idx=Math.floor(((d.getHours()+1)%24)/2),name=EDO_N[idx],cnt=EDO_B[idx];
  var label="The Hour of the "+name+" — around "+TSU[cnt]+"-doki";
  document.querySelectorAll(".js-hour").forEach(function(e){e.textContent=label;});
}
clock();setInterval(clock,10000);

/* ================= element refs ================= */
function $(id){return document.getElementById(id);}
var chapters=[$("hero"),$("about"),$("works"),$("approach"),$("omoi"),$("flow"),$("after")];
var CH_DARK=[false,true,false,false,true,true,false];
var header=$("siteHeader"),grainEl=$("grain");

/* ================= multi-octave value noise (for burns) ================= */
function makeNoise(w,h){
  var f=new Float32Array(w*h),amps=[0.5,0.27,0.15,0.08],grids=[5,11,23,47],seed=7;
  function rnd(){seed=(seed*16807)%2147483647;return seed/2147483647;}
  for(var o=0;o<4;o++){
    var g=grids[o],gw=g+1,gh=Math.max(2,Math.round(g*h/w))+1,grid=[],i,x,y;
    for(i=0;i<gw*gh;i++)grid.push(rnd());
    for(y=0;y<h;y++)for(x=0;x<w;x++){
      var fx=x/w*g,fy=y/h*(gh-1),x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;
      tx=tx*tx*(3-2*tx);ty=ty*ty*(3-2*ty);
      var a=grid[y0*gw+x0],b=grid[y0*gw+x0+1],c=grid[(y0+1)*gw+x0],d=grid[(y0+1)*gw+x0+1];
      f[y*w+x]+=(a+(b-a)*tx+(c-a)*ty+(a-b-c+d)*tx*ty)*amps[o];
    }
  }
  var mn=1e9,mx=-1e9,i2;
  for(i2=0;i2<f.length;i2++){if(f[i2]<mn)mn=f[i2];if(f[i2]>mx)mx=f[i2];}
  for(i2=0;i2<f.length;i2++)f[i2]=(f[i2]-mn)/(mx-mn);
  return f;
}
/* ================= burn painter: orange->red front, black char, transparent burnt ================= */
function makeBurn(cv,base,centerBias){
  var ctx=cv.getContext("2d"),W=cv.width,H=cv.height,field=makeNoise(W,H);
  var img=ctx.createImageData(W,H),data=img.data;
  function draw(p){
    var t=p*1.3,x,y,i,d,n,px;
    for(y=0;y<H;y++)for(x=0;x<W;x++){
      i=y*W+x;n=field[i];
      if(centerBias){var dx=(x/W-0.5)*1.4,dy=(y/H-0.5)*1.9;n=n*0.6+Math.sqrt(dx*dx+dy*dy)*0.55;}
      d=n-t;px=i*4;
      if(d<-0.17){data[px+3]=0;}
      else if(d<-0.03){data[px]=12;data[px+1]=6;data[px+2]=5;data[px+3]=255;}
      else if(d<0.07){var k=(d+0.03)/0.10;data[px]=215+(255-215)*k;data[px+1]=20+(110-20)*k;data[px+2]=26+(20-26)*k;data[px+3]=255;}
      else{data[px]=base[0];data[px+1]=base[1];data[px+2]=base[2];data[px+3]=255;}
    }
    ctx.putImageData(img,0,0);
  }
  return {draw:draw};
}

/* ================= CHAPTER TRANSITIONS — E · IRIS forward / F · PAGE TURN backward (GSAP) =================
   Approved in /sample-transition-3/ ("E & F both apply"). Direction decides:
   FORWARD (n>from) — IRIS: the incoming chapter becomes active on top of the
   outgoing (which stays visible + rendering as .under) and is revealed by a
   clip-path circle expanding from screen centre, 0.8s power3.inOut.
   BACKWARD (n<from) — PAGE TURN: the incoming chapter sits beneath (.under)
   while the outgoing folds away on top: perspective(1600px) rotateY 0->+72deg,
   transform-origin right centre, with a black shade growing to .55, 0.85s
   power3.inOut.
   Chapter roots carry no transforms of their own in CSS/JS (the only
   exception, #works.exit, is a forward-only exit that never coincides with a
   fold), so the fold is applied directly to the outgoing chapter element; the
   shade is a dedicated .turn-shade child per chapter.
   cur + onEnter side-effects run at flight START for both, so the incoming
   chapter is live while it is revealed; transFrom keeps the outgoing chapter
   rendering in the rAF loop until settle. Settle (timeline onComplete or the
   done-guard timer) always lands on exactly one .act chapter with all
   clips/transforms/shades cleared. No-GSAP / reduced-motion = instant swap. */
var transFrom=-1,transTo=-1,transDone=null,transGuard=null,transSettled=true;
function cleanChapterFx(i){
  var el=chapters[i];
  el.classList.remove("under");
  if(window.gsap)gsap.set(el,{clearProps:"clipPath,transform,transformOrigin"});
  else{el.style.clipPath="";el.style.transform="";el.style.transformOrigin="";}
  var sh=el.querySelector(".turn-shade");
  if(sh){if(window.gsap)gsap.set(sh,{clearProps:"opacity"});else sh.style.opacity="";}
}
function settleTransition(){
  if(transSettled)return;
  transSettled=true;
  if(transGuard){clearTimeout(transGuard);transGuard=null;}
  var from=transFrom,n=transTo;
  if(window.gsap){
    if(from>=0){gsap.killTweensOf(chapters[from]);var sh0=chapters[from].querySelector(".turn-shade");if(sh0)gsap.killTweensOf(sh0);}
    if(n>=0)gsap.killTweensOf(chapters[n]);
  }
  if(from>=0){
    chapters[from].classList.remove("act");
    cleanChapterFx(from);
    if(from===2)chapters[2].classList.remove("exit");
  }
  if(n>=0){chapters[n].classList.add("act");cleanChapterFx(n);}
  transFrom=-1;transTo=-1;
  var d=transDone;transDone=null;
  if(d)d();
}
function chapterTransition(from,n,onDone){
  if(reduceMotion||!window.gsap){ /* instant swap — the old swap semantics */
    chapters[from].classList.remove("act");
    chapters[n].classList.add("act");
    cur=n;onEnter(n,from);
    if(from===2)setTimeout(function(){chapters[2].classList.remove("exit");},60);
    onDone();return;
  }
  transFrom=from;transTo=n;transDone=onDone;transSettled=false;
  transGuard=setTimeout(settleTransition,2200); /* force-settle if a tween is ever interrupted */
  var out=chapters[from],inn=chapters[n];
  if(n>from){ /* E · IRIS */
    out.classList.remove("act");out.classList.add("under");
    inn.classList.add("act");
    cur=n;onEnter(n,from);
    gsap.set(inn,{clipPath:"circle(0% at 50% 50%)"});
    gsap.to(inn,{clipPath:"circle(120% at 50% 50%)",duration:0.8,ease:"power3.inOut",onComplete:settleTransition});
  }else{ /* F · PAGE TURN */
    inn.classList.add("under");
    cur=n;onEnter(n,from);
    var shade=out.querySelector(".turn-shade");
    gsap.set(out,{transformPerspective:1600,transformOrigin:"right center",rotationY:0});
    if(shade)gsap.set(shade,{opacity:0});
    var tl=gsap.timeline({onComplete:settleTransition});
    tl.to(out,{rotationY:72,duration:0.85,ease:"power3.inOut"},0);
    if(shade)tl.to(shade,{opacity:0.55,duration:0.85,ease:"power3.inOut"},0);
  }
}

/* ================= chapter state machine ================= */
var cur=0,busy=false,wheelLockUntil=0,loaderDone=false;
chapters[0].classList.add("act");
function setHeader(){
  var dark=CH_DARK[cur];
  if(cur===6)dark=afterFooterDark;
  header.classList.toggle("on-dark",dark);
  header.classList.toggle("show-letter",!dark);
  grainEl.classList.toggle("on",cur===2);
}
var omoiBurnAnim=null;
function onEnter(n,from){
  if(n===4&&from===3){ /* philosophy: burn entry */
    var cv=$("omoiBurn");cv.style.display="block";
    omoiBurnAnim={t0:performance.now(),dur:1700,cv:cv};
  }
  if(n===4&&from===5){omoi.tgt=omoi.total();omoi.cur=omoi.total();omoiRender();}
  if(n===3&&from===4){ap.phase=1;apShowPhase();ap.tgt=ap.total();ap.cur=ap.tgt;}
  if(n===2&&from===3){works.tgt=1;}
  if(n===5&&from===6){fl.phase=1;flShowPhase();fl.tgt=fl.total();fl.cur=fl.tgt;}
  setHeader();
}
function goChapter(n){
  if(n===cur||n<0||n>6||!loaderDone)return;
  if(transFrom>=0)settleTransition(); /* a menu jump mid-flight: settle the current flight first */
  if(busy)return;
  busy=true;wheelLockUntil=performance.now()+(n>cur?900:950); /* lock covers the flight: iris .8s / page turn .85s */
  var from=cur;
  if(from===2&&n===3)chapters[2].classList.add("exit"); /* works exit: blur + rise */
  chapterTransition(from,n,function(){busy=false;});
}

/* ================= sub-scroller helper (px units, lerp .12, snap <.5) ================= */
function pxState(tgt,curV){return {tgt:tgt||0,cur:curV||0};}
function pxStep(s){s.cur+=(s.tgt-s.cur)*0.12;if(Math.abs(s.tgt-s.cur)<0.5)s.cur=s.tgt;}

/* ================= AFTER sub-scroller (dy*1.15) ================= */
var afterIn=$("afterIn"),afterS=pxState(0,0),afterFooterDark=false;
function afterMax(){return Math.max(0,afterIn.scrollHeight-vh());}

/* ================= menu sources + modal sub-scrollers ================= */
var srcIn=$("srcIn"),srcView=$("srcView"),srcS=pxState(0,0);
function srcMax(){return Math.max(0,srcIn.scrollHeight-srcView.clientHeight);}
var modal=$("modal"),modalIn=$("modalIn"),modalView=$("modalView"),modalS=pxState(0,0),modalOpen=false;
function modalMax(){return Math.max(0,modalIn.scrollHeight-modalView.clientHeight);}

/* ================= HERO: petals + fluid (lerp .05) ================= */
var fluid={cur:0.3,tgt:0.3,lastMove:0};
addEventListener("pointermove",function(){if(cur===0){fluid.tgt=1;fluid.lastMove=performance.now();}});
function petalField(cvId,count){
  var cv=$(cvId);if(!cv)return null;
  var ctx=cv.getContext("2d"),W=0,H=0,ps=[];
  function size(){W=cv.width=cv.offsetWidth;H=cv.height=cv.offsetHeight;}
  size();
  for(var i=0;i<count;i++)ps.push({x:Math.random(),y:Math.random(),s:Math.random()*9+5,vy:Math.random()*.00045+.00018,vx:(Math.random()-.5)*.00022,rot:Math.random()*6.28,vr:(Math.random()-.5)*.008,o:Math.random()*.45+.25});
  return {draw:function(spd){
    if(!W)return;
    ctx.clearRect(0,0,W,H);
    ps.forEach(function(q){
      q.y+=q.vy*spd;q.x+=q.vx*spd+Math.sin(q.y*9+q.rot)*.00012;q.rot+=q.vr;
      if(q.y>1.03){q.y=-.03;q.x=Math.random();}
      ctx.save();ctx.translate(q.x*W,q.y*H);ctx.rotate(q.rot);ctx.globalAlpha=q.o;ctx.fillStyle="#d7141a";
      ctx.beginPath();ctx.ellipse(0,0,q.s,q.s*.55,0,0,6.29);ctx.fill();ctx.restore();
    });
    ctx.globalAlpha=1;
  },resize:size};
}
var heroPetals=petalField("petals",26),apPetals=petalField("apPetals",20);
var arts=document.querySelectorAll("#heroFrame .art"),artIdx=0;
$("chgBtn").addEventListener("click",function(){
  arts[artIdx].classList.remove("act");artIdx=(artIdx+1)%arts.length;arts[artIdx].classList.add("act");
});

/* ================= ABOUT parallax scalar (lerp .12 via pxStep) ================= */
var aboutS=pxState(0,0),aboutBg=$("aboutBg");

/* ================= WORKS (target dy/(vh*3.4), render lerp .085, text gate) ================= */
var works={tgt:0,cur:0,endAt:0};
var caseEls=[].slice.call(document.querySelectorAll("#works .case"));
var txtS=[],txtMax=[],txtDoneAt=[0,0,0];
caseEls.forEach(function(c,i){
  txtS.push(pxState(0,0));
  var inner=c.querySelector(".case-txt-in"),box=c.querySelector(".case-txt");
  txtMax.push(Math.max(0,inner.scrollHeight-box.clientHeight));
});
function caseIdx(){return Math.min(2,Math.floor(works.tgt*2.999));}
var wkTrack=$("wkTrack"),wkBar=$("wkBar"),wkCur=$("wkCur"),wkCollage=$("wkCollage");
function worksWheel(dy,now){
  var i=caseIdx();
  if(dy>0){
    if(txtMax[i]>0&&txtS[i].tgt<txtMax[i]-1){ /* text gate: text scrolls first, at dy*.6 */
      txtS[i].tgt=Math.min(txtMax[i],txtS[i].tgt+dy*0.6);
      if(txtS[i].tgt>=txtMax[i]-1&&!txtDoneAt[i])txtDoneAt[i]=now;
      return;
    }
    if(txtMax[i]>0&&txtS[i].cur<txtMax[i]-1)return; /* still catching up */
    if(txtDoneAt[i]&&now-txtDoneAt[i]<1000)return; /* breathing: 1000ms after finishing a case text */
    if(works.tgt>=1){
      if(!works.endAt)works.endAt=now;
      if(now-works.endAt>=1400)goChapter(3); /* breathing: 1400ms hold at end of works */
      return;
    }
    works.tgt=clamp(works.tgt+dy/(vh()*3.4),0,1);
    if(works.tgt>=1)works.endAt=now;
  }else{
    if(txtS[i].tgt>0){txtS[i].tgt=Math.max(0,txtS[i].tgt+dy*0.6);return;}
    if(works.tgt<=0){goChapter(1);return;}
    works.tgt=clamp(works.tgt+dy/(vh()*3.4),0,1);
    if(works.tgt<1)works.endAt=0;
  }
}
function worksRender(){
  works.cur+=(works.tgt-works.cur)*0.085;
  if(Math.abs(works.tgt-works.cur)<0.0004)works.cur=works.tgt;
  wkTrack.style.transform="translateX("+(-works.cur*2*innerWidth)+"px)";
  var phase=works.cur*2,d=Math.abs(phase-Math.round(phase));
  wkTrack.style.filter="blur("+(d*9).toFixed(1)+"px)";
  wkCollage.style.transform="translateX("+(-works.cur*16)+"vw)";
  wkBar.style.width=(works.cur*100)+"%";
  wkCur.textContent="0"+(works.cur>=0.999?3:Math.floor(works.cur*3)+1);
  var i=Math.min(2,Math.round(works.cur*2));
  txtS.forEach(function(s,j){
    if(j!==i&&s.tgt===0&&s.cur===0)return;
    pxStep(s);
    caseEls[j].querySelector(".case-txt-in").style.transform="translateY("+(-s.cur)+"px)";
  });
}

/* ================= APPROACH (intro phase + steps px scalar, lerp .12) ================= */
var ap={phase:0,tgt:0,cur:0,total:function(){return vh()*2.4;}};
var apTrack=$("apTrack"),apDots=document.querySelectorAll(".ap-dots i"),apArc=document.querySelector(".ap-arc");
function apShowPhase(){
  $("apIntro").classList.toggle("on",ap.phase===0);
  $("apStepsPh").classList.toggle("on",ap.phase===1);
}
apShowPhase();
function apWheel(dy){
  if(dy>0){
    if(ap.phase===0){ap.phase=1;apShowPhase();return;}
    if(ap.tgt>=ap.total()){goChapter(4);return;}
    ap.tgt=clamp(ap.tgt+dy,0,ap.total());
  }else{
    if(ap.phase===1&&ap.tgt>0){ap.tgt=clamp(ap.tgt+dy,0,ap.total());return;}
    if(ap.phase===1){ap.phase=0;apShowPhase();return;}
    goChapter(2);
  }
}
function apRender(){
  var s={tgt:ap.tgt,cur:ap.cur};pxStep(s);ap.cur=s.cur;
  var prog=ap.total()?ap.cur/ap.total():0;
  apTrack.style.transform="translateX("+(-prog*2*innerWidth)+"px)";
  var ai=Math.min(2,Math.round(prog*2));
  apDots.forEach(function(dt,i){dt.classList.toggle("on",i<=ai);});
  if(apArc)apArc.style.transform="translateY(-50%) rotate("+(prog*40)+"deg)";
}

/* ================= PHILOSOPHY (px scalar drives line reveals, lerp .12) ================= */
var omoi={tgt:0,cur:0,total:function(){return vh()*1.2;}};
var oLines=document.querySelectorAll(".oline");
function omoiWheel(dy){
  if(dy>0){
    if(omoi.tgt>=omoi.total()){goChapter(5);return;}
    omoi.tgt=clamp(omoi.tgt+dy,0,omoi.total());
  }else{
    if(omoi.tgt>0){omoi.tgt=clamp(omoi.tgt+dy,0,omoi.total());return;}
    goChapter(3);
  }
}
function omoiRender(){
  var s={tgt:omoi.tgt,cur:omoi.cur};pxStep(s);omoi.cur=s.cur;
  var prog=omoi.total()?omoi.cur/omoi.total():0;
  oLines.forEach(function(l,i){l.classList.toggle("in",prog*4.4>i+0.25);});
}

/* ================= FLOW — THE SEAM (intro + pattern-piece steps, px scalar, lerp .12) =================
   Own design: no WebGL in this chapter. The four steps are pattern pieces pinned
   onto one stitch line; exactly one piece is active at a time, crossfading via CSS. */
var fl={phase:0,tgt:0,cur:0,total:function(){return vh()*3;},curStep:0,snap:true};
var flSlides=document.querySelectorAll(".fl-slide"),flBar=$("flBar"),flCur=$("flCur");
function flShowPhase(){
  $("flIntro").classList.toggle("on",fl.phase===0);
  $("flStepsPh").classList.toggle("on",fl.phase===1);
  if(fl.phase===1)fl.snap=true; /* entering the steps: settle instantly on the current step */
}
flShowPhase();
function flWheel(dy){
  if(dy>0){
    if(fl.phase===0){fl.phase=1;flShowPhase();return;}
    if(fl.tgt>=fl.total()){goChapter(6);return;}
    fl.tgt=clamp(fl.tgt+dy,0,fl.total());
  }else{
    if(fl.phase===1&&fl.tgt>0){fl.tgt=clamp(fl.tgt+dy,0,fl.total());return;}
    if(fl.phase===1){fl.phase=0;flShowPhase();return;}
    goChapter(4);
  }
}
function flSetStep(i){
  fl.curStep=i;
  flSlides.forEach(function(sl,j){sl.classList.toggle("act",j===i);});
  flCur.textContent="0"+(i+1);
}
function flRender(){
  var s={tgt:fl.tgt,cur:fl.cur};pxStep(s);fl.cur=s.cur;
  var prog=fl.total()?fl.cur/fl.total():0,desired=Math.round(clamp(prog*3,0,3));
  flBar.style.width=(prog*100)+"%"; /* stitch progress: red stitches fill the line */
  if(fl.snap){flSetStep(desired);fl.snap=false;return;}
  if(desired!==fl.curStep)flSetStep(desired);
}

/* ================= chapter wheel handlers ================= */
var handlers=[
  function(dy){ if(dy>0)goChapter(1); },
  function(dy){ if(dy>0)goChapter(2); else goChapter(0); },
  worksWheel,
  apWheel,
  omoiWheel,
  flWheel,
  function(dy,now,src){
    if(src==="wheel"&&lenisAfter)return; /* #after wheel feed is owned by the Lenis virtual-scroll layer (see tail block) */
    if(dy<0&&afterS.tgt<=0){goChapter(5);return;}
    afterS.tgt=clamp(afterS.tgt+dy*1.15,0,afterMax());
  }
];

/* ================= ONE master dispatcher ================= */
var menuOpen=false;
function dispatch(dy,src){
  var now=performance.now();
  if(menuOpen){ if(Math.abs(dy)>=2)srcS.tgt=clamp(srcS.tgt+clamp(dy,-160,160),0,srcMax()); return; }
  if(modalOpen){ if(Math.abs(dy)>=2)modalS.tgt=clamp(modalS.tgt+dy*0.6,0,modalMax()); return; }
  if(!loaderDone||busy)return;
  if(Math.abs(dy)<8)return;
  if(now<wheelLockUntil)return;
  handlers[cur](dy,now,src);
}
addEventListener("wheel",function(e){
  e.preventDefault();
  dispatch(e.deltaY,"wheel");
},{passive:false});
/* touch -> synthetic wheel steps of ~14px */
var tLast=null,tAcc=0,tDir=0;
addEventListener("touchstart",function(e){if(e.touches.length===1){tLast={x:e.touches[0].clientX,y:e.touches[0].clientY};tAcc=0;tDir=0;}},{passive:true});
addEventListener("touchmove",function(e){
  if(!tLast||e.touches.length!==1)return;
  e.preventDefault();
  var t=e.touches[0],dx=t.clientX-tLast.x,dy=tLast.y-t.clientY;
  if(!tDir&&Math.abs(t.clientY-tLast.y)+Math.abs(dx)>8)tDir=Math.abs(dy)>=Math.abs(dx)?1:2;
  if(tDir===1){tAcc+=dy;while(Math.abs(tAcc)>=14){var step=tAcc>0?14:-14;dispatch(step);tAcc-=step;}}
  tLast={x:t.clientX,y:t.clientY};
},{passive:false});
addEventListener("touchend",function(){tLast=null;tAcc=0;});
addEventListener("keydown",function(e){
  var k=e.key;
  if(k==="ArrowDown"||k==="PageDown"||k===" "){e.preventDefault();dispatch(vh()*0.9);}
  else if(k==="ArrowUp"||k==="PageUp"){e.preventDefault();dispatch(-vh()*0.9);}
  else if(k==="Escape"){if(modalOpen)closeModal();else if(menuOpen)closeMenu();}
});

/* ================= menu / modal / sound / nav ================= */
var menu=$("menu");
function openMenu(){menuOpen=true;menu.classList.add("open");menu.setAttribute("aria-hidden","false");}
function closeMenu(){menuOpen=false;menu.classList.remove("open");menu.setAttribute("aria-hidden","true");}
$("menuBtn").addEventListener("click",openMenu);
$("footMenuBtn").addEventListener("click",openMenu);
$("menuClose").addEventListener("click",closeMenu);
document.querySelectorAll("[data-goto]").forEach(function(a){
  a.addEventListener("click",function(e){
    e.preventDefault();
    var n=+a.getAttribute("data-goto");
    if(menuOpen)closeMenu();
    if(n!==cur){busy=false;goChapter(n);}
  });
});
var cases=[
{img:"assets/img/img06.jpg",cat:"Official Campaign / Artist Experience",title:"The Resonance of Music, Worn Untouched.",body:"Shot over two days in natural light, the campaign follows one wearer the way a recital follows a single note — nothing staged steps in front of the garment. The series ran as a print editorial and a digital lookbook, and the featured coat sold out in nine days. Every seam is finished by hand, so the inside of the garment reads as calmly as the outside; a performer notices such things in the wings, in the thirty seconds before the lights change. The lookbook closes with the coat unworn, on a chair, still holding the shape of the body that left it — the afterglow, made visible."},
{img:"assets/img/img08.jpg",cat:"Strategy / Creative Direction",title:"Read the Season, Draw the Strategy for Growth.",body:"We read the market and shaped the label's direction for three seasons ahead — one design language running through garments, packaging, lookbooks and film, so every touchpoint a customer meets delivers the same world, and the same promise. The work began with forty hours of listening, and ended with fewer pieces, better cloth, and a calendar that follows the wearer's year."},
{img:"assets/img/img02.jpg",cat:"EC Site / Capsule Drop",title:"Worldview and Desire, in One Seamless Flow.",body:"A capsule drop built as a single flow: atmosphere first, friction nowhere. From the first look to checkout the path stays inside the collection's world — and balances empathy for the brand with hard results at the till. When the capsule sold through, the page became the season's archive entry, so the world of the collection stays visitable."}
];
function openModal(i){
  var c=cases[i];
  $("mImg").src=c.img;$("mCat").textContent=c.cat;$("mTitle").textContent=c.title;$("mBody").textContent=c.body;
  modalS.tgt=0;modalS.cur=0;modalIn.style.transform="translateY(0)";
  modal.classList.add("open");modalOpen=true;
}
function closeModal(){modal.classList.remove("open");modalOpen=false;}
document.querySelectorAll(".viewmore").forEach(function(b){b.addEventListener("click",function(){openModal(+b.getAttribute("data-case"));});});
$("modalClose").addEventListener("click",closeModal);
modal.addEventListener("click",function(e){if(e.target===modal)closeModal();});

/* ================= reveals (after chapter) ================= */
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});},{threshold:0.2});
document.querySelectorAll("#after .fade").forEach(function(e){io.observe(e);});

/* Data counters — started by the Data curtain below, so the numbers count up
   as the split fields arrive (same 1600ms cubic-out count as before). */
var countersStarted=false;
function startDataCounters(){
  if(countersStarted)return;countersStarted=true;
  document.querySelectorAll(".count").forEach(function(e){
    var to=+e.getAttribute("data-to"),t0=null;
    (function step(ts){if(!t0)t0=ts;var k=clamp((ts-t0)/1600,0,1);e.textContent=Math.floor(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step);})(performance.now());
  });
}

/* ================= TAIL MOTION (v7 — Data + Contact curtains; Footer as v6) =================
   GSAP + ScrollTrigger (vendored locally, registered once). The chapter engine
   never natively scrolls, so a window-scroller ScrollTrigger could never fire:
   section entrances are played by IntersectionObserver, and the Footer name
   timeline is scrubbed from afterS progress inside the main rAF loop.
   v7: Data and Contact share ONE entrance — "the curtain": each section's
   whole field wipes in as a single piece (clip-path inset(100% 0 0 0) ->
   inset(0)), played once when the section enters. No item-by-item fades or
   staggers in these two sections; content rides inside as one composed group.
   Initial states are set ONLY from JS inside the GSAP guard — if GSAP fails
   to load, or reduced motion is preferred, the content is simply fully visible. */
var reduceMotion=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
var footTl=null,footEl=afterIn.querySelector("footer"),footNameEl=footEl?footEl.querySelector(".f-name"):null;
if(window.gsap&&!reduceMotion){
  if(window.ScrollTrigger){try{gsap.registerPlugin(ScrollTrigger);}catch(e){}}
  if(footNameEl){
    gsap.set(footNameEl,{opacity:0,y:70,scale:0.96,transformOrigin:"0 100%"});
    footTl=gsap.timeline({paused:true});
    footTl.to(footNameEl,{opacity:1,y:0,scale:1,duration:1,ease:"none"});
  }
  var cBtn=$("contactBtn");
  if(cBtn){
    cBtn.addEventListener("pointerdown",function(){gsap.to(cBtn,{scale:0.965,duration:0.12,ease:"power2.out"});});
    ["pointerup","pointerleave"].forEach(function(ev){cBtn.addEventListener(ev,function(){gsap.to(cBtn,{scale:1,duration:0.3,ease:"power3.out"});});});
  }
}
/* THE CURTAIN — shared one-shot wipe for #data and #contact.
   The clip-path animates each section's inner .curtain-in wrapper, NOT the
   section itself: an element's own clip-path clips its IntersectionObserver
   intersection rect too, so a fully-clipped section would report
   isIntersecting=false forever and its own trigger could never fire (proven
   in the v7 probe). The observer watches the unclipped section; the wrapper
   carries the field and wipes inside it.
   #data sits at the top of #after, so its observer can fire before the chapter
   is on stage; in that case the curtain stays pending and the rAF loop fires
   it the moment chapter 6 is active (see curtainsPending in the loop). */
var curtains=[];
function addCurtain(el,onStart){
  if(!el)return;
  var inner=el.querySelector(".curtain-in")||el;
  if(window.gsap&&!reduceMotion)gsap.set(inner,{clipPath:"inset(100% 0% 0% 0%)"});
  curtains.push({el:el,inner:inner,onStart:onStart||null,fired:false,pending:false});
}
function fireCurtain(c){
  if(c.fired)return;c.fired=true;
  if(window.gsap&&!reduceMotion){
    gsap.to(c.inner,{clipPath:"inset(0% 0% 0% 0%)",duration:0.95,ease:"power4.inOut"});
  }
  if(c.onStart)c.onStart();
}
var curtainIO=new IntersectionObserver(function(es){
  es.forEach(function(e){
    if(!e.isIntersecting)return;
    curtainIO.unobserve(e.target);
    for(var i=0;i<curtains.length;i++){
      if(curtains[i].el===e.target){
        if(cur===6)fireCurtain(curtains[i]);else curtains[i].pending=true;
      }
    }
  });
},{threshold:0.12});
addCurtain($("data"),startDataCounters);
addCurtain($("contact"),null);
curtains.forEach(function(c){curtainIO.observe(c.el);});
function curtainsPending(){
  for(var i=0;i<curtains.length;i++){
    if(curtains[i].pending){curtains[i].pending=false;fireCurtain(curtains[i]);}
  }
}
function footScrub(){
  if(!footTl||!footEl)return;
  var start=footEl.offsetTop-vh(),p=clamp((afterS.cur-start)/(vh()*0.55),0,1);
  footTl.progress(p);
}

/* ================= LENIS (vendored) — wheel layer for the #after chapter =================
   Lenis runs in virtual-scroll mode: its VirtualScroll layer captures wheel
   input and normalises deltaMode (line/page units -> px), and the callback
   feeds the #after sub-scroller target. The callback always returns false, so
   Lenis itself never scrolls the window and never transforms content; the
   final easing to the target stays the engine's own pxStep (.12 lerp), driven
   in the rAF loop which also advances lenis.raf(). Touch and keyboard keep
   the dispatcher's original path; dispatcher wheel events in chapter 6 are
   skipped (see handlers[6]) so nothing is fed twice. Boundaries mirror the
   dispatcher exactly: same |dy|>=8 gate, same wheel lock, scroll-up at the
   very top of #after returns to Flow (chapter 5). */
var lenisAfter=null,lenisTarget=0,lenisFed=false;
if(window.Lenis){
  try{
    lenisAfter=new Lenis({lerp:0.12,smoothWheel:true,autoRaf:false,virtualScroll:function(data){
      if(!data||!data.event||data.event.type!=="wheel")return false;
      if(cur!==6||menuOpen||modalOpen||!loaderDone||busy)return false;
      var dy=data.deltaY,now=performance.now();
      if(Math.abs(dy)<8||now<wheelLockUntil)return false;
      if(dy<0&&afterS.tgt<=0&&lenisTarget<=0){lenisTarget=0;goChapter(5);return false;}
      lenisTarget=clamp(lenisTarget+dy*1.15,0,afterMax());
      lenisFed=true;
      return false;
    }});
  }catch(e){lenisAfter=null;}
}

/* ================= burns: loader / omoi / contact ================= */
var ldBurnCv=$("ldBurn");ldBurnCv.width=192;ldBurnCv.height=108;
var ldBurn=makeBurn(ldBurnCv,[0,0,0],false);
var omBurnCv=$("omoiBurn");omBurnCv.width=192;omBurnCv.height=108;
var omBurn=makeBurn(omBurnCv,[244,242,238],false);
var loaderBurnAnim=null;

/* ================= film grain (12fps, works scenes) ================= */
var grainCtx=grainEl.getContext("2d");grainEl.width=480;grainEl.height=300;var lastGrain=0;
function drawGrain(now){
  var W=480,H=300;
  grainCtx.clearRect(0,0,W,H);
  grainCtx.fillStyle="rgba(0,0,0,"+(0.02+Math.random()*0.05).toFixed(3)+")";
  grainCtx.fillRect(0,0,W,H);
  var n=18+Math.floor(Math.random()*23),i;
  for(i=0;i<n;i++){
    grainCtx.fillStyle=(Math.random()<0.5?"rgba(0,0,0,":"rgba(255,255,255,")+(0.25+Math.random()*0.5).toFixed(2)+")";
    grainCtx.beginPath();grainCtx.arc(Math.random()*W,Math.random()*H,0.3+Math.random()*1.4,0,6.29);grainCtx.fill();
  }
  if(Math.random()<0.18){
    grainCtx.strokeStyle="rgba(0,0,0,0.25)";grainCtx.lineWidth=0.6;grainCtx.beginPath();
    var x=Math.random()*W;grainCtx.moveTo(x,Math.random()*H*0.4);
    grainCtx.bezierCurveTo(x+8,H*0.4,x-8,H*0.6,x+3,H);grainCtx.stroke();
  }
}

/* ================= LOADER: % = min(realLoaded, timeProgress), 2.6s floor, burn exit 1500ms ================= */
var loader=$("loader"),ldnum=$("ldnum");
var imgSrcs=[],seen={};
document.querySelectorAll("img").forEach(function(im){if(im.src&&!seen[im.src]){seen[im.src]=1;imgSrcs.push(im.src);}});
var ldTotal=imgSrcs.length,ldLoaded=0,ldStart=performance.now(),ldShown=1,ldPhase=0;
imgSrcs.forEach(function(s){var im=new Image();im.onload=im.onerror=function(){ldLoaded++;};im.src=s;});
if(!ldTotal)ldLoaded=0;
function loaderStep(now){
  if(ldPhase!==0)return;
  var timed=Math.min(100,Math.floor((now-ldStart)/2600*100));
  var real=ldTotal?Math.floor(ldLoaded/ldTotal*100):100;
  var target=Math.min(real,timed);
  if(target>ldShown)ldShown+=Math.max(1,Math.ceil((target-ldShown)/6));
  if(ldShown>100)ldShown=100;
  ldnum.textContent=ldShown;
  if(ldShown>=100&&target>=100){
    ldPhase=1;
    setTimeout(function(){
      loader.classList.add("burning");
      ldBurnCv.style.display="block";
      loaderBurnAnim={t0:performance.now(),dur:1500};
    },420);
  }
}

/* ================= per-chapter render (also used for the outgoing chapter during an E/F flight) ================= */
function renderChapter(i,now){
  if(i===0){if(heroPetals)heroPetals.draw(0.4+fluid.cur);}
  else if(i===1){pxStep(aboutS);aboutBg.style.transform="translateY("+(-aboutS.cur*0.4)+"px) scale(1.06)";}
  else if(i===2)worksRender();
  else if(i===3){apRender();if(ap.phase===1&&apPetals)apPetals.draw(1);}
  else if(i===4)omoiRender();
  else if(i===5)flRender(now);
  else if(i===6){pxStep(afterS);afterIn.style.transform="translateY("+(-afterS.cur)+"px)";}
}

/* ================= main rAF loop ================= */
function raf(now){
  /* loader */
  loaderStep(now);
  if(loaderBurnAnim){
    var lp=clamp((now-loaderBurnAnim.t0)/loaderBurnAnim.dur,0,1);
    ldBurn.draw(easeIO(lp));
    if(lp>=1){loader.style.display="none";loaderBurnAnim=null;loaderDone=true;ldPhase=2;setHeader();}
  }
  /* hero fluid .05 */
  if(now-fluid.lastMove>1200)fluid.tgt=0.3;
  fluid.cur+=(fluid.tgt-fluid.cur)*0.05;
  /* chapters */
  if(loaderDone||cur===0){
    if(cur===6&&lenisAfter){lenisAfter.raf(now);if(lenisFed){afterS.tgt=lenisTarget;lenisFed=false;}else{lenisTarget=afterS.tgt;}}
    renderChapter(cur,now);
    if(transFrom>=0&&transFrom!==cur)renderChapter(transFrom,now); /* outgoing chapter keeps rendering beneath the flight */
    if(cur===6){
      var foot=afterIn.querySelector("footer");
      var fd=afterS.cur+vh()>foot.offsetTop+140;
      if(fd!==afterFooterDark){afterFooterDark=fd;setHeader();}
      curtainsPending();
      footScrub();
    }
  }
  /* about scalar feeding (accumulates from wheel while in about) */
  /* sub-scrollers */
  if(menuOpen){pxStep(srcS);srcIn.style.transform="translateY("+(-srcS.cur)+"px)";}
  if(modalOpen){pxStep(modalS);modalIn.style.transform="translateY("+(-modalS.cur)+"px)";}
  /* burns */
  if(omoiBurnAnim){
    var op=clamp((now-omoiBurnAnim.t0)/omoiBurnAnim.dur,0,1);
    omBurn.draw(easeIO(op));
    if(op>=1){omoiBurnAnim.cv.style.display="none";omoiBurnAnim=null;}
  }
  /* film grain 12fps over works */
  if(cur===2&&now-lastGrain>=80){lastGrain=now;drawGrain(now);}
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

/* about chapter scalar: feed from its wheel handler via dispatcher hook */
var _aboutHandler=handlers[1];
handlers[1]=function(dy,now){
  aboutS.tgt=clamp(aboutS.tgt+dy*0.05,0,60);
  _aboutHandler(dy,now);
};

addEventListener("resize",function(){
  if(heroPetals)heroPetals.resize();
  if(apPetals)apPetals.resize();
  caseEls.forEach(function(c,i){
    var inner=c.querySelector(".case-txt-in"),box=c.querySelector(".case-txt");
    txtMax[i]=Math.max(0,inner.scrollHeight-box.clientHeight);
  });
});
setHeader();
})();

