/* VELMARA V3 — own JS. Motion system rebuilt from the mirror study's mechanics:
   no native scroll; ONE wheel/touch/keyboard dispatcher + chapter state machine;
   per-chapter 0..1 / px scalars with chapter lerp weights (.085 works, .12 sub, .05 hero fluid);
   WebGL fbm domain-warp crossfade between chapters; reusable noise burn
   (loader exit, philosophy entry, contact oval); works text gate + breathing locks;
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
var CH_BG=[[0.949,0.941,0.925],[0.051,0.051,0.047],[0.957,0.949,0.933],[1,1,1],[0.36,0.043,0.059],[0.024,0.024,0.024],[1,1,1]];
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

/* ================= WebGL warp crossfade (own GLSL, fullscreen quad) ================= */
var warpCv=$("warp"),warpGL=null,warpU={};
(function initWarp(){
  try{
    var gl=warpCv.getContext("webgl",{alpha:true,antialias:false});
    if(!gl)throw 0;
    function sh(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw 0;return s;}
    var vs="attribute vec2 aP;varying vec2 vUv;void main(){vUv=aP*0.5+0.5;gl_Position=vec4(aP,0.,1.);}";
    var fs=[
"precision highp float;varying vec2 vUv;uniform float uP;uniform float uT;uniform vec3 uColA;uniform vec3 uColB;uniform float uWarp;",
"float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
"float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}",
"float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}",
"void main(){vec2 cuv=vUv;",
"vec2 q=vec2(fbm(cuv*2.2+uT*.04),fbm(cuv*2.2+vec2(5.2,1.3)-uT*.03));",
"vec2 r=vec2(fbm(cuv*3.1+q*1.6+uT*.05),fbm(cuv*3.1+q*1.6+vec2(8.3,2.8)));",
"cuv+=(r-.5)*.07*uWarp*(1.25-cuv.x)+.05*uWarp*vec2(r.y-.5,q.x-.5);",
"float m=smoothstep(0.,1.,uP*1.25-(r.x-.5)*.4-.12);",
"vec3 col=mix(uColA,uColB,m);",
"col+=(q.x-.5)*.05;",
"float a=sin(3.14159*clamp(uP,0.,1.));a=pow(a,.35);",
"gl_FragColor=vec4(col,a);}"
].join("\n");
    var pr=gl.createProgram();
    gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw 0;
    gl.useProgram(pr);
    var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    var loc=gl.getAttribLocation(pr,"aP");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    ["uP","uT","uColA","uColB","uWarp"].forEach(function(n){warpU[n]=gl.getUniformLocation(pr,n);});
    warpGL=gl;
  }catch(e){warpGL=null;}
})();
function sizeWarp(){var d=Math.min(devicePixelRatio,1.5);warpCv.width=Math.floor(innerWidth*d);warpCv.height=Math.floor(innerHeight*d);if(warpGL)warpGL.viewport(0,0,warpCv.width,warpCv.height);}
sizeWarp();
var trans=null; /* {t0,dur,from,to,swapped,onSwap} */
function startWarp(from,to,dur,onSwap){
  if(!warpGL){onSwap();return;}
  sizeWarp();warpCv.style.display="block";
  trans={t0:performance.now(),dur:dur,from:from,to:to,swapped:false,onSwap:onSwap};
  warpGL.uniform3fv(warpU.uColA,CH_BG[from]);warpGL.uniform3fv(warpU.uColB,CH_BG[to]);
  warpGL.uniform1f(warpU.uWarp,1.4);
}
function stepWarp(now){
  if(!trans)return;
  var raw=clamp((now-trans.t0)/trans.dur,0,1),p=easeIO(raw);
  if(raw>=0.5&&!trans.swapped){trans.swapped=true;trans.onSwap();}
  if(warpGL){
    warpGL.uniform1f(warpU.uP,p);warpGL.uniform1f(warpU.uT,now/1000);
    warpGL.clearColor(0,0,0,0);warpGL.clear(warpGL.COLOR_BUFFER_BIT);
    warpGL.drawArrays(warpGL.TRIANGLES,0,3);
  }
  if(raw>=1){warpCv.style.display="none";trans=null;busy=false;}
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
var omoiBurnAnim=null,contactBurnAnim=null;
function onEnter(n,from){
  if(n===4&&from===3){ /* philosophy: burn entry */
    var cv=$("omoiBurn");cv.style.display="block";
    omoiBurnAnim={t0:performance.now(),dur:1700,cv:cv};
  }
  if(n===4&&from===5){omoi.tgt=omoi.total();omoi.cur=omoi.total();omoiRender();}
  if(n===3&&from===4){ap.phase=1;apShowPhase();ap.tgt=ap.total();ap.cur=ap.tgt;}
  if(n===2&&from===3){works.tgt=1;}
  if(n===5&&from===6){fl.phase=1;flShowPhase();fl.tgt=fl.total();fl.cur=fl.tgt;}
  if(n===5){sizeGL();}
  setHeader();
}
function goChapter(n){
  if(busy||n===cur||n<0||n>6||!loaderDone)return;
  busy=true;wheelLockUntil=performance.now()+900;
  var from=cur;
  if(from===2&&n===3)chapters[2].classList.add("exit"); /* works exit: blur + rise */
  startWarp(from,n,from===0?1900:1600,function(){
    chapters[from].classList.remove("act");
    chapters[n].classList.add("act");
    cur=n;onEnter(n,from);
    if(from===2)setTimeout(function(){chapters[2].classList.remove("exit");},60);
  });
  if(!warpGL){busy=false;}
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

/* ================= FLOW (intro + steps px scalar, lerp .12, Three.js wireframes) ================= */
var fl={phase:0,tgt:0,cur:0,total:function(){return vh()*3;},ready:false,curStep:0,xf:null,snap:true,gather:0};
var flSlides=document.querySelectorAll(".fl-slide"),flBar=$("flBar"),flCur=$("flCur"),flWarp=$("flWarp");
function flShowPhase(){
  $("flIntro").classList.toggle("on",fl.phase===0);
  $("flStepsPh").classList.toggle("on",fl.phase===1);
  if(fl.phase===1)fl.snap=true; /* entering the steps: settle instantly on the current step, no crossfade */
  if(fl.phase===0)fl.gather=0; /* particles disperse; they re-gather into the funnel when the steps open */
}
flShowPhase();
function flWheel(dy){
  if(dy>0){
    if(fl.phase===0){fl.phase=1;flShowPhase();sizeGL();return;}
    if(fl.tgt>=fl.total()){goChapter(6);return;}
    fl.tgt=clamp(fl.tgt+dy,0,fl.total());
  }else{
    if(fl.phase===1&&fl.tgt>0){fl.tgt=clamp(fl.tgt+dy,0,fl.total());return;}
    if(fl.phase===1){fl.phase=0;flShowPhase();return;}
    goChapter(4);
  }
}
/* Three.js scene — own clean neon wireframes (exactly ONE per step) + hurricane particle vortex.
   Glow method: every line is drawn 3x — bright core #ff2a1e + two scaled halo shells,
   all additive — over a radial-gradient glow sprite. Layered lines, not a CSS shadow. */
var FL_XFADE=650; /* ms — the ONLY window in which two step objects may both be visible */
function flGlowTexture(){
  var c=document.createElement("canvas");c.width=c.height=128;
  var x=c.getContext("2d"),grd=x.createRadialGradient(64,64,0,64,64,64);
  grd.addColorStop(0,"rgba(255,64,40,.8)");grd.addColorStop(.35,"rgba(215,20,26,.34)");grd.addColorStop(1,"rgba(215,20,26,0)");
  x.fillStyle=grd;x.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function flCircleGeo(r,seg){
  var pts=[],i,a;
  for(i=0;i<seg;i++){a=i/seg*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,0));}
  return new THREE.BufferGeometry().setFromPoints(pts);
}
function flLinePair(geo,loop,mats){
  var holder=new THREE.Group();
  var defs=[
    {s:1,   col:0xff2a1e,key:"core", f:1},
    {s:1.02,col:0xff5030,key:"shell",f:0.32},
    {s:1.05,col:0xd7141a,key:"shell",f:0.14}
  ];
  defs.forEach(function(d){
    var m=new THREE.LineBasicMaterial({color:d.col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
    m.userData.f=d.f;
    var o=loop?new THREE.LineLoop(geo,m):new THREE.LineSegments(geo,m);
    o.scale.setScalar(d.s);
    mats[d.key].push(m);holder.add(o);
  });
  return holder;
}
function flStepGroup(glowTex){
  var g=new THREE.Group();
  g.userData.mats={core:[],shell:[]};
  var sm=new THREE.SpriteMaterial({map:glowTex,color:0xff2418,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  var spr=new THREE.Sprite(sm);spr.scale.set(9.5,9.5,1);g.add(spr);
  g.userData.glow=sm;
  return g;
}
function flSetGroupOp(g,o){
  g.userData.mats.core.forEach(function(mm){mm.opacity=o*mm.userData.f;});
  g.userData.mats.shell.forEach(function(mm){mm.opacity=o*mm.userData.f;});
  g.userData.glow.opacity=o*0.5;
  g.visible=o>0.004;
}
function initGL(){
  if(!window.THREE)return;
  try{
    var cv=$("flGl");
    var renderer=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    var scene=new THREE.Scene();
    var cam=new THREE.PerspectiveCamera(46,1,0.1,100);cam.position.set(0,0,9);
    var glowTex=flGlowTexture();
    var groups=[],g,i,h;
    /* STEP 1 — clean cube: outer + inner box edges, two ribbon bands */
    g=flStepGroup(glowTex);
    g.add(flLinePair(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.6,2.6,2.6)),false,g.userData.mats));
    g.add(flLinePair(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.35,1.35,1.35)),false,g.userData.mats));
    g.add(flLinePair(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.68,0.55,2.68)),false,g.userData.mats));
    g.add(flLinePair(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55,2.68,2.68)),false,g.userData.mats));
    scene.add(g);groups.push(g);
    /* STEP 2 — concentric circular arches: three flat rings + two tilted */
    g=flStepGroup(glowTex);
    [2.4,1.9,1.4].forEach(function(r){g.add(flLinePair(flCircleGeo(r,96),true,g.userData.mats));});
    h=flLinePair(flCircleGeo(2.4,96),true,g.userData.mats);h.rotation.x=0.9;g.add(h);
    h=flLinePair(flCircleGeo(1.9,96),true,g.userData.mats);h.rotation.y=0.9;g.add(h);
    scene.add(g);groups.push(g);
    /* STEP 3 — sphere of intersecting great circles (rings only, no mesh) */
    g=flStepGroup(glowTex);
    [[0,0,0],[0,Math.PI/3,0],[0,2*Math.PI/3,0],[Math.PI/2.4,Math.PI/5,0],[-Math.PI/2.4,Math.PI/5,0],[Math.PI/2,0,Math.PI/3]].forEach(function(rr){
      var hh=flLinePair(flCircleGeo(2.05,96),true,g.userData.mats);hh.rotation.set(rr[0],rr[1],rr[2]);g.add(hh);
    });
    scene.add(g);groups.push(g);
    /* STEP 4 — concentric ring tunnel + longitudinal rails (rings travel toward viewer) */
    g=flStepGroup(glowTex);
    var tunnelRings=[];
    for(i=0;i<8;i++){h=flLinePair(flCircleGeo(2.15,96),true,g.userData.mats);h.position.z=1.4-i*1.05;g.add(h);tunnelRings.push(h);}
    var railPts=[];
    [[2.15,0],[-2.15,0],[0,2.15],[0,-2.15]].forEach(function(p){
      railPts.push(new THREE.Vector3(p[0],p[1],1.4));
      railPts.push(new THREE.Vector3(p[0],p[1],1.4-7*1.05));
    });
    g.add(flLinePair(new THREE.BufferGeometry().setFromPoints(railPts),false,g.userData.mats));
    g.userData.rings=tunnelRings;
    scene.add(g);groups.push(g);
    /* HURRICANE — GPU point vortex (study counts: 15,000 desktop / 6,000 mobile).
       The PARTICLES are the effect: they gather from a scattered cloud into a
       tornado funnel and keep swirling inside it — shell-concentrated points on a
       funnel profile (wide top, narrow waist, slight base flare), angle growing
       with time AND depth (helical twist), spin faster where the funnel tightens,
       axial flow downward, axis sweeping from top-right to bottom-centre. */
    var N=window.innerWidth<820?6000:15000;
    var pos=new Float32Array(N*3),aH=new Float32Array(N),aAng=new Float32Array(N),aRad=new Float32Array(N),aSpd=new Float32Array(N),aSize=new Float32Array(N);
    for(i=0;i<N;i++){
      aH[i]=Math.random();aAng[i]=Math.random()*6.2832;
      aRad[i]=Math.pow(Math.random(),0.35); /* biased to the funnel shell, not the volume */
      aSpd[i]=0.6+Math.random()*0.9;aSize[i]=0.7+Math.random()*0.9;
    }
    var pg=new THREE.BufferGeometry();
    pg.setAttribute("position",new THREE.BufferAttribute(pos,3));
    pg.setAttribute("aH",new THREE.BufferAttribute(aH,1));
    pg.setAttribute("aAng",new THREE.BufferAttribute(aAng,1));
    pg.setAttribute("aRad",new THREE.BufferAttribute(aRad,1));
    pg.setAttribute("aSpd",new THREE.BufferAttribute(aSpd,1));
    pg.setAttribute("aSize",new THREE.BufferAttribute(aSize,1));
    var pm=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uT:{value:0},uPR:{value:Math.min(devicePixelRatio,2)},uG:{value:0}},
      vertexShader:[
        "attribute float aH;attribute float aAng;attribute float aRad;attribute float aSpd;attribute float aSize;",
        "uniform float uT;uniform float uPR;uniform float uG;varying float vA;",
        "void main(){",
        " float h=fract(aH+uT*0.045*aSpd);",
        " float ang=aAng+uT*(0.7+0.8*aSpd)*(0.75+0.85*h)+h*5.3;",
        " float fr=0.5+2.9*pow(1.0-h,2.0);",
        " fr+=0.55*pow(clamp((h-0.86)/0.14,0.0,1.0),2.0);",
        " float rad=fr*(0.7+0.3*aRad);",
        " float axisX=mix(1.9,-0.3,h);",
        " vec3 funnel=vec3(axisX+cos(ang)*rad,mix(4.7,-4.7,h),sin(ang)*rad*0.85-0.4);",
        " vec3 scat=vec3((aRad-0.5)*11.0+sin(uT*0.3+aAng)*0.25,(fract(aH*7.31)-0.5)*9.0,-2.0-aRad*2.0);",
        " vec3 p=mix(scat,funnel,uG);",
        " vec4 mv=modelViewMatrix*vec4(p,1.0);",
        " gl_Position=projectionMatrix*mv;",
        " vA=smoothstep(0.0,0.13,h)*smoothstep(1.0,0.87,h)*(0.5+0.5*aRad)*(0.35+0.65*uG);",
        " gl_PointSize=aSize*uPR*(22.0/max(1.0,-mv.z));",
        "}"
      ].join("\n"),
      fragmentShader:[
        "varying float vA;",
        "void main(){vec2 d=gl_PointCoord-vec2(0.5);float a=smoothstep(0.5,0.06,length(d));gl_FragColor=vec4(0.96,0.95,0.93,a*vA*0.8);}"
      ].join("\n")
    });
    var vortex=new THREE.Points(pg,pm);vortex.frustumCulled=false;
    scene.add(vortex);
    groups.forEach(function(gg){flSetGroupOp(gg,0);});
    fl.ready=true;fl.renderer=renderer;fl.scene=scene;fl.cam=cam;fl.groups=groups;fl.vortex=pm;fl.cv=cv;
  }catch(e){fl.ready=false;}
}
initGL();
function sizeGL(){if(!fl.ready)return;var w=fl.cv.offsetWidth,h=fl.cv.offsetHeight;if(!w||!h)return;fl.renderer.setSize(w,h,false);fl.cam.aspect=w/h;fl.cam.updateProjectionMatrix();}
sizeGL();
function flRender(now){
  now=now||performance.now();
  var s={tgt:fl.tgt,cur:fl.cur};pxStep(s);fl.cur=s.cur;
  var prog=fl.total()?fl.cur/fl.total():0,ff=clamp(prog*3,0,3),desired=Math.round(ff);
  flBar.style.width=(prog*100)+"%";
  var wprog=clamp((prog-0.93)/0.07,0,1);
  flWarp.style.opacity=String(wprog);
  flWarp.querySelectorAll("i").forEach(function(el,i){el.style.transform="scale("+(1+wprog*(i+1)*0.55)+") rotate("+(wprog*6)+"deg)";});
  if(fl.snap){
    fl.xf=null;fl.curStep=desired;
    flSlides.forEach(function(sl,i){sl.classList.toggle("act",i===fl.curStep);});
    flCur.textContent="0"+(fl.curStep+1);
    if(fl.ready)fl.groups.forEach(function(g,i){flSetGroupOp(g,i===fl.curStep?1:0);});
    fl.snap=false;
  }
  if(fl.ready&&fl.phase===1){
    sizeGL();
    /* step switching = one discrete 650ms crossfade; outside it exactly ONE object is visible */
    if(!fl.xf&&desired!==fl.curStep){
      fl.xf={from:fl.curStep,to:desired,t0:now,swapped:false};
      flSlides[fl.curStep].classList.remove("act");
    }
    if(fl.xf){
      var k=clamp((now-fl.xf.t0)/FL_XFADE,0,1),e=easeIO(k);
      flSetGroupOp(fl.groups[fl.xf.from],1-e);
      flSetGroupOp(fl.groups[fl.xf.to],e);
      if(k>=0.5&&!fl.xf.swapped){
        fl.xf.swapped=true;fl.curStep=fl.xf.to;
        flSlides[fl.curStep].classList.add("act");
        flCur.textContent="0"+(fl.curStep+1);
      }
      if(k>=1){flSetGroupOp(fl.groups[fl.xf.from],0);flSetGroupOp(fl.groups[fl.xf.to],1);fl.xf=null;}
    }
    /* place + spin visible object(s): fixed on the side OPPOSITE their text column, never travelling */
    var aspect=fl.cam.aspect||1.6;
    var portrait=aspect<0.9;
    var offX=portrait?0:(aspect<1.3?1.95:2.55);
    var baseScale=portrait?0.66:1;
    fl.groups.forEach(function(g,i){
      if(!g.visible)return;
      if(portrait){g.position.set(0,1.85,-0.5);}
      else{g.position.set((i%2===0?1:-1)*offX,0,0);}
      g.scale.setScalar(baseScale);
      g.rotation.y+=0.0038;
      g.rotation.x=Math.sin(now*0.00035+i*1.7)*0.22;
      if(g.userData.rings){
        var travel=(now*0.0006)%(8*1.05);
        g.userData.rings.forEach(function(r,j){r.position.z=-7+((j*1.05+travel)%(8*1.05));});
      }
    });
    if(fl.vortex){
      fl.vortex.uniforms.uT.value=now/1000;
      fl.gather+=(1-fl.gather)*0.03; /* ease the cloud into the funnel over ~1.5s */
      fl.vortex.uniforms.uG.value=fl.gather;
    }
    fl.renderer.render(fl.scene,fl.cam);
  }
}

/* ================= chapter wheel handlers ================= */
var handlers=[
  function(dy){ if(dy>0)goChapter(1); },
  function(dy){ if(dy>0)goChapter(2); else goChapter(0); },
  worksWheel,
  apWheel,
  omoiWheel,
  flWheel,
  function(dy){
    if(dy<0&&afterS.tgt<=0){goChapter(5);return;}
    afterS.tgt=clamp(afterS.tgt+dy*1.15,0,afterMax());
  }
];

/* ================= ONE master dispatcher ================= */
var menuOpen=false;
function dispatch(dy){
  var now=performance.now();
  if(menuOpen){ if(Math.abs(dy)>=2)srcS.tgt=clamp(srcS.tgt+clamp(dy,-160,160),0,srcMax()); return; }
  if(modalOpen){ if(Math.abs(dy)>=2)modalS.tgt=clamp(modalS.tgt+dy*0.6,0,modalMax()); return; }
  if(!loaderDone||busy)return;
  if(Math.abs(dy)<8)return;
  if(now<wheelLockUntil)return;
  handlers[cur](dy,now);
}
addEventListener("wheel",function(e){
  e.preventDefault();
  dispatch(e.deltaY);
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
var soundBtn=$("soundBtn");
soundBtn.addEventListener("click",function(){
  var on=soundBtn.getAttribute("aria-pressed")==="true";
  soundBtn.setAttribute("aria-pressed",String(!on));
  soundBtn.textContent=!on?"SOUND ON":"SOUND OFF";
  soundBtn.classList.toggle("off",on);
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

/* ================= reveals + counters (after chapter) ================= */
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});},{threshold:0.2});
document.querySelectorAll("#after .fade").forEach(function(e){io.observe(e);});
var cio=new IntersectionObserver(function(es){es.forEach(function(e){
  if(!e.isIntersecting)return;cio.unobserve(e.target);
  var to=+e.target.getAttribute("data-to"),t0=null;
  (function step(ts){if(!t0)t0=ts;var k=clamp((ts-t0)/1600,0,1);e.target.textContent=Math.floor(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step);})(performance.now());
});},{threshold:0.4});
document.querySelectorAll(".count").forEach(function(e){cio.observe(e);});
var bio=new IntersectionObserver(function(es){es.forEach(function(e){
  if(e.isIntersecting&&!contactBurnAnim){contactBurnAnim={t0:performance.now(),dur:1700};bio.disconnect();}
});},{threshold:0.4});
bio.observe(document.querySelector(".burn-oval"));

/* ================= burns: loader / omoi / contact ================= */
var ldBurnCv=$("ldBurn");ldBurnCv.width=192;ldBurnCv.height=108;
var ldBurn=makeBurn(ldBurnCv,[0,0,0],false);
var omBurnCv=$("omoiBurn");omBurnCv.width=192;omBurnCv.height=108;
var omBurn=makeBurn(omBurnCv,[244,242,238],false);
var ctBurnCv=$("contactBurn");ctBurnCv.width=120;ctBurnCv.height=76;
var ctBurn=makeBurn(ctBurnCv,[255,255,255],true);
ctBurn.draw(0);
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

/* ================= main rAF loop ================= */
function raf(now){
  /* loader */
  loaderStep(now);
  if(loaderBurnAnim){
    var lp=clamp((now-loaderBurnAnim.t0)/loaderBurnAnim.dur,0,1);
    ldBurn.draw(easeIO(lp));
    if(lp>=1){loader.style.display="none";loaderBurnAnim=null;loaderDone=true;ldPhase=2;setHeader();}
  }
  /* warp transition */
  stepWarp(now);
  /* hero fluid .05 */
  if(now-fluid.lastMove>1200)fluid.tgt=0.3;
  fluid.cur+=(fluid.tgt-fluid.cur)*0.05;
  /* chapters */
  if(loaderDone||cur===0){
    if(cur===0&&heroPetals)heroPetals.draw(0.4+fluid.cur);
    if(cur===1){pxStep(aboutS);aboutBg.style.transform="translateY("+(-aboutS.cur*0.4)+"px) scale(1.06)";}
    if(cur===2)worksRender();
    if(cur===3){apRender();if(ap.phase===1&&apPetals)apPetals.draw(1);}
    if(cur===4)omoiRender();
    if(cur===5)flRender(now);
    if(cur===6){
      pxStep(afterS);
      afterIn.style.transform="translateY("+(-afterS.cur)+"px)";
      var foot=afterIn.querySelector("footer");
      var fd=afterS.cur+vh()>foot.offsetTop+140;
      if(fd!==afterFooterDark){afterFooterDark=fd;setHeader();}
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
  if(contactBurnAnim){
    var cp=clamp((now-contactBurnAnim.t0)/contactBurnAnim.dur,0,1);
    ctBurn.draw(easeIO(cp));
    if(cp>=1)contactBurnAnim=null;
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
  sizeGL();sizeWarp();
  caseEls.forEach(function(c,i){
    var inner=c.querySelector(".case-txt-in"),box=c.querySelector(".case-txt");
    txtMax[i]=Math.max(0,inner.scrollHeight-box.clientHeight);
  });
});
setHeader();
})();

