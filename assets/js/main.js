/* VELMARA — own JS: loader, clocks, grain canvas, hero change, works pin, modal, counters, reveals, menu, sound toggle UI. */
(function(){
"use strict";
/* Loader counter 0 -> 100 */
var num=document.getElementById('ldnum'),bar=document.getElementById('ldbar'),loader=document.getElementById('loader'),p=0;
var tick=setInterval(function(){p+=Math.random()*13+4;if(p>=100){p=100;clearInterval(tick);setTimeout(function(){loader.classList.add('done');document.querySelector('#hero').classList.add('in');setTimeout(function(){loader.style.display='none';},1100);},250);}num.innerHTML=Math.floor(p)+'<em>%</em>';bar.style.width=p+'%';},90);
/* Clocks + Edo-style hour label */
var hours=[[5,'Hour of the First Stitch'],[7,'Hour of the Loom'],[9,'Hour of the Serpent — fittings begin'],[11,'Hour of the Mirror'],[13,'Hour of the Needle'],[15,'Hour of the Runway Rehearsal'],[17,'Hour of the Golden Light'],[19,'Hour of the Show'],[21,'Hour of the Atelier Lamp'],[23,'Hour of the Final Seam'],[1,'Hour of Quiet Cloth'],[3,'Hour of Deep Thread']];
function clock(){var d=new Date(),s=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});document.querySelectorAll('.js-clock').forEach(function(e){e.textContent=s;});var h=d.getHours(),lab=hours[hours.length-1][1];for(var i=0;i<hours.length;i++){if(h>=hours[i][0])lab=hours[i][1];}['edoHour','edoHour2'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent='The '+lab;});}
clock();setInterval(clock,20000);
/* Hero grain / thread particle canvas (own code) */
var cv=document.getElementById('grain'),ctx=cv.getContext('2d'),W,H,pts=[];
function size(){W=cv.width=cv.offsetWidth;H=cv.height=cv.offsetHeight;}
size();addEventListener('resize',size);
for(var i=0;i<110;i++)pts.push({x:Math.random(),y:Math.random(),s:Math.random()*1.8+.4,v:Math.random()*.0007+.0002,o:Math.random()*.7+.15});
(function draw(){ctx.clearRect(0,0,W,H);pts.forEach(function(q){q.y-=q.v;if(q.y<0)q.y=1;ctx.globalAlpha=q.o;ctx.fillStyle=q.s>1.6?'#d7141a':'#f2f0ec';ctx.fillRect(q.x*W,q.y*H,q.s,q.s*7);});ctx.globalAlpha=1;requestAnimationFrame(draw);})();
/* Change! cycles hero image cluster */
var sets=[['img01.jpg','img03.jpg','img05.jpg'],['img08.jpg','img06.jpg','img12.jpg'],['img04.jpg','img11.jpg','img13.jpg']],cur=0,imgs=document.querySelectorAll('#heroImgs img');
document.getElementById('chgBtn').addEventListener('click',function(){cur=(cur+1)%sets.length;imgs.forEach(function(im,i){im.classList.remove('act');im.src='assets/img/'+sets[cur][i];});setTimeout(function(){imgs[0].classList.add('act');},60);setTimeout(function(){imgs[1].classList.add('act');},220);setTimeout(function(){imgs[2].classList.add('act');},380);});
imgs[1].classList.add('act');imgs[2].classList.add('act');
/* Reveal on scroll */
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.18});
document.querySelectorAll('.fade,section').forEach(function(e){io.observe(e);});
/* Works: pinned horizontal track on desktop */
var pin=document.getElementById('wkPin'),track=document.getElementById('wkTrack'),wkBar=document.getElementById('wkBar'),wkCount=document.getElementById('wkCount');
function works(){if(innerWidth<=768){pin.style.height='auto';return;}pin.style.height='320vh';var r=pin.getBoundingClientRect(),total=pin.offsetHeight-innerHeight,prog=Math.min(1,Math.max(0,-r.top/total)),max=track.scrollWidth-innerWidth+innerWidth*.08;track.style.transform='translateX('+(-prog*max)+'px)';wkBar.style.width=(prog*100)+'%';wkCount.textContent='0'+(Math.min(3,Math.floor(prog*3)+1));}
addEventListener('scroll',function(){requestAnimationFrame(works);},{passive:true});works();
/* Modal */
var cases=[
{img:'assets/img/img06.jpg',cat:'Editorial / Artist Campaign',title:'The resonance of a silhouette',body:'Shot over two days in natural light, the campaign follows one wearer through a city morning. No set, no staging that steps in front of the garment — the clothes carry the story, and the photography simply stays close enough to hear it. The series ran as a print editorial and a digital lookbook, and the featured coat sold out in nine days.'},
{img:'assets/img/img08.jpg',cat:'Strategy / Creative Direction',title:'Read the season, draw the strategy',body:'A full repositioning for an independent label: market reading, a tightened silhouette language, and one visual world carried across garments, packaging, lookbook and film. Within two seasons the label moved from local boutiques to international stockists, with a single recognisable handwriting at every touchpoint.'},
{img:'assets/img/img02.jpg',cat:'E-Commerce / Capsule Drop',title:'Worldview and desire, in one flow',body:'A twelve-piece capsule released as one continuous story — look, detail, fabric note, checkout — with no dead ends between wanting and owning. The drop page was built mobile-first, where most of the audience lives, and the collection sold through at 92% in the first weekend.'}];
var modal=document.getElementById('modal');
document.querySelectorAll('.viewmore').forEach(function(b){b.addEventListener('click',function(){var c=cases[+b.dataset.case];document.getElementById('mImg').src=c.img;document.getElementById('mCat').textContent=c.cat;document.getElementById('mTitle').textContent=c.title;document.getElementById('mBody').textContent=c.body;modal.classList.add('open');});});
document.getElementById('modalClose').addEventListener('click',function(){modal.classList.remove('open');});
modal.addEventListener('click',function(e){if(e.target===modal)modal.classList.remove('open');});
/* Animated counters */
var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;cio.unobserve(e.target);var to=+e.target.dataset.to,t0=null;function step(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/1600);e.target.textContent=Math.floor(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step);}requestAnimationFrame(step);});},{threshold:.5});
document.querySelectorAll('.count').forEach(function(e){cio.observe(e);});
/* Menu overlay */
var menu=document.getElementById('menu');
document.getElementById('menuBtn').addEventListener('click',function(){menu.classList.add('open');});
document.getElementById('menuClose').addEventListener('click',function(){menu.classList.remove('open');});
menu.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){menu.classList.remove('open');});});
/* Sound toggle — UI state only */
var sb=document.getElementById('soundBtn');
sb.addEventListener('click',function(){var on=sb.classList.toggle('on');sb.textContent=on?'SOUND ON':'SOUND OFF';sb.setAttribute('aria-pressed',on);});
})();
