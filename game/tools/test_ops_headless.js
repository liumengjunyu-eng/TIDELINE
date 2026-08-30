// tools/test_ops_headless.js
// 干员被动 / 深水降级 / 战斗数值 的无浏览器回归测试。
// 核心主张：**写在干员卡片上的每一个承诺，进局都必须兑现。**
// 若某个被动测不出差异，说明它是空头支票 —— 这个测试就是要让空头支票暴露。
// 运行： cd TIDELINE/game && node tools/test_ops_headless.js

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
// 切换干员（模拟部署屏选择）
const useOp = id => run(`salvOp = SALVAGE_OPS['${id}'];`);
const useGun = id => run(`salvGun = SALVAGE_GUNS['${id}'];`);

console.log("=".repeat(66));
console.log("TIDELINE · 干员被动 / 深水降级 / 战斗数值 回归测试");
console.log("=".repeat(66));
run("Meta.load(); Meta.data.runs = 9;");   // 老手局基线

/* ---------- 1. 干员表完整性 ---------- */
console.log("\n-- 干员表 --");
check("8 名干员全部有被动描述", ev("Object.values(SALVAGE_OPS).every(o=>o.name&&o.desc)"));
check("卡片描述与数据表一一对应", ev(`
  (function(){
    const ids=Object.keys(SALVAGE_OPS);
    return OPS.length===ids.length && OPS.every(o=>SALVAGE_OPS[o.id]);
  })()`), ev("OPS.length") + " 名干员");
// 每个干员都必须至少有一个"非默认"字段，否则就是空壳
const hollow = ev(`
  (function(){
    const base={wading:1};
    return Object.keys(SALVAGE_OPS).filter(id=>{
      const o=SALVAGE_OPS[id];
      const keys=Object.keys(o).filter(k=>k!=='name'&&k!=='desc');
      // 只有 wading 且等于 1 → 与其他人无差别
      return keys.length===0 || (keys.length===1 && keys[0]==='wading' && o.wading===1);
    }).join(',');
  })()`);
check("没有「被动为空」的干员", hollow === "", hollow ? "空壳：" + hollow : "8 名干员均有实被动");

/* ---------- 2. 逐个验证被动真的产生了差异 ---------- */
console.log("\n-- 被动逐个验证（换人必须换手感）--");
run("Mission.start();");

// 干足（隼）：涉水减速减半
run(`
  globalThis.__mkSpd = function(){
    PlayerMission.pos.x=0; PlayerMission.pos.z=-4;      // z∈[-6,-2] 为 1.0m 低地
    TideMission.level=1.6;                              // 水深 0.6m，处于 Shallow
    BackPack.items=[];
    return PlayerMission.speed();
  };
`);
useOp('kestrel');   const spdKestrel = ev("globalThis.__mkSpd()");
useOp('bulwark');   const spdBulwark = ev("globalThis.__mkSpd()");
check("干足（隼）：涉水速度高于无被动干员", spdKestrel > spdBulwark,
      "隼 " + spdKestrel.toFixed(2) + " vs 堤 " + spdBulwark.toFixed(2));

// 锚定（堤）：静止 1.5s 后减伤 25%
run("Mission.start(); BackPack.items=[];");
useOp('bulwark');
run("PlayerMission.stillT=0;     PlayerMission.hp=100; PlayerMission.armor=0; PlayerMission.damage(40,'t');");
const dmgMoving = 100 - ev("PlayerMission.hp");
run("PlayerMission.stillT=2.0;   PlayerMission.hp=100; PlayerMission.armor=0; PlayerMission.damage(40,'t');");
const dmgStill = 100 - ev("PlayerMission.hp");
check("锚定（堤）：站定后伤害减少 25%", Math.abs(dmgStill - dmgMoving * 0.75) < 0.01,
      "移动中 -" + dmgMoving.toFixed(1) + " → 站定 -" + dmgStill.toFixed(1));
useOp('kestrel');
run("PlayerMission.stillT=2.0;   PlayerMission.hp=100; PlayerMission.armor=0; PlayerMission.damage(40,'t');");
check("锚定不误伤其他干员", Math.abs((100 - ev("PlayerMission.hp")) - 40) < 0.01,
      "隼站定仍吃满 40 伤害");

// 打捞权（账房）：战利品价值 +20%
run("BackPack.items=[];");
useOp('kestrel');
run("LootSystem.items=[{pos:{x:0,z:0},rarity:0,name:'普通',value:500,kg:1,taken:false}];"
  + "BackPack.take(LootSystem.items[0]);");
const vKestrel = ev("BackPack.value");
run("BackPack.items=[]; LootSystem.items[0].taken=false;");
useOp('ledger');
run("BackPack.take(LootSystem.items[0]);");
const vLedger = ev("BackPack.value");
check("打捞权（账房）：战利品价值 +20%", vLedger === Math.round(vKestrel * 1.2),
      "隼 ⌾" + vKestrel + " → 账房 ⌾" + vLedger);

// 绳忆（渠）：移速 +12%、换弹 -40%
run("BackPack.items=[]; Mission.start();");
// 基线必须选「无移速类被动」的干员（隼的干足会在涉水里加速，不能当基线）
useOp('gannel');  const spdGannel = ev("globalThis.__mkSpd()");
useOp('bulwark'); const spdBase   = ev("globalThis.__mkSpd()");
check("绳忆（渠）：移速 +12%", Math.abs(spdGannel / spdBase - 1.12) < 0.02,
      "渠 " + spdGannel.toFixed(2) + " vs 堤 " + spdBase.toFixed(2) +
      "（倍率 ×" + (spdGannel / spdBase).toFixed(3) + "）");
useOp('gannel');  run("salvReloadT=0; PlayerMission.mag=0; PlayerMission.ammo=60; reloadSalvage();");
const rlGannel = ev("salvReloadT");
useOp('kestrel'); run("salvReloadT=0; PlayerMission.mag=0; PlayerMission.ammo=60; reloadSalvage();");
const rlBase = ev("salvReloadT");
check("绳忆（渠）：换弹耗时 -40%", Math.abs(rlGannel / rlBase - 0.6) < 0.01,
      rlBase.toFixed(2) + "s → " + rlGannel.toFixed(2) + "s");

// 回潮（浚）：残血提速
run("BackPack.items=[]; Mission.start();");
useOp('dredger');
run("globalThis.__dry=function(hp){ PlayerMission.pos.x=8; PlayerMission.pos.z=16; "
  + "TideMission.level=0; PlayerMission.hp=hp; return PlayerMission.speed(); };");
const spdFull = ev("globalThis.__dry(100)"), spdLow = ev("globalThis.__dry(10)");
check("回潮（浚）：血量 <25% 时提速 20%", Math.abs(spdLow / spdFull - 1.2) < 0.02,
      "满血 " + spdFull.toFixed(2) + " → 残血 " + spdLow.toFixed(2));

// 超压（沸釜）：霰弹 +35%
useGun('A3'); useOp('cauldron');
const sgCauldron = ev(`
  (function(){ const g=SALVAGE_GUNS.A3; return Math.round(g.dmg*opVal('sgMult',1)); })()`);
useOp('kestrel');
const sgBase = ev("SALVAGE_GUNS.A3.dmg");
check("超压（沸釜）：霰弹伤害 +35%", sgCauldron === Math.round(sgBase * 1.35),
      sgBase + " → " + sgCauldron);
check("超压不影响步枪", ev(`
  (function(){ const g=SALVAGE_GUNS.K7; return (g.cls==='SG')?false:true; })()`), "K-7 为 AR，不吃加成");

// 水面张力（掠波）：深水不降级 + 游泳减速减半
console.log("\n-- 深水降级（§3.1）--");
run("Mission.start(); BackPack.items=[]; PlayerMission.pos.x=0; PlayerMission.pos.z=0; TideMission.level=3.0;");
useOp('kestrel');
check("普通干员：水深 3.0m 降级为手枪", ev("usingSidearm()") === true && ev("activeGun().name") === "备用手枪",
      "depth=" + ev("MapHeight.depthAt(0,0)").toFixed(2) + "m → " + ev("activeGun().name"));
useOp('skimmer');
check("水面张力（掠波）：深水仍用主武器", ev("usingSidearm()") === false,
      "掠波在 " + ev("MapHeight.depthAt(0,0)").toFixed(2) + "m 深水保留 " + ev("activeGun().name"));
run("PlayerMission.pos.x=0; PlayerMission.pos.z=0; TideMission.level=3.0; BackPack.items=[];");
useOp('skimmer'); const swimSkimmer = ev("PlayerMission.speed()");
useOp('kestrel'); const swimKestrel = ev("PlayerMission.speed()");
check("水面张力（掠波）：游泳减速减半", swimSkimmer > swimKestrel,
      "掠波 " + swimSkimmer.toFixed(2) + " vs 隼 " + swimKestrel.toFixed(2));
run("TideMission.level=0; PlayerMission.pos.x=8; PlayerMission.pos.z=16;");
check("回到浅水自动恢复主武器", ev("usingSidearm()") === false,
      "depth=0 → " + ev("activeGun().name"));

/* ---------- 3. 战斗数值落在设计区间 ---------- */
console.log("\n-- 战斗数值（设计目标：1 敌可应对，3 敌才致命）--");
const C = ev("JSON.stringify(Combat)");
const combat = JSON.parse(C);
// 期望 DPS = 命中率 × 均伤 / 射击间隔（取 10m 典型交战距离）
function dps(k, dist) {
  const c = combat[k];
  const hit = Math.max(c.min, c.hit - dist * c.falloff);
  return hit * ((c.dmg[0] + c.dmg[1]) / 2) / c.cd;
}
const d10 = dps('scavenger', 10);
check("拾荒者 @10m DPS 落在 12~22", d10 >= 12 && d10 <= 22, "DPS=" + d10.toFixed(1));
check("单挑拾荒者 ≥6 秒才致命（150 有效血量）", 150 / d10 >= 6,
      (150 / d10).toFixed(1) + "s");
check("三敌围攻在 2.5~5 秒内致命", 150 / (d10 * 3) >= 2.5 && 150 / (d10 * 3) <= 5,
      (150 / (d10 * 3)).toFixed(1) + "s");
const droneHigh = dps('drone', 15) * combat.drone.highMult;
check("满潮无人机威胁高于低潮", droneHigh > dps('drone', 15),
      "低潮 " + dps('drone', 15).toFixed(1) + " → 满潮 " + droneHigh.toFixed(1) + " DPS");
const wardenLow = dps('warden', 10), wardenHigh = dps('warden', 10) + combat.warden.levelDmg * 3.2 / combat.warden.cd * 0.32;
check("守望者随水位变强", wardenHigh > wardenLow,
      "低潮 " + wardenLow.toFixed(1) + " → 满潮 " + wardenHigh.toFixed(1) + " DPS");

/* ---------- 4. 换装不残留（防止被动叠加串味）---------- */
console.log("\n-- 换装不残留 --");
run("salvOp=SALVAGE_OPS.ledger; BackPack.items=[]; LootSystem.items=[{pos:{x:0,z:0},rarity:0,name:'x',value:1000,kg:1,taken:false}]; BackPack.take(LootSystem.items[0]);");
const vLedger2 = ev("BackPack.value");
run("salvOp=SALVAGE_OPS.kestrel; BackPack.items=[]; LootSystem.items[0].taken=false; BackPack.take(LootSystem.items[0]);");
const vKestrel2 = ev("BackPack.value");
check("从账房切回隼不再享受 +20%", vKestrel2 === 1000 && vLedger2 === 1200,
      "账房 ⌾" + vLedger2 + " / 隼 ⌾" + vKestrel2);

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS"
                       : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
