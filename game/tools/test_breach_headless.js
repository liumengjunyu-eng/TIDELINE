// tools/test_breach_headless.js
// BREACH 破堤模式的无浏览器冒烟测试。
// 用 node vm + 最小 DOM 桩加载 web/index.html，手动驱动回合并断言。
// 运行： cd TIDELINE/game && node tools/test_breach_headless.js

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
// 包 IIFE：否则每条脚本里的 `const P` 会落在同一全局词法作用域，第二次就重复声明
const run = s => vm.runInContext("(function(){" + s + "})()", sandbox);

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  [PASS] " + label + (detail ? "   " + detail : "")); }
  else { fail++; console.log("  [FAIL] " + label + (detail ? "   " + detail : "")); }
}
const DT = 1 / 60;
function step(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) run("update(" + DT + ")"); }

console.log("=".repeat(66));
console.log("TIDELINE · BREACH 破堤 · 无浏览器冒烟测试");
console.log("=".repeat(66));

/* ---------- 1. 数据完整性 ---------- */
console.log("\n-- 数据层（01_核心设定集 §5 / §7）--");
check("8 名干员", ev("OPERATORS.length") === 8,
      ev("OPERATORS.map(o=>o.name).join('')"));
check("干员技能均为三级", ev("OPERATORS.every(o => o.lv.length === 3)"));
check("24 把枪械", ev("WEAPONS.length") === 24);
check("5 大军械厂商", ev("new Set(WEAPONS.map(w=>w.maker)).size") === 5,
      ev("[...new Set(WEAPONS.map(w=>w.maker))].join('/')"));
check("6 类武器", ev("new Set(WEAPONS.map(w=>w.cat)).size") === 6,
      ev("[...new Set(WEAPONS.map(w=>w.cat))].join('/')"));
check("5 槽改装", ev("SLOTS.length") === 5, ev("SLOTS.map(s=>s.name).join('/')"));
check("4 级弹药", ev("AMMO.length") === 4 && ev("AMMO[3].pen") === 1.9);
check("3 级护甲 + 无甲", ev("ARMORS.length") === 4);
check("7 项根据地设施", ev("FACILITIES.length") === 7);
check("经济表与文档一致（起始 800 / 胜 3250 / 败 1400）",
      ev("ECON.start") === 800 && ev("ECON.win") === 3250 && ev("ECON.loss") === 1400);
check("技能三级价格 0 / 600 / 1200",
      ev("SKILL_COST.join(',')") === "0,600,1200");
check("回合 100 秒、先到 13 分、第 12 回合换边",
      ev("ROUND_TIME") === 100 && ev("WIN_SCORE") === 13 && ev("SWITCH_ROUND") === 12);

/* ---------- 2. 回合初始化 ---------- */
console.log("\n-- 回合初始化 --");
run("newMatch(); newRound(); g.prep = 0;");
check("5v5 共 10 名单位", ev("g.units.length") === 10);
check("玩家在进攻方，配 4 名队友",
      ev("g.units.filter(u=>u.side==='atk').length") === 5 &&
      ev("g.units[0].isPlayer === true && g.units[0].side === 'atk'"));
check("敌方 5 人在防守方", ev("g.units.filter(u=>u.side==='def').length") === 5);
check("解码器初始为携带状态", ev("g.decoder.state") === "carried");
check("A 点标高 4.0（满潮不淹）", ev("sampleHeight(48,20)") === 4.0);
check("B 点标高 0.2（满潮必淹）", ev("sampleHeight(20,48)") === 0.2);

/* ---------- 3. 潮汐（§3） ---------- */
console.log("\n-- 潮汐三阶段 --");
// 只留玩家 + 1 名防守方：
// 否则 4 名进攻方队友会在 ~10 秒跑到点位安放解码器，35 秒引信烧完后回合就结束，
// update() 随即返回，潮汐永远推不到满潮（这是测试隔离问题，不是游戏 bug）。
run(`
  newMatch(); pendingCredits = ECON.start; startRound(); g.prep = 0;
  g.units = [g.units[0], g.units.find(u => u.side === 'def')];
  for (const u of g.units) { u.hp = 1e9; u.maxHp = 1e9; }
`);
step(41);
check("40 秒进入涨潮", ev("g.phase") === 1, "phase=" + ev("g.phase"));
step(36);
check("75 秒进入满潮", ev("g.phase") === 2, "phase=" + ev("g.phase"));
step(24);
check("满潮水位封顶 3.20m", Math.abs(ev("g.water") - 3.2) < 1e-6,
      "water=" + ev("g.water").toFixed(2));
check("满潮时 A 点仍在水面之上", ev("3.2 - sampleHeight(48,20) < 0"));
check("满潮时 B 点已没顶（B 点成孤岛）", ev("3.2 - sampleHeight(20,48) > 2.0"),
      "B 点水深 " + (3.2 - 0.2).toFixed(2) + "m");

/* ---------- 4. 安放 / 拆除解码器 ---------- */
console.log("\n-- 安放 / 拆除解码器 --");
run("newMatch(); newRound(); g.prep = 0;");
run("const P = player(); P.x = 48; P.z = 20;");   // 站上 A 点
run("keys.add('KeyE')");
step(3.5);
check("长按 E 3 秒完成安放", ev("g.decoder.state") === "planted",
      "state=" + ev("g.decoder.state"));
// 3.0s 安放完成后又跑了约 0.5s，因此引信应落在 34~35s 之间
check("安放后引信 35 秒", ev("g.decoder.timer") > 34 && ev("g.decoder.timer") <= 35,
      "剩余 " + ev("g.decoder.timer").toFixed(1) + "s");
check("安放者获得 +300 信用点", ev("player().credits") >= 300,
      "⌾" + ev("player().credits"));
run("keys.delete('KeyE')");
step(36);
check("引信烧完 -> 进攻方获胜",
      ev("g.over && g.result === 'atk'"), "result=" + ev("g.result"));
check("比分记给进攻方", ev("M.scoreAtk") === 1, "score " + ev("M.scoreAtk") + ":" + ev("M.scoreDef"));

// 拆除
run("newMatch(); newRound(); g.prep = 0;");
run(`
  const P = player();
  P.side = 'def';
  for (const u of g.units) u.side = (u.id === 0 ? 'def' : (u.id < 5 ? 'def' : 'atk'));
  g.decoder.state = 'planted'; g.decoder.site = 0; g.decoder.timer = 30; g.decoder.progress = 0;
  P.x = 48; P.z = 20;
  keys.add('KeyE');
`);
step(7.5);
check("防守方长按 E 7 秒完成拆除",
      ev("g.decoder.state") === "defused", "state=" + ev("g.decoder.state"));
check("拆除 -> 防守方获胜", ev("g.over && g.result === 'def'"), "result=" + ev("g.result"));
run("keys.delete('KeyE')");

/* ---------- 5. 经济（§7.2） ---------- */
console.log("\n-- 回合经济 --");
// 起始资金挂在 pendingCredits 上，由 startRound() 结算给玩家
run("newMatch();");
check("回合起始 ⌾800", ev("pendingCredits") === 800, "⌾" + ev("pendingCredits"));
run("startRound(); g.prep = 0;");
check("startRound 把起始资金结算给玩家", ev("player().credits") === 800,
      "⌾" + ev("player().credits"));
// 击杀奖励
run(`
  const P = player();
  P.credits = 0; P.wpIdx = WEAPONS.findIndex(w => w.cat === 'AR');
  const t = g.units.find(u => u.side !== P.side && u.alive);
  t.hp = 1; damageUnit(P, t, 999);
`);
check("AR 击杀 +300", ev("player().credits") === 300, "⌾" + ev("player().credits"));
run(`
  const P = player(); P.credits = 0;
  P.wpIdx = WEAPONS.findIndex(w => w.cat === 'SMG');
  const t2 = g.units.find(u => u.side !== P.side && u.alive);
  t2.hp = 1; damageUnit(P, t2, 999);
`);
check("冲锋枪击杀 +400（鼓励近战）", ev("player().credits") === 400, "⌾" + ev("player().credits"));
// 连败补偿
run(`
  newMatch(); newRound(); g.prep = 0;
  M.lossStreak = 2;
  const P = player(); P.credits = 0;
  endRound('def', 'test');
`);
check("第 3 败：1400 + 2400 补偿", ev("player().credits") === 3800,
      "⌾" + ev("player().credits") + "（败 1400 + 连败 2400）");

/* ---------- 6. 8 名干员技能 ---------- */
console.log("\n-- 8 名干员技能（三级）--");
const OP_IDS = ev("OPERATORS.map(o=>o.id)");
for (let i = 0; i < OP_IDS.length; i++) {
  const id = OP_IDS[i];
  let ok = true, note = "";
  try {
    run(`
      newMatch(); newRound(); g.prep = 0;
      loadout.op = ${i}; loadout.skill = 2;
      const P = player(); P.opIdx = ${i}; P.abCd = 0; P.aim = 0;
      useAbility();
    `);
    if (ev("player().abCd") <= 0) { ok = false; note = "冷却未生效"; }
  } catch (e) { ok = false; note = e.message; }
  check("干员 " + ev(`OPERATORS[${i}].name`) + " (" + id + ") 技能可用", ok, note);
}
// 逐个验证效果差异
run(`
  newMatch(); newRound(); g.prep = 0;
  loadout.op = 0; loadout.skill = 0;
  const P = player(); P.opIdx = 0; P.abCd = 0; P.aim = 0; P.x = 32; P.z = 32;
`);
const z0 = ev("player().z");
run("useAbility()");
check("隼 · 涌步产生位移", Math.abs(ev("player().z") - z0) > 5,
      "z " + z0 + " -> " + ev("player().z").toFixed(1));

run(`
  newMatch(); newRound(); g.prep = 0;
  loadout.op = 1; loadout.skill = 0;
  const P = player(); P.opIdx = 1; P.abCd = 0; P.x = 32; P.z = 32;
  const e = g.units.find(u => u.side !== P.side); e.x = 33; e.z = 32; e.hp = 200; e.maxHp = 200;
`);
const hpB = ev("g.units.find(u=>u.side!==player().side && Math.abs(u.x-33)<0.1).hp");
run("useAbility()");
const hpA = ev("g.units.find(u=>u.side!==player().side && Math.abs(u.x-33)<0.1) ? g.units.find(u=>u.side!==player().side && Math.abs(u.x-33)<0.1).hp : 0");
check("沸釜 · 泄压造成范围伤害", hpA < hpB, "目标 " + hpB + " -> " + hpA);

run(`
  newMatch(); newRound(); g.prep = 0;
  loadout.op = 3; loadout.skill = 0;
  const P = player(); P.opIdx = 3; P.abCd = 0; P.aim = 0;
  useAbility();
`);
check("堤 · 闸门生成掩体", ev("g.covers.length") > 0, ev("g.covers.length") + " 个掩体");

/* ---------- 7. 涉水 / 游泳禁火 ---------- */
console.log("\n-- 涉水规则 --");
run(`
  newMatch(); newRound(); g.prep = 0;
  g.phase = 2; g.water = 3.2;
  const P = player(); P.x = 32; P.z = 32; P.state = 3; P.ammo = 20; P.cd = 0; P.reload = 0;
  keys.add('Space');
`);
const ammoB = ev("player().ammo");
step(0.2);
check("游泳态无法开火（枪械收起）", ev("player().ammo") === ammoB,
      "弹药 " + ammoB + " -> " + ev("player().ammo"));
run("keys.delete('Space')");

/* ---------- 7b. §3.1 副武器 / 浮动集装箱 / 噪音波纹 ---------- */
console.log("\n-- §3.1 游泳态副武器 --");
run(`
  newMatch(); pendingCredits = ECON.start; startRound(); g.prep = 0;
  g.phase = 2; g.water = 3.2;
  const P = player(); P.x = 32; P.z = 32; P.state = 3;
  P.ammo = 20; P.cd = 0; P.reload = 0;
  P.ammoS = 12; P.cdS = 0; P.reloadS = 0;
  keys.add('Space');
`);
step(0.4);
check("游泳态主武器收起（主弹不消耗）", ev("player().ammo") === 20,
      "主弹 " + ev("player().ammo"));
check("游泳态仍可用副武器（§3.1 只能用手枪，不是缴械）",
      ev("player().ammoS") < 12, "副弹 12 -> " + ev("player().ammoS"));
run("keys.delete('Space')");

// 干地应恢复主武器
run(`
  newMatch(); pendingCredits = ECON.start; startRound(); g.prep = 0;
  const P = player(); P.x = 48; P.z = 20; P.state = 0;
  P.ammo = 20; P.cd = 0; P.reload = 0; keys.add('Space');
`);
step(0.3);
check("干地恢复使用主武器", ev("player().ammo") < 20,
      "主弹 20 -> " + ev("player().ammo"));
run("keys.delete('Space')");

console.log("\n-- §3.1 浮动集装箱（随水位抬升形成新通路）--");
check("低潮时集装箱坐底", Math.abs(ev("floaterTopAt(32,26,0)") - 0.7) < 1e-6,
      "顶面 " + ev("floaterTopAt(32,26,0)").toFixed(2) + "m");
check("满潮时集装箱浮起", ev("floaterTopAt(32,26,3.2)") > 3.5,
      "顶面 " + ev("floaterTopAt(32,26,3.2)").toFixed(2) + "m");
// 站在浮起的箱顶上不该算泡在水里 —— 这正是"新通路"成立的原因
run("newMatch(); pendingCredits = ECON.start; startRound(); g.prep = 0; g.water = 3.2;");
const onBox = ev("depthAt(32,26)"), offBox = ev("depthAt(32,32)");
check("站上浮箱算干爽（新通路可用）", onBox === 0,
      "箱顶水深 " + onBox.toFixed(2) + "m");
check("同一水位下箱外已没顶（3.2m）", offBox > 2.0,
      "箱外水深 " + offBox.toFixed(2) + "m");
check("浮箱确实创造了差异（箱上干爽 vs 箱外游泳）",
      onBox === 0 && offBox > 2.0,
      onBox.toFixed(2) + "m vs " + offBox.toFixed(2) + "m");

console.log("\n-- §3.1 涉水噪音波纹 --");
run(`
  newMatch(); pendingCredits = ECON.start; startRound(); g.prep = 0;
  g.phase = 2; g.water = 3.2;
  const P = player(); P.x = 32; P.z = 32; P.state = 3;
  g.ripples.length = 0;
  keys.add('KeyD');
`);
step(1.2);
check("涉水移动产生噪音波纹（暴露位置）", ev("g.ripples.length") > 0,
      ev("g.ripples.length") + " 个波纹");
run("keys.delete('KeyD')");
run(`
  newMatch(); pendingCredits = ECON.start; startRound(); g.prep = 0;
  g.water = 0; g.phase = 0;
  const P = player(); P.x = 48; P.z = 20; P.state = 0;
  g.ripples.length = 0;
  keys.add('KeyD');
`);
step(1.2);
check("干地移动不留波纹", ev("g.ripples.length") === 0,
      ev("g.ripples.length") + " 个波纹");
run("keys.delete('KeyD')");

/* ---------- 8. 连续跑完整回合 ---------- */
console.log("\n-- 连续跑完整回合 --");
let threw = null;
try {
  run("newMatch(); newRound(); g.prep = 0;");
  for (let i = 0; i < 6200; i++) {
    run(`
      const P = player();
      if (P.alive) {
        P.x = Math.max(1, Math.min(62, P.x + (Math.random()-0.5)*0.3));
        P.z = Math.max(1, Math.min(62, P.z + (Math.random()-0.5)*0.3));
        if (Math.random() < 0.03) { P.aim = Math.random()*6.28; unitShoot(P); }
        if (Math.random() < 0.004) useAbility();
      }
      update(${DT});
    `);
    if (ev("g.over")) break;
  }
} catch (e) { threw = e; }
check("整回合无运行时异常", threw === null, threw ? threw.message : "6200 帧无报错");
check("整回合能自然结束", ev("g.over === true"));
check("遥测有埋点产出", ev("T.events.length") > 20, ev("T.events.length") + " 条事件");
check("比分已记录", ev("M.scoreAtk + M.scoreDef") === 1,
      "比分 " + ev("M.scoreAtk") + ":" + ev("M.scoreDef"));

/* ---------- 9. 多回合推进 / 换边 ---------- */
console.log("\n-- 多回合与换边 --");
run(`
  newMatch();
  for (let r = 0; r < 11; r++) { M.round++; }
  M.playerSide = 'atk'; M.swapped = false;
  if (M.round === SWITCH_ROUND && !M.swapped) { M.swapped = true; M.playerSide = 'def'; }
`);
check("第 12 回合换边", ev("M.round") === 12 && ev("M.playerSide") === "def",
      "第 " + ev("M.round") + " 回合 · " + ev("M.playerSide"));

/* ---------- 10. 根据地持久化 ---------- */
console.log("\n-- 根据地 --");
run(`
  SAVE.tickets = 5000;
  const f = FACILITIES[0];
  SAVE.tickets -= f.cost[0]; SAVE.fac[f.k] = 1; writeSave();
`);
check("设施可升级", ev("facLv('stash')") === 1);
check("商人渠道生效（价格折扣）", ev("priceOf(1000)") === 1000, "无商人等级时不打折");
run("SAVE.fac['trader'] = 2; writeSave();");
check("商人 Lv2 价格 -16%", ev("priceOf(1000)") === 840, "⌾" + ev("priceOf(1000)"));
check("存档写入 localStorage", typeof store["tideline_save_v1"] === "string");

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS"
                       : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
