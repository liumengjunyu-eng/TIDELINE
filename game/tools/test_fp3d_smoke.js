// tools/test_fp3d_smoke.js
// 第一人称 3D 渲染路径（FP3D）的隔离冒烟测试。
// 用一个最小 THREE.js 桩 + WebGL 上下文桩加载 web/index.html，
// 真正调用 FP.init() 与 FP.render() 若干帧，确认 3D 渲染路径无引用/运行时错误。
// 这是逻辑测试（test_breach_headless.js）覆盖不到的部分 —— 3D 渲染代码此前从未被执行过。
// 运行： cd TIDELINE/game && node tools/test_fp3d_smoke.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const SRC = (function(){ // 第一个内联 <script> 是 three.js 库，主游戏逻辑在最后一个块
  const _b = fs.readFileSync(HTML, "utf8").match(/<script>([\s\S]*?)<\/script>/g);
  return _b[_b.length-1].replace(/^<script>/,"").replace(/<\/script>$/,""); })();

/* ---------- THREE 桩 ---------- */
function colorStub() { return { setHex(){}, setRGB(){}, set(){}, clone(){return colorStub();} }; }
function Material(opts) {
  // 无论构造参数里传什么 color/opacity，都保证 .color / .emissive 是带 setHex/setRGB 的桩，
  // 否则游戏里 material.color.setHex(...) 会在桩里找不到方法。
  const m = Object.assign({}, opts || {});
  m.color = colorStub();
  m.emissive = colorStub();
  return m;
}
// 注意：set()/copy() 必须真的写入分量。早先是空实现，导致所有 position.set(...) 静默失效、
// 位置恒为 (0,0,0) —— 任何「位置正确」类断言都会变成假通过。
function vec() { return { x:0, y:0, z:0,
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; },
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; },
  setScalar(s){ this.x=s; this.y=s; this.z=s; return this; } }; }
function makePosition(count) {
  return { count, getX:()=>0, getY:()=>0, getZ:()=>0,
           setX:()=>{}, setY:()=>{}, setZ:()=>{}, needsUpdate:false };
}
function Geometry(opts) {
  const g = Object.assign({ rotateX(){}, setAttribute(n,v){this.attributes[n]=v;},
                            setDrawRange(){}, attributes:{} }, opts||{});
  return g;
}
function Obj3D() {
  // add/remove 必须真的维护 children。早先 add() 是空实现、且根本没有 remove()，
  // 于是"加入/移除场景"这类操作在桩里静默失效 —— 与 vec().set() 空实现同属假通过隐患。
  return { position: vec(), rotation: {x:0,y:0,z:0}, scale: vec(),
           visible:true, userData:{}, children:[],
           add(c){ if(c) this.children.push(c); },
           remove(c){ const i=this.children.indexOf(c); if(i>=0) this.children.splice(i,1); },
           material: Material(), geometry: Geometry(), lookAt(){}, updateProjectionMatrix(){},
           aspect:1, intensity:0, isObject3D:true };
}
function Mesh(geo, mat) { const o = Obj3D(); o.geometry = geo; o.material = mat || Material(); return o; }

const THREE = {
  WebGLRenderer: function(){ return { setPixelRatio(){}, setSize(){}, render(){},
                                      domElement:{} }; },
  Scene: function(){ const o = Obj3D(); o.background=null; o.fog=null; return o; },
  Color: function(){ return colorStub(); },
  Fog: function(){ return {}; },
  PerspectiveCamera: function(){ return Obj3D(); },
  HemisphereLight: function(){ return Obj3D(); },
  DirectionalLight: function(){ return Obj3D(); },
  PointLight: function(){ return Obj3D(); },
  PlaneGeometry: function(w,h,sx,sy){ var n=(sx+1)*(sy+1); return Geometry({ attributes:{ position: makePosition(n) } }); },
  BoxGeometry: function(){ return Geometry(); },
  SphereGeometry: function(){ return Geometry(); },
  TorusGeometry: function(){ return Geometry(); },
  CylinderGeometry: function(){ return Geometry(); },
  BufferGeometry: function(){ return Geometry(); },
  Float32BufferAttribute: function(arr){ return { array: arr, needsUpdate:false }; },
  MeshLambertMaterial: function(o){ return Material(o); },
  MeshPhongMaterial: function(o){ return Material(o); },
  MeshBasicMaterial: function(o){ return Material(o); },
  LineBasicMaterial: function(o){ return Material(o); },
  LineSegments: function(geo){ const o = Obj3D(); o.geometry = geo; return o; },
  Mesh: function(geo, mat){ return Mesh(geo, mat); },
  Group: function(){ return Obj3D(); },
  RingGeometry: function(){ return Geometry(); },
  ConeGeometry: function(){ return Geometry(); },
  CanvasTexture: function(cv){ return { image:cv, needsUpdate:false }; },
  SpriteMaterial: function(o){ return Material(o); },
  Sprite: function(mat){ const o=Obj3D(); o.material=mat||Material(); return o; },
  DoubleSide: 2,
  // 光标瞄准用到 unproject/sub/normalize；桩里不必真的做投影逆变换，
  // 只要返回有限数值、让后续 ray-plane 求交得到有限 yaw 即可。
  Vector3: function(x,y,z){ const v=vec(); v.set(x||0,y||0,z||0);
    v.unproject=function(){ return this; };
    v.sub=function(o){ this.x-=o.x; this.y-=o.y; this.z-=o.z; return this; };
    v.normalize=function(){ const l=Math.hypot(this.x,this.y,this.z)||1;
                            this.x/=l; this.y/=l; this.z/=l; return this; };
    return v; },
};

/* ---------- DOM 桩 ---------- */
function fakeCtx() {
  const noop = () => {}, grad = { addColorStop: noop };
  return new Proxy({}, { get(t,k){
    if (k==="createLinearGradient"||k==="createRadialGradient") return ()=>grad;
    if (k==="measureText") return ()=>({width:10});
    if (k==="canvas") return {width:1280,height:720};
    if (k in t) return t[k];
    return noop;
  }, set(t,k,v){ t[k]=v; return true; } });
}
function fakeEl() {
  return { textContent:"", innerHTML:"", style:{}, dataset:{},
    classList:{ _s:new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener:()=>{}, getContext:()=>fakeCtx(), querySelectorAll:()=>[], width:1280, height:720, click:()=>{} };
}
const els = {}; const store = {};
const sandbox = {
  THREE, console,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, setTimeout, clearTimeout,
  localStorage: { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  document: { getElementById:id=>els[id]||(els[id]=fakeEl()), createElement:()=>fakeEl(),
              querySelectorAll:()=>[], addEventListener:()=>{} },
  window: { innerWidth:1280, innerHeight:720, devicePixelRatio:1, addEventListener:()=>{} },
  Blob: function(){}, URL:{ createObjectURL:()=>"", revokeObjectURL:()=>{} }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox, { filename:"index.html<script>" });
const ev = e => vm.runInContext(e, sandbox);
const run = s => vm.runInContext("(function(){"+s+"})()", sandbox);

let pass=0, fail=0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  [PASS] "+label+(detail?"   "+detail:"")); }
  else { fail++; console.log("  [FAIL] "+label+(detail?"   "+detail:"")); }
}

console.log("=".repeat(66));
console.log("TIDELINE · 第一人称 3D 渲染路径冒烟测试");
console.log("=".repeat(66));

check("FP 模块存在", typeof ev("typeof FP") === "string" && ev("!!FP"));
check("FP.init 成功建立 3D（using3D=true）", ev("using3D") === true,
      "using3D="+ev("using3D"));
check("FP.ok 为真", ev("FP.ok") === true);

// 造一局并渲染若干帧，确认 render() 在真实模拟状态下不抛错
let renderErr = null;
try {
  run("newMatch(); newRound(); g.prep = 0;");
  // 给玩家一点移动与开火，让 tracers/ripples/units 都进入渲染
  run("var P=player(); P.x=24; P.z=24; for(var i=0;i<5;i++){ update(1/60); }");
  run("g.tracers.push({x1:24,z1:24,x2:30,z2:30,life:0.05});");
  run("g.ripples.push({x:24,z:24,life:0.3,max:0.3,enemy:false});");
  for (let f=0; f<30; f++) {
    run("update(1/60); FP.render(" + (f/60) + ");");
  }
} catch (e) { renderErr = e; }
check("FP.render 跑满 30 帧无异常", renderErr === null, renderErr ? renderErr.message : "");

// 验证水位变化时水面与浮箱确实在 render 中被引用（不抛错即合格）
let tideErr = null;
try {
  run("g.phase=2; g.phaseElapsed=0; g.water=3.2; for(var k=0;k<10;k++){ update(1/60); FP.render(1.5); }");
} catch (e) { tideErr = e; }
check("满潮 3.2m 下渲染无异常（水面/浮箱/孤岛）", tideErr === null, tideErr ? tideErr.message : "");

// ---- SALVAGE 3D 渲染路径（buildSalvage / renderSalvage）----
let salvErr = null;
try {
  run("gameMode='salvage'; startSalvage();");
  for (let f=0; f<30; f++) {
    run("Mission.update(1/60); FP.renderSalvage(" + (f/60) + ");");
  }
} catch (e) { salvErr = e; }
check("SALVAGE: buildSalvage 建立 salvGroup 场景", ev("FP.salvGroup!==null"));
check("SALVAGE: renderSalvage 30 帧无异常", salvErr === null, salvErr ? salvErr.message : "30 帧无报错");

// ---- 幽灵渲染路径（P1-c.2）----
// 本测试用 THREE 桩 + WebGL 桩跑通 buildSalvage / renderSalvage，是唯一会执行到幽灵
// 「可见」分支的地方：其余无头测试 FP.ok=false，那段渲染代码根本不会执行。
let ghostErr = null, ghostVisible = false, ghostPos = null, ghostSample = null, ghostGone = null;
try {
  run("GhostPlayer.load([{t:0,x:-24,z:2},{t:20,x:-10,z:8},{t:60,x:10,z:-6,event:'extract'}]);");
  for (let f = 0; f < 10; f++) { run("Mission.update(1/60); FP.renderSalvage(" + (f / 60) + ");"); }
  ghostVisible = ev("!!(FP.ghostMesh && FP.ghostMesh.visible===true)");
  ghostSample = ev("GhostPlayer.sampleAt(TideMission.t)");
  ghostPos = ev("FP.ghostMesh ? {x:FP.ghostMesh.position.x, z:FP.ghostMesh.position.z} : null");
} catch (e) { ghostErr = e; }
check("幽灵渲染：载入轨迹后 10 帧无异常", ghostErr === null, ghostErr ? ghostErr.message : "10 帧无报错");
check("幽灵渲染：轨迹期内 ghostMesh 可见", ghostVisible === true);
// 关键断言：网格位置必须等于插值采样值。此前 vec() 桩的 set() 是空实现 → 位置恒 (0,0)，
// 而「非原点」式断言在 x=0 时同样通过，是个假通过。已补齐桩，并改为与采样值精确比对。
check("幽灵渲染：网格位置 = 插值采样位置",
      !!ghostPos && !!ghostSample &&
      Math.abs(ghostPos.x - ghostSample.x) < 0.01 && Math.abs(ghostPos.z - ghostSample.z) < 0.01,
      ghostPos && ghostSample
        ? "mesh=(" + ghostPos.x.toFixed(2) + ", " + ghostPos.z.toFixed(2) +
          ") sample=(" + ghostSample.x.toFixed(2) + ", " + ghostSample.z.toFixed(2) + ")"
        : "null");
// 时间轴越过幽灵终点 → 隐藏（对手那时已撤离，不该还站在场上）
try {
  run("TideMission.t = 999; FP.renderSalvage(1);");
  ghostGone = ev("FP.ghostMesh ? FP.ghostMesh.visible : null");
} catch (e) { ghostGone = "ERR:" + e.message; }
check("幽灵渲染：越过轨迹终点后隐藏（对手已撤离）", ghostGone === false, "visible=" + ghostGone);

// ---- 相机四模式（3D 升级：视角可切换）----
// 起因：实测发现改造前 SALVAGE 实际是第一人称（枪是 camera 的子节点、且"第一人称不画自己"），
// 与已锁定的"2.5D 固定俯视角"不符。四模式里 tactical 是真正落地该形态的那一档。
let camErr=null, camDefault=null, camSeq=[], camPoses={};
try {
  camDefault = ev("CamMode.cur");
  for (const m of ["tactical","follow","orbit","fps"]) {
    run("CamMode.set('"+m+"'); FP.renderSalvage(0.016);");
    camPoses[m] = ev("({x:+FP.camera.position.x.toFixed(3), y:+FP.camera.position.y.toFixed(3), z:+FP.camera.position.z.toFixed(3)})");
  }
  run("CamMode.reset();");
  camSeq = ev("(function(){var s=[];for(var i=0;i<5;i++)s.push(CamMode.next());return s;})()");
} catch (e) { camErr = e; }
check("相机：四模式切换与渲染无异常", camErr===null, camErr?camErr.message:"无报错");
check("相机：默认战术俯视（落地已锁定的 2.5D 形态）", camDefault==='tactical', "默认="+camDefault);
check("相机：循环四档后回到起点", camSeq.length===5 && camSeq[4]===camSeq[0], camSeq.join(' → '));
check("相机：战术俯视远高于第一人称（俯瞰全景）",
      !!(camPoses.tactical && camPoses.fps) && camPoses.tactical.y > camPoses.fps.y + 8,
      camPoses.tactical ? ("俯视 y="+camPoses.tactical.y+" / 第一人称 y="+camPoses.fps.y) : "null");
check("相机：四模式位姿互不相同",
      new Set(["tactical","follow","orbit","fps"].map(m=>camPoses[m]&&(camPoses[m].x+","+camPoses[m].y+","+camPoses[m].z))).size===4,
      "tactical="+JSON.stringify(camPoses.tactical)+" follow="+JSON.stringify(camPoses.follow));

// ---- 角色 3D 化（程序化人形替换方块代理）----
let humErr=null, opCount=null, packs=null, buildAll=null, playerVis={};
try {
  opCount   = ev("Object.keys(OPLOOK).length");
  packs     = ev("Object.keys(OPLOOK).map(function(k){return OPLOOK[k].pack;})");
  buildAll  = ev("Object.keys(OPLOOK).concat(Object.keys(ENEMYLOOK)).map(function(k){"
              + "var l=OPLOOK[k]||ENEMYLOOK[k]; return !!(buildHumanoid(l)||buildDrone(l));"
              + "}).filter(Boolean).length");
  run("CamMode.set('tactical'); FP.renderSalvage(0.016);");
  playerVis.tactical = ev("!!(FP.playerMesh && FP.playerMesh.visible)");
  run("CamMode.set('fps'); FP.renderSalvage(0.016);");
  playerVis.fps = ev("!!(FP.playerMesh && FP.playerMesh.visible)");
  run("CamMode.reset();");
} catch (e) { humErr = e; }
check("角色 3D 化：构建与渲染无异常", humErr===null, humErr?humErr.message:"无报错");
check("角色 3D 化：8 名干员外观齐全", opCount===8, "干员外观数="+opCount);
check("角色 3D 化：背负物互不相同（俯视下剪影第一识别项）",
      !!packs && new Set(packs).size===8, packs?packs.join(" / "):"null");
check("角色 3D 化：11 种外观（8 干员 + 3 敌种）均可构建", buildAll===11, "可构建="+buildAll);
check("角色人形：战术俯视可见自己", playerVis.tactical===true, "tactical visible="+playerVis.tactical);
check("角色人形：第一人称不画自己", playerVis.fps===false, "fps visible="+playerVis.fps);

// ---- 画面可读性（战利品/撤离点/淹没预警）----
// 起因：用户反馈"什么是战利品整不清"。根因是战利品只是 0.5m 素方块，在俯视下几乎不可见。
let rdErr=null, lootParts=null, beamLow=null, beamHigh=null;
try {
  lootParts = ev("!!(FP.lootPool[0] && FP.lootPool[0].userData.ring && FP.lootPool[0].userData.beam && FP.lootPool[0].userData.dia)");
  run("LootSystem.items[0].taken=false; LootSystem.items[0].rarity=0;"
    + "LootSystem.items[1].taken=false; LootSystem.items[1].rarity=3; FP.renderSalvage(2.0);");
  beamLow  = ev("FP.lootPool[0].userData.beam.scale.y");
  beamHigh = ev("FP.lootPool[1].userData.beam.scale.y");
} catch (e) { rdErr = e; }
check("战利品：光环+光柱+菱形三件套齐备（不再是素方块）",
      rdErr===null && lootParts===true, rdErr?rdErr.message:"结构完整");
check("战利品：稀有度越高光柱越高",
      typeof beamLow==="number" && beamHigh > beamLow,
      "普通="+beamLow+" / 传说="+beamHigh);

let exLabOk=null;
try { exLabOk = ev("!!(FP.extrLabels && FP.extrLabels.length===Extraction.points.length)"); }
catch (e) { exLabOk = "ERR:"+e.message; }
check("撤离点：每个点都有标签位（无真实 canvas 时返回 null 优雅降级）",
      exLabOk===true, "长度匹配="+exLabOk);

// 不能赌单一时刻：30 秒只涨约 0.11m，这个窄带可能刚好落在地形空隙里 —— 那时"没有新增淹没区"
// 是**正确行为**，不是功能坏了。所以扫描整段涨潮期，断言"存在会预警的时刻"。
let flErr=null, flHits=0, flTried=0;
try {
  const r = ev("(function(){var hits=0,tried=0;"
    + "for(var tt=60; tt<=560; tt+=25){ TideMission.t=tt; TideMission.tick(0);"   // 让 tick 自己算水位
    + " FP._floodLvl=null; FP._updateFloodWarning(); tried++; if(FP.floodMesh) hits++; }"
    + " return hits+'/'+tried;})()");
  flHits = parseInt(r,10); flTried = parseInt(r.split('/')[1],10);
} catch (e) { flErr = e; }
check("淹没预警：涨潮途中会标出「FLOOD_LEAD_SEC 秒后会被淹」的区域",
      flErr===null && flHits>0, flErr?flErr.message:("命中时刻 "+flHits+" / 采样 "+flTried
        + "（30s 视野仅命中 3，放宽到 90s 后为 "+flHits+"）"));

// 注：BREACH / SURGE 已裁定为作废旧案，整段代码归档于 game/legacy/，
// 不再作为产品门面或入口。本冒烟测试只验证 SALVAGE 这一张脸的 3D 渲染路径。

console.log("\n"+"=".repeat(66));
console.log(`结果：${pass} 项 PASS / ${fail} 项 FAIL`);
console.log("=".repeat(66));
process.exit(fail ? 1 : 0);
