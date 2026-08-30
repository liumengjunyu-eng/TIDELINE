// 临时诊断：逐秒打印新手局(seed 101)的血量 / 交火敌人数 / 最近敌人距离 / 每秒受伤
const fs=require("fs"),path=require("path"),vm=require("vm");
const HTML=path.join(__dirname,"..","..","web","index.html");
const html=fs.readFileSync(HTML,"utf8");
const blocks=html.match(/<script>([\s\S]*?)<\/script>/g);
const SRC=blocks[blocks.length-1].replace(/^<script>/,"").replace(/<\/script>$/,"");
function fakeCtx(){const noop=()=>{},g={addColorStop:noop};return new Proxy({},{get(t,k){if(k==="createLinearGradient"||k==="createRadialGradient")return()=>g;if(k==="measureText")return()=>({width:10});if(k==="canvas")return{width:1280,height:720};if(k in t)return t[k];return noop;},set(t,k,v){t[k]=v;return true;}});}
function fakeEl(){return{textContent:"",innerHTML:"",style:{},dataset:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},addEventListener:()=>{},getContext:()=>fakeCtx(),querySelectorAll:()=>[],width:1280,height:720,click:()=>{}};}
const els={},store={};
const sandbox={console,performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,setTimeout,clearTimeout,localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},document:{getElementById:id=>els[id]||(els[id]=fakeEl()),createElement:()=>fakeEl(),querySelectorAll:()=>[],addEventListener:()=>{}},window:{innerWidth:1280,innerHeight:720,devicePixelRatio:1,addEventListener:()=>{}},Blob:function(){},URL:{createObjectURL:()=>"",revokeObjectURL:()=>{}}};
sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(SRC,sandbox);
const ev=e=>vm.runInContext(e,sandbox);
const run=s=>vm.runInContext(s,sandbox);
run(`window.__step=function(dt){const P=PlayerMission;if(TideMission.graceActive())return;const en=[];Mission.entities.scavs.forEach(e=>{if(e.state!=='DEAD')en.push(e);});Mission.entities.drones.forEach(e=>{if(e.state!=='DEAD')en.push(e);});if(Mission.entities.warden&&Mission.entities.warden.state!=='DEAD')en.push(Mission.entities.warden);let nd=1e9,ne=null;for(const e of en){const d=Math.hypot(e.pos.x-P.pos.x,e.pos.z-P.pos.z);if(d<nd){nd=d;ne=e;}}let tx,tz;if(BackPack.items.length<1){let best=null,bd=1e9;for(const it of LootSystem.items){if(it.taken)continue;const d=Math.hypot(it.pos.x-P.pos.x,it.pos.z-P.pos.z);if(d<bd){bd=d;best=it;}}if(best){tx=best.pos.x;tz=best.pos.z;}else{tx=-27;tz=0;}}else{let best=null,bd=1e9;for(const p of Extraction.active()){const d=Math.hypot(p.pos.x-P.pos.x,p.pos.z-P.pos.z);if(d<bd){bd=d;best=p;}}if(best){tx=best.pos.x;tz=best.pos.z;}else{tx=17;tz=12;}}let dx=tx-P.pos.x,dz=tz-P.pos.z,L=Math.hypot(dx,dz)||1;dx/=L;dz/=L;if(ne&&nd<12){const fx=P.pos.x-ne.pos.x,fz=P.pos.z-ne.pos.z,fl=Math.hypot(fx,fz)||1;dx=dx*0.25+(fx/fl)*0.75;dz=dz*0.25+(fz/fl)*0.75;const nl=Math.hypot(dx,dz)||1;dx/=nl;dz/=nl;}const sp=P.speed();P.pos.x+=dx*sp*dt;P.pos.z+=dz*sp*dt;P.tryLoot(dt);};`);
run("Meta.load();Meta.data.runs=0;Mission.start(111);");
const DT=1/30;let prevDmg=0,t=0;
console.log("t(s)  hp  armor  combat(scav/drone/ward)  nearest  dDmg/s  loot");
for(let i=0;i<60*45 && ev("Mission.state")==='RUNNING';i++){
  const before=ev("PlayerMission.dmgTaken");
  run("window.__step("+DT+");Mission.update("+DT+");");
  t=ev("TideMission.t");
  if(i%30===0){
    const snap=ev(`(function(){let s=0,d=0,w=0,nd=1e9,nx=0,nz=0;const P=PlayerMission;
      Mission.entities.scavs.forEach(e=>{if(e.state==='COMBAT')s++;const dd=Math.hypot(e.pos.x-P.pos.x,e.pos.z-P.pos.z);if(dd<nd){nd=dd;nx=e.pos.x;nz=e.pos.z;}});
      Mission.entities.drones.forEach(e=>{if(e.state==='COMBAT')d++;const dd=Math.hypot(e.pos.x-P.pos.x,e.pos.z-P.pos.z);if(dd<nd){nd=dd;nx=e.pos.x;nz=e.pos.z;}});
      if(Mission.entities.warden&&Mission.entities.warden.state==='COMBAT'){w++;const dd=Math.hypot(Mission.entities.warden.pos.x-P.pos.x,Mission.entities.warden.pos.z-P.pos.z);if(dd<nd){nd=dd;nx=Mission.entities.warden.pos.x;nz=Mission.entities.warden.pos.z;}}
      const gate=Extraction.points.find(p=>p.id==='船坞闸门');
      return JSON.stringify({s,d,w,nd:nd.toFixed(1),nx:nx.toFixed(1),nz:nz.toFixed(1),dg:Math.hypot(P.pos.x-gate.pos.x,P.pos.z-gate.pos.z).toFixed(1),ch:Extraction.channelT.toFixed(1),hp:PlayerMission.hp,armor:PlayerMission.armor,loot:BackPack.items.length,dmg:PlayerMission.dmgTaken});})()`);
    const o=JSON.parse(snap);
    console.log(`${t.toFixed(0).padStart(4)}  ${String(o.hp).padStart(3)}  ${String(o.armor).padStart(4)}   ${String(o.s).padStart(2)}/${String(o.d).padStart(2)}/${o.w}  nd=${String(o.nd).padStart(4)}@(${o.nx},${o.nz})  dGate=${o.dg.padStart(4)} ch=${o.ch.padStart(4)}  dDmg=${(o.dmg-prevDmg).toFixed(0).padStart(3)} loot=${o.loot}`);
    prevDmg=o.dmg;
  }
}
console.log("result:",ev("JSON.stringify(Mission.result)"));
