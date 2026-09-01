// tools/test_maps_headless.js
// P1-b 地图配置化 + P2 M02 白象街（泄洪）回归测试。
//   P1-b 的验收标准只有一条：**加一张新图只写一个配置对象，不碰任何逻辑代码。**
//   所以这里大部分断言都在拷问"配置是不是真的驱动了一切"，而不只是"地形对不对"。
// 运行： cd TIDELINE/game && node tools/test_maps_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");
// 主逻辑是最后一个内联 <script>（第一个是内联 three.js 库）
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g);
const SRC = blocks[blocks.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

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
    addEventListener: () => {}, getContext: () => fakeCtx(), querySelectorAll: () => [],
    width: 1280, height: 720, click: () => {} };
}
const els = {}, store = {};
const sandbox = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null),
                  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => els[id] || (els[id] = fakeEl()), createElement: () => fakeEl(),
              querySelectorAll: () => [], addEventListener: () => {} },
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

// ★ 快进助手：三段保险，缺一不可。
//   1) 步数上限 —— Mission.update 在 state!=='RUNNING' 时会直接 return，
//      TideMission.t 就此停住；若没有步数上限，while 会变成死循环（踩过）。
//   2) state 检查 —— 玩家阵亡 / 超时后任务即结束，继续快进没有意义。
//   3) keepAlive —— 本节多数断言要跑到 240s 之后，途中玩家必然挨枪。
//      测试关心的是地形/泄洪，不是"站桩能不能活"，所以这里显式保活并注明。
run(`
  window.__ff = function(targetT, dt, keepAlive){
    dt = dt || 1/30;
    var n = 0, max = Math.ceil((targetT - TideMission.t)/dt) + 20;
    while(TideMission.t < targetT && n < max && Mission.state==='RUNNING'){
      if(keepAlive){ PlayerMission.hp = 100; PlayerMission.dead = false; }
      Mission.update(dt); n++;
    }
    return TideMission.t;
  };
  window.__tick = function(sec, dt, keepAlive){
    dt = dt || 1/60;
    var n = Math.ceil(sec/dt);
    for(var i=0;i<n && Mission.state==='RUNNING';i++){
      if(keepAlive){ PlayerMission.hp = 100; PlayerMission.dead = false; }
      Mission.update(dt);
    }
  };
`);

console.log("=".repeat(70));
console.log("TIDELINE · P1-b 地图配置化 / P2 M02 白象街（泄洪）回归测试");
console.log("=".repeat(70));

/* ---------- 1. 配置表本身 ---------- */
console.log("\n-- 配置表 --");
const ids = ev("Object.keys(MAPS).join(',')");
check("MAPS 含 M01 / M02 两张图", ids === "M01,M02", "[" + ids + "]");
check("M01 初始解锁（unlock 为 null）", ev("MAPS.M01.unlock") === null);
check("M02 有解锁条件（成就 + 保底双路径）",
  ev("!!MAPS.M02.unlock && MAPS.M02.unlock.runs>0 && !!MAPS.M02.unlock.ach && !!MAPS.M02.unlock.hint"),
  "runs=" + ev("MAPS.M02.unlock.runs") + " · " + ev("MAPS.M02.unlock.ach.text"));
check("两张图都配齐了地形 / 出生点 / 撤离点", ev(`
  (function(){
    for(const k in MAPS){ const m=MAPS[k];
      if(!m.zones || !m.zones.length) return false;
      if(!m.spawn || typeof m.spawn.x!=='number') return false;
      if(!m.extracts || !m.extracts.length) return false;
      if(m.baseElev==null || !m.W || !m.D || !m.CELL) return false;
    } return true;
  })()`));

/* ---------- 2. 配置真的驱动地形 ---------- */
console.log("\n-- 配置驱动地形 --");
const g01 = ev("(CURRENT_MAP='M01', MapHeight.init(), Array.from(MapHeight.grid).join(','))");
const g02 = ev("(CURRENT_MAP='M02', MapHeight.init(), Array.from(MapHeight.grid).join(','))");
check("切换 CURRENT_MAP 后地形完全改变", g01 !== g02);
check("地形是配置的纯函数（同图两次 init 一致）",
  ev("(CURRENT_MAP='M02', MapHeight.init(), Array.from(MapHeight.grid).join(','))") === g02);

/* ---------- 3. M01 逐点回归：配置化不得改变原有地形 ---------- */
console.log("\n-- M01 地形逐点回归（与改造前的 if 链逐行等价）--");
const M01_CASES = [
  [17, 12, 4.0, "A 点高地"], [-17, -13, 3.9, "B 点高地"], [10, 5, 1.7, "北通道引桥"],
  [0, 10, 1.8, "北通道"], [0, -4, 1.0, "南通道"], [0, 20, 0.0, "干船坞底"],
  [14, -12, 0.2, "B 点低洼"], [28, 18, 2.2, "兜底标高"],
];
const bad = [];
for (const [x, z, want, tag] of M01_CASES) {
  const got = ev(`(CURRENT_MAP='M01', MapHeight.init(), MapHeight.zone(${x},${z}))`);
  if (Math.abs(got - want) > 1e-9) bad.push(tag + "(" + x + "," + z + ")=" + got + "≠" + want);
}
check("M01 八个采样点标高与改造前完全一致", bad.length === 0, bad.join(" / ") || "8/8 命中");
check("M01 不设攀爬限制（沿用旧行为，零回归）",
  !isFinite(ev("(CURRENT_MAP='M01', MapHeight.init(), MapHeight.climbSlope())")));

/* ---------- 4. M02 垂直双层 ---------- */
console.log("\n-- M02 垂直双层 --");
const MAX_TIDE = 3.20;
check("下层街道在满潮线下（必淹）", ev(`
  (function(){ CURRENT_MAP='M02'; MapHeight.init();
    return MapHeight.sample(-10,-15) < ${MAX_TIDE} && MapHeight.sample(10,15) < ${MAX_TIDE}
        && MapHeight.sample(-20,0) < ${MAX_TIDE};
  })()`), "主街 / 后街 / 中庭 均 < " + MAX_TIDE + "m");
check("上层台地高过满潮线（永不淹）", ev(`
  (function(){ CURRENT_MAP='M02'; MapHeight.init();
    return MapHeight.sample(-20,-5) > ${MAX_TIDE} && MapHeight.sample(20,5) > ${MAX_TIDE}
        && MapHeight.sample(0,0) > ${MAX_TIDE};
  })()`), "北台地 / 南台地 / 中央天桥 均 > " + MAX_TIDE + "m");
check("上下层落差 ≥ 7m（是真·双层，不是斜坡）",
  ev("(CURRENT_MAP='M02', MapHeight.init(), MapHeight.sample(-20,-5)-MapHeight.sample(-10,-15))") >= 7,
  "落差 " + ev("(CURRENT_MAP='M02',MapHeight.init(),(MapHeight.sample(-20,-5)-MapHeight.sample(-10,-15)).toFixed(2))") + "m");

/* ---------- 5. 攀爬限制：崖壁走不上去，楼梯走得上 ---------- */
console.log("\n-- M02 攀爬限制（垂直通路是资源）--");
check("崖壁过不去：从主街直冲北台地被拒", ev(`
  (function(){ CURRENT_MAP='M02'; MapHeight.init();
    return !MapHeight.canStep({x:-10,z:-10.4},{x:-10,z:-8.6});
  })()`));
check("楼梯爬得上：沿白象梯逐格推进全程可通行", ev(`
  (function(){ CURRENT_MAP='M02'; MapHeight.init();
    let p={x:-25,z:-19};
    for(let i=0;i<60;i++){
      const n={x:p.x, z:p.z+0.18};
      if(!MapHeight.canStep(p,n)) return false;
      p=n;
    }
    return MapHeight.sample(p.x,p.z) > 8;
  })()`), "登顶标高 " + ev(`
    (function(){ CURRENT_MAP='M02'; MapHeight.init(); let p={x:-25,z:-19};
      for(let i=0;i<60;i++) p={x:p.x,z:p.z+0.18}; return MapHeight.sample(p.x,p.z).toFixed(2); })()`) + "m");
check("M01 的 canStep 恒真（不误伤旧图通行）", ev(`
  (function(){ CURRENT_MAP='M01'; MapHeight.init();
    for(let i=0;i<40;i++)
      if(!MapHeight.canStep({x:-25+i*0.1,z:-15},{x:-25+i*0.1,z:-14.9})) return false;
    return true;
  })()`));

/* ---------- 6. 货运升降机 ---------- */
console.log("\n-- M02 货运升降机 --");
run("Meta.load(); Meta.data.runs = 9; Mission.start(7, false, 'M02');");
check("升降机随地图配置载入", ev("LiftSystem.list.length") === 2, "台数=" + ev("LiftSystem.list.length"));
run(`
  PlayerMission.pos.x = LiftSystem.list[0].low.x;
  PlayerMission.pos.z = LiftSystem.list[0].low.z;
  window.__tick(2.0, ${DT}, true);   // > travel 1.5s
`);
check("站在下层踏板 1.5s 后被送到上层", ev(`
  (function(){ const l=LiftSystem.list[0];
    return Math.hypot(PlayerMission.pos.x-l.high.x, PlayerMission.pos.z-l.high.z) < 0.01; })()`),
  "落点 (" + ev("PlayerMission.pos.x.toFixed(1)") + "," + ev("PlayerMission.pos.z.toFixed(1)") + ")");
check("升降机两端是真·跨层（高度差 > 7m）", ev(`
  (function(){ const l=LiftSystem.list[0];
    return MapHeight.sample(l.high.x,l.high.z) - MapHeight.sample(l.low.x,l.low.z) > 7; })()`),
  "抬升 " + ev("(function(){const l=LiftSystem.list[0];return (MapHeight.sample(l.high.x,l.high.z)-MapHeight.sample(l.low.x,l.low.z)).toFixed(1);})()") + "m");
check("升降井道不在水幕目标内（水幕只打楼梯）", ev(`
  (function(){ const c=MAPS.M02.sluice, lifts=MAPS.M02.lifts.map(l=>l.id);
    return c.candidates.every(id=>!lifts.includes(id)); })()`));

/* ---------- 7. 泄洪：可预测 + 可复现 ---------- */
console.log("\n-- 泄洪（设定集红线：潮汐永远可预测）--");
check("M01 没有泄洪", ev("(CURRENT_MAP='M01', MapHeight.init(), Sluice.reset(), Sluice.cfg)") === null);
check("M02 泄洪时刻表写死在配置里（不随机）",
  ev("(function(){const a=MAPS.M02.sluice.times; return a.length===2 && a[0]===240 && a[1]===420;})()"),
  "开闸于 " + ev("MAPS.M02.sluice.times.join('s / ')") + "s");
const pickA = ev("(Mission.start(555,false,'M02'), Sluice.events.map(e=>e.stairs.join('+')).join(' | '))");
const pickB = ev("(Mission.start(555,false,'M02'), Sluice.events.map(e=>e.stairs.join('+')).join(' | '))");
const pickC = ev("(Mission.start(90210,false,'M02'), Sluice.events.map(e=>e.stairs.join('+')).join(' | '))");
check("同种子 → 水幕位置逐字节复现（幽灵竞速公平的前提）", pickA === pickB, "seed 555 → " + pickA);
check("每次泄洪只覆盖配置数量的楼梯",
  ev("Sluice.events.every(e=>e.stairs.length===Math.min(MAPS.M02.sluice.targets, MAPS.M02.sluice.candidates.length))"));
check("抽取结果不越出候选楼梯集合",
  ev("(function(){const ok=MAPS.M02.sluice.candidates; return Sluice.events.every(e=>e.stairs.every(s=>ok.includes(s)));})()"));
console.log("      · seed 555 → " + pickA + " ；seed 90210 → " + pickC
  + (pickA === pickC ? "（本例同组合，属正常：4 选 2 共 6 种，碰撞概率 1/6）" : ""));

/* ---------- 8. 泄洪：站在水幕里掉血减速，不在则无恙 ---------- */
console.log("\n-- 泄洪结算 --");
run("Meta.load(); Meta.data.runs = 9; Mission.start(555,false,'M02');");
// 隔离测试：清掉所有敌人，单独验证"水幕"这个机制本身，不被友伤/集火干扰
run(`
  Mission.entities.scavs.length = 0;
  Mission.entities.drones.length = 0;
  if(Mission.entities.warden) Mission.entities.warden.state = 'DEAD';
`);
const stairId = ev("Sluice.events[0].stairs[0]");
const stairP  = ev(`
  (function(){ const r=Sluice.rampById(${JSON.stringify(stairId)});
    return {x:(r.rect[0]+r.rect[1])/2, z:(r.rect[2]+r.rect[3])/2}; })()`);
run(`
  PlayerMission.pos.x = 0; PlayerMission.pos.z = -5;      // 上层，水幕外
  window.__ff(Sluice.events[0].t + 5, 1/30, true);
  globalThis.__dmg0 = PlayerMission.dmgTaken;
  window.__tick(1.0, ${DT}, true);
`);
const dmgOut = ev("PlayerMission.dmgTaken - globalThis.__dmg0");
check("水幕外 1 秒不掉血（不是全图无差别伤害）", dmgOut < 0.001, "Δdmg=" + dmgOut.toFixed(2));
run(`
  PlayerMission.pos.x = ${stairP.x}; PlayerMission.pos.z = ${stairP.z};
  globalThis.__dmg1 = PlayerMission.dmgTaken;
  window.__tick(1.0, ${DT}, true);
`);
const dmgIn = ev("PlayerMission.dmgTaken - globalThis.__dmg1");
check("水幕里 1 秒掉血 ≈ 配置的 dmg 值", Math.abs(dmgIn - ev("MAPS.M02.sluice.dmg")) < 0.6,
  "Δdmg=" + dmgIn.toFixed(2) + " / 配置 " + ev("MAPS.M02.sluice.dmg"));
check("水幕里移速降到配置的 slow 倍率",
  Math.abs(ev(`Sluice.speedMult({x:${stairP.x},z:${stairP.z}})`) - ev("MAPS.M02.sluice.slow")) < 1e-9,
  "×" + ev("MAPS.M02.sluice.slow"));
check("水幕外移速倍率为 1", ev("Sluice.speedMult({x:0,z:-5})") === 1);
check("死亡分析能识别水幕伤害来源", ev("PlayerMission.lastDmg.some(e=>e.src==='sluice')"), "src='sluice'");
run("Meta.load(); Meta.data.runs = 9; Mission.start(555,false,'M02'); PlayerMission.pos.x=0; PlayerMission.pos.z=-5;");
run("window.__ff(MAPS.M02.sluice.times[0] - MAPS.M02.sluice.warnLead + 1, 1/30, true);");
check("泄洪前 15 秒发出预警埋点", ev("Telemetry.events.some(e=>e.type==='sluice_warn')"));
check("预警发生在开闸之前（不是马后炮）", ev(`
  (function(){ const w=Telemetry.events.filter(e=>e.type==='sluice_warn');
    return w.length>0 && w[0].t < Sluice.events[0].t; })()`),
  "预警于 " + ev("(function(){const w=Telemetry.events.filter(e=>e.type==='sluice_warn');return w.length?w[0].t.toFixed(0):'—';})()")
  + "s，开闸于 240s");

/* ---------- 9. 泄洪不替玩家清场（AI 只减速、不受伤）---------- */
console.log("-- 泄洪不替玩家清场 --");
run("Meta.load(); Meta.data.runs = 9; Mission.start(555,false,'M02'); PlayerMission.pos.x=0; PlayerMission.pos.z=-5;");
run(`
  window.__ff(Sluice.events[0].t + 5, 1/30, true);
  globalThis.__before = Mission.entities.scavs.filter(s=>s.state!=='DEAD').length;
  globalThis.__scav = Mission.entities.scavs.find(s=>s.state!=='DEAD');
  if(globalThis.__scav){ globalThis.__scav.pos.x = ${stairP.x}; globalThis.__scav.pos.z = ${stairP.z}; }
  window.__tick(2.0, ${DT}, true);
`);
check("拾荒者站在水幕里 2 秒不会死",
  ev("Mission.entities.scavs.filter(s=>s.state!=='DEAD').length") >= ev("globalThis.__before"),
  "存活 " + ev("Mission.entities.scavs.filter(s=>s.state!=='DEAD').length") + " / 原 " + ev("globalThis.__before"));
check("拾荒者在水幕里被减速", ev("Sluice.speedMult(globalThis.__scav.pos)") < 1);

/* ---------- 10. 出生点安全 / AI 抢高地在 M02 同样成立 ---------- */
console.log("\n-- M02 出生点与 AI --");
let viol2 = 0, worst2 = 1e9;
for (let n = 0; n < 12; n++) {
  run("Mission.start(" + (1000 + n) + ", false, 'M02');");
  const sp = ev("PlayerMission.pos");
  const list = ev("Mission.entities.scavs.concat(Mission.entities.drones).concat([Mission.entities.warden]).map(e=>({x:e.pos.x,z:e.pos.z}))");
  for (const p of list) { const d = Math.hypot(p.x - sp.x, p.z - sp.z); if (d < worst2) worst2 = d; if (d < 15) viol2++; }
}
check("12 局敌人无一落入 15m 安全圈", viol2 === 0, "最近敌人 " + worst2.toFixed(1) + "m");
check("M02 出生点不压在任何撤离点判定圈内", ev(`
  (function(){
    for(const p of Extraction.points)
      if(Math.hypot(PlayerMission.pos.x-p.pos.x, PlayerMission.pos.z-p.pos.z) < 2.5) return false;
    return true;
  })()`), "spawn=(" + ev("PlayerMission.pos.x") + "," + ev("PlayerMission.pos.z") + ")");
check("M02 撤离点来自配置而非 M01 残留",
  ev("Extraction.points.every(p=>MAPS.M02.extracts.some(e=>e.id===p.id))"),
  ev("Extraction.points.map(p=>p.id).join(' / ')"));
run("Meta.load(); Meta.data.runs = 9; Mission.start(4242,false,'M02'); PlayerMission.pos.x=0; PlayerMission.pos.z=-5;");
run(`
  globalThis.__y0 = Mission.entities.scavs.map(s=>MapHeight.sample(s.pos.x,s.pos.z));
  window.__ff(520, 1/30, true);            // 满潮：下层已淹，AI 必须上高地
  globalThis.__y1 = Mission.entities.scavs.map(s=>MapHeight.sample(s.pos.x,s.pos.z));
`);
const upN = Number(ev(`
  (function(){ let up=0;
    for(let i=0;i<globalThis.__y0.length;i++) if(globalThis.__y1[i] > globalThis.__y0[i] + 1) up++;
    return up; })()`));
const totN = Number(ev("globalThis.__y0.length"));
check("满潮时拾荒者确实撤上高处（BFS 抢高地未被崖壁卡死）", upN >= Math.ceil(totN * 0.5),
  upN + "/" + totN + " 名拾荒者已上高地");

/* ---------- 11. 地图 UI：选择 / 解锁 / 启动链 ---------- */
console.log("\n-- 地图 UI：选择 / 解锁 / 启动链 --");
check("默认选中 M01", ev("MenuShell.selMap") === 'M01');
check("M01 始终解锁", ev("ShellMeta.mapUnlocked('M01')") === true);
check("M02 冷启动锁定", ev("(Meta.load(), Meta.data.runs=0, Meta.data.achDone={}, ShellMeta.mapUnlocked('M02'))") === false);
check("M02 撤离 8 次后保底解锁", ev("(Meta.data.runs=8, ShellMeta.mapUnlocked('M02'))") === true);
check("M02 成就路径也能解锁", ev("(Meta.data.runs=0, Meta.data.achDone={'m02_gate_high':true}, ShellMeta.mapUnlocked('M02'))") === true);
check("M02 解锁成就由结算授予（闸门区满潮撤离）", ev(`
  (function(){ Meta.load(); Meta.data.runs=2;
    return evalAchievements({extracted:true, map:'M02', phase:'High', kills:0, value:0, damageTaken:0, hpLeft:100})
      .indexOf('m02_gate_high') >= 0; })()`));
check("M02 成就不会在非满潮 / 非 M02 时误授", ev(`
  (function(){ Meta.load(); Meta.data.runs=2;
    return evalAchievements({extracted:true, map:'M01', phase:'High'}).indexOf('m02_gate_high') < 0
        && evalAchievements({extracted:true, map:'M02', phase:'Rising'}).indexOf('m02_gate_high') < 0; })()`));
// 启动链：UI 选 M02 → onStart → startSalvage → Mission.start(mapId)
check("部署界面选 M02 后启动即跑 M02", ev(`
  (function(){ Meta.load(); Meta.data.runs=9;
    MenuShell.selMap='M02';
    MenuShell.onStart({op:'kestrel', gun:'K7', map:MenuShell.selMap});
    return CURRENT_MAP==='M02' && Mission.mapId==='M02' && Sluice.cfg!=null; })()`),
  "CURRENT_MAP=M02，Sluice 已随之加载");
check("幽灵潮痕记录并回放地图（挑战局公平的前提）", ev(`
  (function(){ Meta.load(); Meta.data.runs=9;
    Mission.start(777,false,'M02');
    Mission.end(true,'extracted');     // 触发 LastGhost 写入
    const code = GhostCodec.encode(LastGhost);
    const g = GhostCodec.decode(code);
    return !!(g && g.map==='M02' && g.seed===777); })()`));

/* ---------- 13. M02 渲染：水幕 + 电梯覆盖层不抛异常 ---------- */
console.log("\n-- M02 渲染 --");
run("Meta.load(); Meta.data.runs = 9; Mission.start(7,false,'M02'); Mission.entities.scavs.length=0;");
run(`
  // 快进到第一次泄洪进行中，并把玩家摁在电梯踏板上，触发 riding + 水幕覆盖层
  window.__ff(Sluice.events[0].t + 5, 1/30, true);
  PlayerMission.pos.x = LiftSystem.list[0].low.x;
  PlayerMission.pos.z = LiftSystem.list[0].low.z;
  for(let i=0;i<10;i++) Mission.update(1/30);
  try { drawSalvage(); window.__renderOK = true; window.__renderErr = ''; }
  catch(e){ window.__renderOK = false; window.__renderErr = String(e && e.stack || e); }
`);
check("M02 渲染（水幕 + 电梯覆盖层）不抛异常", ev("window.__renderOK===true"),
  "err=" + ev("window.__renderErr||''"));
check("渲染时确实处于水幕进行中", ev("Sluice.activeAt(TideMission.t).length>0"));
check("渲染时已检测到玩家在电梯上", ev("LiftSystem.ridingId()!==''"));

/* ---------- 14. P1-d 专长系统（槽 A）---------- */
console.log("\n-- P1-d 专长系统 --");
check("专长目录存在且字段已接 opVal 钩子", ev(`
  Object.keys(SALVAGE_PERKS).length>=4 && SALVAGE_PERKS.waveStep.effects[0].field==='swimSpeedMult'
  && SALVAGE_PERKS.surgeRun.effects[0].field==='highTideSpeed'`));
check("默认不选专长（perk=''）", ev("SalvageLoadout.perk")==='' && ev("MenuShell.selPerk")==='');
check("无专长时 opVal 走干员被动/默认值", ev("(SalvageLoadout.op='kestrel', SalvageLoadout.perk='', opVal('wading',1))")===0.5);
check("选踏浪后 swimSpeedMult 被专长覆盖", ev("(SalvageLoadout.op='kestrel', SalvageLoadout.perk='waveStep', opVal('swimSpeedMult',1))")===1.30);
check("选满潮疾行后 highTideSpeed 被专长覆盖", ev("(SalvageLoadout.op='kestrel', SalvageLoadout.perk='surgeRun', opVal('highTideSpeed',1))")===1.18);
check("选镇浪后同时给 anchorT / anchorDR", ev("(SalvageLoadout.perk='calmAnchor', opVal('anchorT',0)===1.2 && opVal('anchorDR',0)===0.30)"));
check("专长优先于同名干员被动", ev("(SalvageLoadout.op='gannel', SalvageLoadout.perk='ebbTide', opVal('speedMult',1))")===1.10);
check("专长随干员/配置切换不残留", ev("(SalvageLoadout.perk='', SalvageLoadout.op='kestrel', opVal('highTideSpeed',1))")===1);
check("专长按撤离次数解锁（纯门槛，无成就纠缠）", ev("(Meta.load(), Meta.data.runs=0, ShellMeta.perkUnlocked('waveStep'))")===false && ev("(Meta.data.runs=9, ShellMeta.perkUnlocked('waveStep'))")===true && ev("(Meta.data.runs=8, ShellMeta.perkUnlocked('waveStep'))")===false);
check("镇浪在 15 次撤离后解锁", ev("(Meta.data.runs=15, ShellMeta.perkUnlocked('calmAnchor'))")===true);
// 专长真实改变玩家速度（用 PlayerMission.speed 验证"可感知"）；满潮疾行只在满潮段生效，故先快进到满潮
run("Meta.load(); Meta.data.runs=9; Mission.start(4242,false,'M01');");
run(`
  Mission.entities.scavs.length=0; Mission.entities.drones.length=0;
  if(Mission.entities.warden) Mission.entities.warden.state='DEAD';
  window.__ff(455, 1/30, true);                    // 进入满潮段（420-600s）
  // 站在满潮期仍高出水面（depth<0.30）的干地上，隔离水位对移速的影响，只测专长乘区。
  // WaterState.update 是带滞后的状态机（cur 会跨帧累积），这里显式归零，
  // 避免快进时玩家在深水里把 cur 顶到 Wading，导致"无水位置"误判成涉水。
  PlayerMission.pos.x=10; PlayerMission.pos.z=20;
  WaterState.cur=0; PlayerMission.speed();          // 先让水位状态机落到稳定 Dry
  salvOp = SALVAGE_OPS.kestrel; SalvageLoadout.op='kestrel'; SalvageLoadout.perk='';
  globalThis.__v0 = PlayerMission.speed();
  SalvageLoadout.perk='surgeRun'; globalThis.__vS = PlayerMission.speed();   // 满潮疾行 +18%
  SalvageLoadout.perk='ebbTide'; globalThis.__vE = PlayerMission.speed();    // 回潮 +10%
`);
check("满潮疾行在满潮段确实提速", ev("__vS > __v0"),
  "v0=" + ev("__v0.toFixed(2)") + " 满潮疾行=" + ev("__vS.toFixed(2)"));
check("回潮全局提速", ev("__vE > __v0"), "回潮=" + ev("__vE.toFixed(2)"));

/* ---------- 15. P1-b 验收：加图只写配置 ---------- */
console.log("\n-- P1-b 验收：加图只写配置 --");
check("逻辑代码里没有按地图 id 的硬编码分支",
  (SRC.match(/CURRENT_MAP\s*===\s*['"][^'"]+['"]/g) || []).length === 0,
  "未发现 `CURRENT_MAP==='xx'` 形式的地图分支");
check("M02 未在逻辑层被特殊照顾（全走通用系统）",
  (SRC.match(/['"]M02['"]/g) || []).length <= 1,
  "逻辑层 'M02' 出现 " + ((SRC.match(/['"]M02['"]/g) || []).length) + " 次（应仅见于地图解锁判定）");

console.log("\n" + "=".repeat(70));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS" : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(70));
process.exit(fail === 0 ? 0 : 1);
