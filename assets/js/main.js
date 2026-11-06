/* VELMARA V2 — own JS: loader, Tokyo clocks + traditional hours, eased smooth-scroll
   engine, petal canvases, hero Change!, menu, pinned works / approach / flow,
   burning-paper reveal, counters, Three.js red wireframe flow objects, modal. */
(function(){
"use strict";
var isMobile=function(){return window.innerWidth<=760;};
var clamp=function(v,a,b){return Math.min(b,Math.max(a,v));};

/* ---------- Tokyo clock + traditional hour ---------- */
var HOURS=[[23,"Rat","子ノ刻"],[1,"Ox","丑ノ刻"],[3,"Tiger","寅ノ刻"],[5,"Rabbit","卯ノ刻"],[7,"Dragon","辰ノ刻"],[9,"Serpent","巳ノ刻"],[11,"Horse","午ノ刻"],[13,"Goat","未ノ刻"],[15,"Monkey","申ノ刻"],[17,"Rooster","酉ノ刻"],[19,"Dog","戌ノ刻"],[21,"Boar","亥ノ刻"]];
function tokyoNow(){try{return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Tokyo"}));}catch(e){return new Date();}}
function clock(){
  var d=tokyoNow(),hh=("0"+d.getHours()).slice(-2),mm=("0"+d.getMinutes()).slice(-2);
  document.querySelectorAll(".js-clock").forEach(function(e){e.textContent=hh+":"+mm;});
  var h=d.getHours(),name="Boar",jp="亥ノ刻";
  for(var i=0;i<HOURS.length;i++){var start=HOURS[i][0];var end=(start+2)%24;var inside=end>start?(h>=start&&h<end):(h>=start||h<end);if(inside){name=HOURS[i][1];jp=HOURS[i][2];break;}}
  var label="The Hour of the "+name+" — "+jp;
  document.querySelectorAll(".js-hour").forEach(function(e){e.textContent=label;});
}
clock();setInterval(clock,15000);

/* ---------- Loader ---------- */
var loader=document.getElementById("loader"),ldnum=document.getElementById("ldnum"),p=0;
var tick=setInterval(function(){
  p+=Math.random()*11+5;
  if(p>=100){p=100;clearInterval(tick);
    setTimeout(function(){loader.classList.add("done");setTimeout(function(){loader.style.display="none";},1200);},300);}
  ldnum.textContent=Math.floor(p);
},85);

/* ---------- Eased smooth-scroll value (drives all pins) ---------- */
var smoothY=window.scrollY;
(function raf(){
  smoothY+=(window.scrollY-smoothY)*0.085;
  if(Math.abs(window.scrollY-smoothY)<0.05)smoothY=window.scrollY;
  onScrollFrame(smoothY);
  requestAnimationFrame(raf);
})();

/* ---------- Header theme + letterhead ---------- */
var header=document.getElementById("siteHeader");
var themed=[].slice.call(document.querySelectorAll("[data-theme]"));
function headerState(){
  var probe=window.scrollY+90,dark=false,light=false;
  for(var i=0;i<themed.length;i++){
    var el=themed[i],t=docTop(el);
    if(probe>=t&&probe<t+el.offsetHeight){dark=el.getAttribute("data-theme")==="dark";light=!dark;break;}
  }
  header.classList.toggle("on-dark",dark);
  header.classList.toggle("show-letter",light);
}
function docTop(el){var y=0;while(el){y+=el.offsetTop;el=el.offsetParent;}return y;}

/* ---------- Menu ---------- */
var menu=document.getElementById("menu");
function openMenu(){menu.classList.add("open");menu.setAttribute("aria-hidden","false");}
function closeMenu(){menu.classList.remove("open");menu.setAttribute("aria-hidden","true");}
document.getElementById("menuBtn").addEventListener("click",openMenu);
document.getElementById("footMenuBtn").addEventListener("click",openMenu);
document.getElementById("menuClose").addEventListener("click",closeMenu);
menu.querySelectorAll("a").forEach(function(a){a.addEventListener("click",closeMenu);});

/* ---------- Sound toggle (UI) ---------- */
var soundBtn=document.getElementById("soundBtn");
soundBtn.addEventListener("click",function(){
  var on=soundBtn.textContent.indexOf("ON")>-1&&soundBtn.getAttribute("aria-pressed")==="true";
  soundBtn.setAttribute("aria-pressed",String(!on));
  soundBtn.textContent=!on?"SOUND ON":"SOUND OFF";
  soundBtn.classList.toggle("off",!!on);
});

/* ---------- Petal canvases (own code) ---------- */
function petalField(cvId,count,area){
  var cv=document.getElementById(cvId);if(!cv)return null;
  var ctx=cv.getContext("2d"),W=0,H=0,ps=[];
  function size(){W=cv.width=cv.offsetWidth;H=cv.height=cv.offsetHeight;}
  size();
  for(var i=0;i<count;i++)ps.push({x:Math.random(),y:Math.random(),s:Math.random()*9+5,vy:Math.random()*.00045+.00018,vx:(Math.random()-.5)*.00022,rot:Math.random()*6.28,vr:(Math.random()-.5)*.008,o:Math.random()*.45+.25});
  return {draw:function(){
    if(!W||cv.offsetParent===null&&cv.offsetWidth===0)return;
    var r=cv.getBoundingClientRect();
    if(r.bottom<0||r.top>innerHeight)return;
    ctx.clearRect(0,0,W,H);
    ps.forEach(function(q){
      q.y+=q.vy;q.x+=q.vx+Math.sin(q.y*9+q.rot)*.00012;q.rot+=q.vr;
      if(q.y>1.03){q.y=-.03;q.x=Math.random();}
      ctx.save();ctx.translate(q.x*W,q.y*H);ctx.rotate(q.rot);ctx.globalAlpha=q.o;ctx.fillStyle="#d7141a";
      ctx.beginPath();ctx.ellipse(0,0,q.s,q.s*.55,0,0,6.29);ctx.fill();ctx.restore();
    });
    ctx.globalAlpha=1;
  },resize:size};
}
var heroPetals=petalField("petals",26);
var apPetals=petalField("apPetals",20);

/* ---------- Hero Change! ---------- */
var arts=document.querySelectorAll("#heroFrame .art"),cur=0;
document.getElementById("chgBtn").addEventListener("click",function(){
  arts[cur].classList.remove("act");cur=(cur+1)%arts.length;arts[cur].classList.add("act");
});

/* ---------- Reveals + counters + burn ---------- */
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});},{threshold:.2});
document.querySelectorAll(".fade").forEach(function(e){io.observe(e);});
var cio=new IntersectionObserver(function(es){es.forEach(function(e){
  if(!e.isIntersecting)return;cio.unobserve(e.target);
  var to=+e.target.getAttribute("data-to"),t0=null;
  (function step(ts){if(!t0)t0=ts;var k=clamp((ts-t0)/1600,0,1);e.target.textContent=Math.floor(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step);})(performance.now());
});},{threshold:.4});
document.querySelectorAll(".count").forEach(function(e){cio.observe(e);});
var bio=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){document.getElementById("omoi").classList.add("burnt");bio.disconnect();}});},{threshold:.3});
bio.observe(document.getElementById("omoi"));

/* ---------- Pin sections: heights (desktop) ---------- */
var works=document.getElementById("works"),apSteps=document.getElementById("apSteps"),flow=document.getElementById("flow");
function setHeights(){
  if(isMobile()){works.style.height="";apSteps.style.height="";flow.style.height="460vh";return;}
  works.style.height="340vh";apSteps.style.height="300vh";flow.style.height="540vh";
}
setHeights();

/* ---------- Three.js flow scene (own wireframes) ---------- */
var fl={ready:false};
function initGL(){
  if(!window.THREE)return;
  try{
    var cv=document.getElementById("flGl");
    var renderer=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    var scene=new THREE.Scene();
    var cam=new THREE.PerspectiveCamera(46,1,.1,100);cam.position.set(0,0,9);
    var red=new THREE.LineBasicMaterial({color:0xff2a30,transparent:true});
    var redMesh=new THREE.MeshBasicMaterial({color:0xd7141a,wireframe:true,transparent:true});
    var groups=[];
    /* step 1 — cube */
    var g0=new THREE.Group();
    g0.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.7,2.7,2.7)),red));
    g0.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5,1.5,1.5)),red));
    scene.add(g0);groups.push(g0);
    /* step 2 — circular arches */
    var g1=new THREE.Group();
    for(var i=0;i<3;i++){var t=new THREE.Mesh(new THREE.TorusGeometry(1.9,.34,8,42),redMesh);t.rotation.set(i*1.05,i*.7,0);g1.add(t);}
    scene.add(g1);groups.push(g1);
    /* step 3 — intersecting-circle sphere */
    var g2=new THREE.Group();
    g2.add(new THREE.Mesh(new THREE.SphereGeometry(1.85,20,14),redMesh));
    var r1=new THREE.Mesh(new THREE.TorusGeometry(2.35,.05,6,60),redMesh);r1.rotation.x=1.1;g2.add(r1);
    var r2=new THREE.Mesh(new THREE.TorusGeometry(2.35,.05,6,60),redMesh);r2.rotation.y=1.1;g2.add(r2);
    scene.add(g2);groups.push(g2);
    /* step 4 — concentric ring tunnel */
    var g3=new THREE.Group();
    for(var j=0;j<7;j++){var ring=new THREE.Mesh(new THREE.TorusGeometry(1.5+j*.3,.05,6,48),redMesh);ring.position.z=-j*1.15;g3.add(ring);}
    scene.add(g3);groups.push(g3);
    /* white particle cone */
    var N=900,pos=new Float32Array(N*3);
    for(var k=0;k<N;k++){var tt=Math.random(),yy=(tt-.5)*9.5,rr=tt*3.4*Math.sqrt(Math.random()),th=Math.random()*6.283;pos[k*3]=rr*Math.cos(th);pos[k*3+1]=yy;pos[k*3+2]=rr*Math.sin(th)-1;}
    var pg=new THREE.BufferGeometry();pg.setAttribute("position",new THREE.BufferAttribute(pos,3));
    var cone=new THREE.Points(pg,new THREE.PointsMaterial({color:0xffffff,size:.045,transparent:true,opacity:.75}));
    scene.add(cone);
    fl={ready:true,renderer:renderer,scene:scene,cam:cam,groups:groups,cone:cone,cv:cv};
  }catch(e){fl.ready=false;}
}
initGL();
function sizeGL(){if(!fl.ready)return;var w=fl.cv.offsetWidth,h=fl.cv.offsetHeight;if(!w||!h)return;fl.renderer.setSize(w,h,false);fl.cam.aspect=w/h;fl.cam.updateProjectionMatrix();}
sizeGL();

/* ---------- Per-frame scroll work ---------- */
var wkTrack=document.getElementById("wkTrack"),wkBar=document.getElementById("wkBar"),wkCur=document.getElementById("wkCur"),wkCollage=document.getElementById("wkCollage");
var apTrack=document.getElementById("apTrack"),apDots=document.querySelectorAll(".ap-dots i"),apArc=document.querySelector(".ap-arc");
var flSlides=document.querySelectorAll(".fl-slide"),flBar=document.getElementById("flBar"),flCur=document.getElementById("flCur"),flWarp=document.getElementById("flWarp");
var lastFlowFloat=0;
function pinProgress(el,y){var t=docTop(el),total=el.offsetHeight-innerHeight;if(total<=0)return 0;return clamp((y-t)/total,0,1);}
function onScrollFrame(y){
  headerState();
  if(heroPetals)heroPetals.draw();
  if(apPetals)apPetals.draw();
  if(!isMobile()){
    var wp=pinProgress(works,y);
    wkTrack.style.transform="translateX("+(-wp*2*innerWidth)+"px)";
    var phase=wp*2,d=Math.abs(phase-Math.round(phase));
    wkTrack.style.filter="blur("+(d*9).toFixed(1)+"px)";
    wkCollage.style.transform="translateX("+(-wp*16)+"vw)";
    wkBar.style.width=(wp*100)+"%";
    wkCur.textContent="0"+(wp>=.999?3:Math.floor(wp*3)+1);
    var ap=pinProgress(apSteps,y);
    apTrack.style.transform="translateX("+(-ap*2*innerWidth)+"px)";
    var ai=Math.min(2,Math.round(ap*2));
    apDots.forEach(function(dt,i){dt.classList.toggle("on",i<=ai);});
    if(apArc)apArc.style.transform="translateY(-50%) rotate("+(ap*40)+"deg)";
  }
  /* flow (all widths) */
  var fp=pinProgress(flow,y),ff=fp*3.999,active=Math.min(3,Math.round(ff));
  flSlides.forEach(function(s,i){s.classList.toggle("act",i===active);});
  flBar.style.width=(fp*100)+"%";
  flCur.textContent="0"+(active+1);
  lastFlowFloat=ff;
  var wprog=clamp((fp-.93)/.07,0,1);
  flWarp.style.opacity=String(wprog);
  flWarp.querySelectorAll("i").forEach(function(el,i){el.style.transform="scale("+(1+wprog*(i+1)*.55)+") rotate("+(wprog*6)+"deg)";});
  /* three render when flow near */
  if(fl.ready){
    var r=flow.getBoundingClientRect();
    if(r.top<innerHeight&&r.bottom>0){
      sizeGL();
      fl.groups.forEach(function(g,i){
        var s=clamp(1-Math.abs(ff-i),0,1);
        g.visible=s>.02;
        var targetX=(i%2===0?2.7:-2.7);
        g.position.x+= (targetX-g.position.x)*.08;
        g.scale.setScalar(.55+.45*s);
        g.rotation.y+=.004+s*.006;g.rotation.x+=.002;
        g.traverse(function(o){if(o.material)o.material.opacity=.25+.75*s;});
      });
      fl.cone.rotation.y+=.0016;
      fl.renderer.render(fl.scene,fl.cam);
    }
  }
}

/* ---------- Modal ---------- */
var cases=[
{img:"assets/img/img06.jpg",cat:"Official Campaign / Artist Experience",title:"Carrying the resonance of music, worn untouched.",body:"Shot over two days in natural light, the campaign follows one wearer the way a recital follows a single note — nothing staged steps in front of the garment. The series ran as a print editorial and a digital lookbook, and the featured coat sold out in nine days."},
{img:"assets/img/img08.jpg",cat:"Strategy / Creative Direction",title:"Read the season, draw the strategy for growth.",body:"We read the market and shaped the label's direction for three seasons ahead — one design language running through garments, packaging, lookbooks and film, so every touchpoint a customer meets delivers the same world, and the same promise."},
{img:"assets/img/img02.jpg",cat:"EC Site / Capsule Drop",title:"Worldview and desire, in one seamless flow.",body:"A capsule drop built as a single flow: atmosphere first, friction nowhere. From the first look to checkout the path stays inside the collection's world — and balances empathy for the brand with hard results at the till."}
];
var modal=document.getElementById("modal");
document.querySelectorAll(".viewmore").forEach(function(b){
  b.addEventListener("click",function(){
    var c=cases[+b.getAttribute("data-case")];
    document.getElementById("mImg").src=c.img;
    document.getElementById("mCat").textContent=c.cat;
    document.getElementById("mTitle").textContent=c.title;
    document.getElementById("mBody").textContent=c.body;
    modal.classList.add("open");
  });
});
document.getElementById("modalClose").addEventListener("click",function(){modal.classList.remove("open");});
modal.addEventListener("click",function(e){if(e.target===modal)modal.classList.remove("open");});

addEventListener("resize",function(){setHeights();if(heroPetals)heroPetals.resize();if(apPetals)apPetals.resize();sizeGL();});
})();
