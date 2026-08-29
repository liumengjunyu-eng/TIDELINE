// tools/test_surge_headless.js
// SURGE 涌潮模式（12v12 占点）的无浏览器冒烟测试。
// 复用与 test_salvage_headless.js 相同的 vm + DOM 桩，驱动 SURGE 仿真层并断言。
// 运行： cd TIDELINE/game && node tools/test_surge_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const SRC = fs.readFileSync(HTML, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---------- 最小 DOM 桩 ---------- */
function fakeCtx() {
  const noop = () => {}, grad = { addColorStop: noop };
  return new Proxy({}, { get(t, k) {
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "canvas") return { width: 1280, height: 720 };
    if (k in t) return t[k];
    return noop;
  }, set(t, k, v) { t[k] = v; return true; } });
}
function fakeEl() {
  return { textContent: "", innerHTML: "", style: {}, dataset: {},
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                 contains(c){return this._s.has(c);} },
    addEventListener: () => {}, getContext: () => fakeCtx(),
    querySelectorAll: () => [],
    width: 1280, height: 720, click: () => {} };
}
const els = {};
const store = {};
const sandbox = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, setTimeout, clearTimeout,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  document: {
    getElementById: id => els[id] || (els[id] = fakeEl()),
    createElement: () => fakeEl(),
    querySelectorAll: () => [], addEventListener: () => {}
  },
  window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: () => {} },
  Blob: function () {}, URL: { createObjectURL: () => "", revokeObjectURL: () => {} }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox, { filename: "index.html<script>" });
const ev = e => vm.runInContext(e, sandbox);
const run = s => vm.runInContext("(function(){" + s + "})()", sandbox);

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  [PASS] " + label + (detail ? "   " + detail : "")); }
  else { fail++; console.log("  [FAIL] " + label + (detail ? "   " + detail : "")); }
}

console.log("=".repeat(66));
console.log("TIDELINE · SURGE 涌潮模式 无头冒烟测试");
console.log("=".repeat(66));

check("SurgeGame 已定义", !!ev("typeof SurgeGame"), typeof ev("SurgeGame"));
check("SurgeTide 已定义", !!ev("typeof SurgeTide"), typeof ev("SurgeTide"));
check("SurgeBot 已定义", !!ev("typeof SurgeBot"), typeof ev("SurgeBot"));

run("SurgeGame.start();");
check("start 后阵容 = 23 个实体（11蓝AI + 12红AI）", ev("SurgeGame.bots.length") === 23,
  "bots=" + ev("SurgeGame.bots.length"));
check("3 个浮动泵站", ev("SurgeGame.stations.length") === 3,
  "stations=" + ev("SurgeGame.stations.length"));
check("玩家为蓝队", ev("SurgeGame.player.team") === "blue");
check("初始全部中立（ctrl=50）",
  ev("SurgeGame.stations.every(s=>s.ctrl===50 && s.owner==='neutral')"));

/* 占点得分：跑 60s，蓝/红至少有一方拿到分数 */
run("for(let i=0;i<3600;i++) SurgeGame.update(1/60);");
check("60s 后产生占点得分（蓝+红>0）",
  (ev("Math.round(SurgeGame.blue)") + ev("Math.round(SurgeGame.red)")) > 0,
  "blue=" + ev("Math.round(SurgeGame.blue)") + " red=" + ev("Math.round(SurgeGame.red)"));
check("60s 内部分泵站被夺取（owner≠neutral 或 ctrl 偏移）",
  ev("SurgeGame.stations.some(s=>s.ctrl>55||s.ctrl<45)"));

/* 随机潮汐浪涌事件：强制 nextSurge 立即触发，跑 3s 应进入浪涌且水位暴涨 */
run("SurgeTide.nextSurge=1; SurgeTide.surgeT=0; SurgeTide.surgeAmt=0; SurgeTide.level=0;");
const baseLevel = ev("SurgeTide.level");
run("for(let i=0;i<180;i++) SurgeTide.tick(1/60);");
check("浪涌事件触发（surgeT>0 或 surgeAmt>0）",
  ev("SurgeTide.surgeT>0 || SurgeTide.surgeAmt>0"),
  "surgeT=" + ev("SurgeTide.surgeT").toFixed(2));
check("浪涌使水位暴涨（>1.5m，远超基础涨潮）",
  ev("SurgeTide.level") > 1.5, "level=" + ev("SurgeTide.level").toFixed(2));

/* 胜负判定：蓝队到目标分应结束（先 restart 确保 RUNNING） */
run("SurgeGame.start(); SurgeGame.blue=SurgeGame.target; SurgeGame.update(1/60);");
check("蓝队达目标分 → 结束（ENDED）", ev("SurgeGame.state") === "ENDED");
check("结算结果蓝队胜", ev("SurgeGame.result && SurgeGame.result.win") === true);

/* 玩家阵亡后复活（3s 内）：隔离测试复活机制，临时禁用 bots 防止其再次击杀玩家干扰判定 */
run("SurgeGame.start(); SurgeGame.player.alive=false; SurgeGame.player.hp=0; SurgeGame.player.deadT=0; SurgeGame.bots.forEach(b=>b.alive=false);");
run("for(let i=0;i<200;i++) SurgeGame.update(1/60);");
check("玩家阵亡 3s 后自动复活", ev("SurgeGame.player.alive") === true);

/* Surge Step 涌步：瞬移 + 冷却（快照存到 SurgeGame 避免跨 run 作用域问题） */
run("SurgeGame.start(); SurgeGame.stepCd=0; SurgeGame.p0={x:SurgeGame.player.x,z:SurgeGame.player.z}; SurgeGame.tryStep();");
check("涌步后玩家位移（瞬移 8m）",
  ev("Math.hypot(SurgeGame.player.x-SurgeGame.p0.x, SurgeGame.player.z-SurgeGame.p0.z)") > 5,
  "位移=" + ev("Math.hypot(SurgeGame.player.x-SurgeGame.p0.x, SurgeGame.player.z-SurgeGame.p0.z)").toFixed(2) + "m");
check("涌步进入 28s 冷却", ev("SurgeGame.stepCd") === 28);
run("SurgeGame.p1={x:SurgeGame.player.x,z:SurgeGame.player.z}; SurgeGame.tryStep();");
check("冷却中再按涌步无效（位置不变）",
  ev("Math.hypot(SurgeGame.player.x-SurgeGame.p1.x, SurgeGame.player.z-SurgeGame.p1.z)") < 0.001);

/* 全实体压力：620s 持续模拟（target 设极大防提前结束），无异常 */
let err = null;
try {
  run("SurgeGame.start(); SurgeGame.target=1e9;");
  run("for(let i=0;i<12400;i++){ if(SurgeGame.state!=='RUNNING') break; SurgeGame.update(0.05); }");
} catch(e) { err = e; }
check("620s 全实体压力模拟无异常（23 实体 × 数百帧）", err === null, err ? err.message : "");
check("压力跑后水位仍合理（0~5m）", ev("SurgeTide.level") >= 0 && ev("SurgeTide.level") < 6,
  "level=" + (ev("SurgeTide.level")||0).toFixed(2));

console.log("=".repeat(66));
console.log("SURGE 结果： " + pass + " 通过 / " + fail + " 失败");
console.log("=".repeat(66));
process.exit(fail ? 1 : 0);
