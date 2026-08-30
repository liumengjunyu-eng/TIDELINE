// tools/test_grace_headless.js
// 开局静默期（GRACE）回归测试：验证「新手观察窗口」两条硬约束。
//   1) 出生点安全半径：任何敌人都不得生成在玩家出生点 SAFE_R 米内
//   2) 静默期敌人休眠：前 GRACE_SEC 秒敌人不移动 / 不索敌 / 不开火；到期后恢复
// 运行： cd TIDELINE/game && node tools/test_grace_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");
// 主逻辑是最后一个内联 <script>（第一个是内联 three.js 库）
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g);
const SRC = blocks[blocks.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

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
    querySelectorAll: () => [], width: 1280, height: 720, click: () => {} };
}
const els = {}, store = {};
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
const DT = 1 / 60;
console.log("=".repeat(66));
console.log("TIDELINE · 开局静默期（GRACE）回归测试");
console.log("=".repeat(66));

/* ---------- 0. 载入局外存档，固定为「老手局」（敌人数量 12 / 4）---------- */
run("Meta.load(); Meta.data.runs = 9;");   // runs>=2 -> 非新手局，用满编敌人做最坏情况
check("静默期常量 GRACE_SEC = 15", ev("TideMission.GRACE_SEC") === 15, "GRACE_SEC=" + ev("TideMission.GRACE_SEC"));
check("出生点已移出撤离点判定圈", ev(`
  (function(){
    for(const p of Extraction.points)
      if(Math.hypot(PlayerMission.pos.x-p.pos.x, PlayerMission.pos.z-p.pos.z) < 2.5) return false;
    return true;
  })()`), "spawn=(" + ev("PlayerMission.pos.x") + "," + ev("PlayerMission.pos.z") + ")，距船坞闸门 "
      + ev("Math.hypot(PlayerMission.pos.x+27, PlayerMission.pos.z).toFixed(1)") + "m");

/* ---------- 1. 出生点安全半径（30 次重开采样，覆盖随机性）---------- */
console.log("\n-- 出生点安全半径 (>=15m) --");
let worst = 1e9, worstKind = "", violations = 0, samples = 0;
for (let n = 0; n < 30; n++) {
  run("Mission.start();");
  const spawn = ev("PlayerMission.pos");
  const list = [];
  const sc = ev("Mission.entities.scavs.map(s=>({x:s.pos.x,z:s.pos.z}))");
  const dr = ev("Mission.entities.drones.map(s=>({x:s.pos.x,z:s.pos.z}))");
  sc.forEach(p => list.push(["scavenger", p]));
  dr.forEach(p => list.push(["drone", p]));
  for (const [kind, p] of list) {
    const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
    samples++;
    if (d < worst) { worst = d; worstKind = kind; }
    if (d < 15) violations++;
  }
}
check("30 局 × 16 敌人无一落入 15m 安全圈", violations === 0,
      samples + " 个样本，最近的一个 " + worst.toFixed(1) + "m（" + worstKind + "）");

/* ---------- 2. 静默期内敌人完全休眠 ---------- */
console.log("\n-- 静默期敌人休眠（0–15s）--");
run(`
  Mission.start();
  // 出生点 (-27,0) 正好压在撤离点「船坞闸门」上，站定 8s 会直接撤离成功并终止任务，
  // 这里把玩家挪到出生点旁 6m 处（仍在安全圈内）以隔离撤离判定。
  PlayerMission.pos.x = -27; PlayerMission.pos.z = 6;
  globalThis.__snap = Mission.entities.scavs.concat(Mission.entities.drones)
      .concat([Mission.entities.warden]).map(e=>({x:e.pos.x,z:e.pos.z}));
`);
run("for(let i=0;i<870;i++) Mission.update(" + DT + ");");   // 14.5s（全程落在静默期内）
check("静默期内玩家 0 伤害", ev("PlayerMission.dmgTaken") === 0,
      "dmgTaken=" + ev("PlayerMission.dmgTaken"));
check("静默期内玩家满血", ev("PlayerMission.hp") === 100, "hp=" + ev("PlayerMission.hp"));
check("静默期内敌人未位移", ev(`
  (function(){
    const now = Mission.entities.scavs.concat(Mission.entities.drones)
      .concat([Mission.entities.warden]);
    for(let i=0;i<now.length;i++){
      const a=globalThis.__snap[i], b=now[i];
      if(Math.abs(a.x-b.x)>1e-9 || Math.abs(a.z-b.z)>1e-9) return false;
    }
    return true;
  })()`), "所有敌人坐标零位移");
check("静默期计时走到 14.5s", Math.abs(ev("TideMission.t") - 14.5) < 0.02,
      "t=" + ev("TideMission.t").toFixed(2) + "s");

/* ---------- 3. 静默期结束后敌人恢复行动 ---------- */
console.log("\n-- 静默期结束（15s 后恢复）--");
run("for(let i=0;i<300;i++) Mission.update(" + DT + ");");   // +5s
check("graceActive() 已关闭", ev("TideMission.graceActive()") === false,
      "t=" + ev("TideMission.t").toFixed(1) + "s");
check("敌人恢复巡逻（发生位移）", ev(`
  (function(){
    const all = Mission.entities.scavs.concat(Mission.entities.drones);
    for(const e of all){
      const d = Math.hypot(e.pos.x-e.home.x, e.pos.z-e.home.z);
      if(d > 0.5) return true;
    }
    return false;
  })()`), "至少一名敌人已离开出生位");
check("埋点记录 grace_end", ev("Telemetry.events.some(e=>e.type==='grace_end')") === true);

/* ---------- 4. 贴脸测试：静默期结束后敌人具备攻击力（确认没有被永久冻结）---------- */
console.log("\n-- 敌人攻击力未被误伤 --");
run(`
  Mission.start();
  PlayerMission.pos.x = -27; PlayerMission.pos.z = 6;    // 同上，避开撤离圈
  for(let i=0;i<960;i++) Mission.update(${DT});          // 跑过静默期（16s）
  const s = Mission.entities.scavs[0];
  s.pos.x = PlayerMission.pos.x + 1; s.pos.z = PlayerMission.pos.z;   // 贴脸
  s.state = 'COMBAT';
  for(let i=0;i<120;i++) Mission.update(${DT});          // 再 2s
`);
check("静默期结束后贴脸会挨打", ev("PlayerMission.dmgTaken") > 0,
      "dmgTaken=" + Number(ev("PlayerMission.dmgTaken")).toFixed(1));

/* ---------- 5. 苏醒不是瞬间开火（0.6~1.6s 反应延迟）---------- */
console.log("\n-- 苏醒反应延迟 --");
run(`
  Mission.start();
  PlayerMission.pos.x = -27; PlayerMission.pos.z = 6;
  const s = Mission.entities.scavs[0];
  s.pos.x = -27; s.pos.z = 8; s.state = 'COMBAT';     // 贴脸 2m；静默期内敌人不会移动
  for(let i=0;i<910;i++) Mission.update(${DT});       // t≈15.17s，刚苏醒 0.17s
`);
check("苏醒后 0.6s 内不会开火", ev("PlayerMission.dmgTaken") === 0,
      "t=" + ev("TideMission.t").toFixed(2) + "s 时 dmgTaken=0");
run("for(let i=0;i<150;i++) Mission.update(" + DT + ");");   // 再 2.5s
check("反应延迟过后正常开火", ev("PlayerMission.dmgTaken") > 0,
      "dmgTaken=" + Number(ev("PlayerMission.dmgTaken")).toFixed(1));

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS"
                       : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
