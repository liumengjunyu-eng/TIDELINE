// tools/test_seed_headless.js
// P1-c.0 前置：地图确定性（可重放随机数源）回归测试。
//   幽灵竞速要公平，挑战双方必须跑同一张图。本测试验证：
//   1) 同一 seed → 战利品布局 + 敌人初始位置逐字节一致（可复现）
//   2) 不同 seed → 地图不同（种子确实生效，不是空转）
//   3) 正常游玩不传 seed → 每局随机，但 Mission.seed 必被记录（供未来分享码读取）
//   4) Rng 本身：注入种子后序列确定，reset 后回到 Math.random
// 运行： cd TIDELINE/game && node tools/test_seed_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g);
const SRC = blocks[blocks.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

/* ---------- 最小 DOM 桩（与 test_grace_headless 同款） ---------- */
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
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener: () => {}, getContext: () => fakeCtx(),
    querySelectorAll: () => [], width: 1280, height: 720, click: () => {} };
}
const els = {}, store = {};
const sandbox = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => els[id] || (els[id] = fakeEl()), createElement: () => fakeEl(), querySelectorAll: () => [], addEventListener: () => {} },
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

// 取一张地图的指纹：战利品 + 敌人 + 无人机初始位置/价值
const SNAP = `JSON.stringify({
  loot: LootSystem.items.map(i=>({x:+i.pos.x.toFixed(3),z:+i.pos.z.toFixed(3),v:i.value,r:i.rarity})),
  scav: Mission.entities.scavs.map(s=>({x:+s.pos.x.toFixed(3),z:+s.pos.z.toFixed(3)})),
  drone: Mission.entities.drones.map(s=>({x:+s.pos.x.toFixed(3),z:+s.pos.z.toFixed(3)}))
})`;

console.log("=".repeat(66));
console.log("TIDELINE · P1-c.0 地图确定性（种子可复现）回归测试");
console.log("=".repeat(66));

run("Meta.load(); Meta.data.runs = 9;");   // 非新手局，取满编敌人做最坏情况

/* ---------- 1. 同一 seed → 地图逐字节一致 ---------- */
console.log("\n-- 同 seed 复现 --");
run("Mission.start(123456);"); const a1 = ev(SNAP); const seedA = ev("Mission.seed");
run("Mission.start(123456);"); const a2 = ev(SNAP); const seedA2 = ev("Mission.seed");
check("种子被记录到 Mission.seed", seedA === 123456 && seedA2 === 123456, "seed=" + seedA);
check("同 seed 战利品+敌人布局完全一致", a1 === a2, "长度 " + a1.length);

/* ---------- 2. 不同 seed → 地图不同 ---------- */
console.log("\n-- 异 seed 区分 --");
run("Mission.start(999999);"); const b1 = ev(SNAP);
check("不同 seed 产生不同地图", a1 !== b1, "seedA=123456  vs seedB=999999");

/* ---------- 3. 不传 seed → 随机但被记录 ---------- */
console.log("\n-- 正常游玩（无种子）--");
run("Mission.start();"); const c1 = ev(SNAP); const seedC = ev("Mission.seed");
run("Mission.start();"); const c2 = ev(SNAP); const seedC2 = ev("Mission.seed");
check("不传 seed 时 Mission.seed 为正整数", Number.isInteger(seedC) && seedC > 0 && seedC < 4294967296, "seed=" + seedC);
check("两次随机局种子不同（非固定）", seedC !== seedC2, seedC + " ≠ " + seedC2);
check("随机局地图各异（符合 Math.random 行为）", c1 !== c2);

/* ---------- 4. Rng 本身确定 / 复位 ---------- */
console.log("\n-- Rng 随机源 --");
const seq1 = ev("(function(){ Rng.seed(7); const o=[]; for(let i=0;i<5;i++) o.push(+Rng.current().toFixed(6)); return o.join(','); })()");
const seq2 = ev("(function(){ Rng.seed(7); const o=[]; for(let i=0;i<5;i++) o.push(+Rng.current().toFixed(6)); return o.join(','); })()");
check("Rng.seed(7) 两次序列相同（确定性）", seq1 === seq2, "[" + seq1 + "]");
const seq3 = ev("(Rng.reset(), (function(){ const o=[]; for(let i=0;i<3;i++) o.push(+Rng.current().toFixed(6)); return o.join(','); })())");
check("Rng.reset 后回到 [0,1) 区间且非 NaN", /^0?\.\d+(,0?\.\d+){2}$/.test(seq3) && !seq3.split(",").includes("NaN"), "[" + seq3 + "]");

/* ---------- 5. 运行期 AI 不受影响：不传种子时正常游玩敌人会动 ---------- */
console.log("\n-- 运行期 AI 未被种子冻结 --");
run("Mission.start(); for(let i=0;i<900;i++) Mission.update(1/60);");   // 跑过静默期
// 静默期结束后至少一个敌人应已离开出生点附近（说明 AI 用实时 Math.random 在决策）
const moved = ev(`(function(){
  const s0 = Mission.entities.scavs.map(x=>({x:x.pos.x,z:x.pos.z}));
  // 再推进 6s，看位置是否变化（AI wander 用 Math.random，非种子）
  for(let i=0;i<360;i++) Mission.update(1/60);
  let anyMove=false;
  Mission.entities.scavs.forEach((x,i)=>{ if(Math.hypot(x.pos.x-s0[i].x, x.pos.z-s0[i].z)>0.5) anyMove=true; });
  return anyMove;
})()`);
check("静默期后敌人 AI 仍在实时移动（未被种子冻结）", moved);

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS" : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
