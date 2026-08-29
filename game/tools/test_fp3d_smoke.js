// tools/test_fp3d_smoke.js
// 第一人称 3D 渲染路径（FP3D）的隔离冒烟测试。
// 用一个最小 THREE.js 桩 + WebGL 上下文桩加载 web/index.html，
// 真正调用 FP.init() 与 FP.render() 若干帧，确认 3D 渲染路径无引用/运行时错误。
// 这是逻辑测试（test_breach_headless.js）覆盖不到的部分 —— 3D 渲染代码此前从未被执行过。
// 运行： cd TIDELINE/game && node tools/test_fp3d_smoke.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const SRC = fs.readFileSync(HTML, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];

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
function vec() { return { x:0, y:0, z:0, set(){return this;}, copy(){return this;} }; }
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
  return { position: vec(), rotation: {x:0,y:0,z:0}, scale: vec(),
           visible:true, userData:{}, add(){}, children:[],
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
  BufferGeometry: function(){ return Geometry(); },
  Float32BufferAttribute: function(arr){ return { array: arr, needsUpdate:false }; },
  MeshLambertMaterial: function(o){ return Material(o); },
  MeshPhongMaterial: function(o){ return Material(o); },
  MeshBasicMaterial: function(o){ return Material(o); },
  LineBasicMaterial: function(o){ return Material(o); },
  LineSegments: function(geo){ const o = Obj3D(); o.geometry = geo; return o; },
  Mesh: function(geo, mat){ return Mesh(geo, mat); },
  Group: function(){ return Obj3D(); },
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
    addEventListener:()=>{}, getContext:()=>fakeCtx(), width:1280, height:720, click:()=>{} };
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

console.log("\n"+"=".repeat(66));
console.log(`结果：${pass} 项 PASS / ${fail} 项 FAIL`);
console.log("=".repeat(66));
process.exit(fail ? 1 : 0);
