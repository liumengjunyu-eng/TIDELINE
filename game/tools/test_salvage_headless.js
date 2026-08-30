// tools/test_salvage_headless.js
// SALVAGE 单人潮汐撤离模式的无浏览器冒烟测试。
// 复用与 test_breach_headless.js 相同的 vm + DOM 桩，驱动 SALVAGE 仿真层并断言。
// 运行： cd TIDELINE/game && node tools/test_salvage_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const SRC = (function(){ // 第一个内联 <script> 是 three.js 库，主游戏逻辑在最后一个块
  const _b = fs.readFileSync(HTML, "utf8").match(/<script>([\s\S]*?)<\/script>/g);
  return _b[_b.length-1].replace(/^<script>/,"").replace(/<\/script>$/,""); })();

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
const DT = 1 / 60;

console.log("=".repeat(66));
console.log("TIDELINE · SALVAGE 打捞 · 无浏览器冒烟测试");
console.log("=".repeat(66));

/* ---------- 0. 基线：固定为「老手局」----------
   注意：runs<2 时 Mission.start() 会自动套用新手模式（拾荒者 6 名 / 三幕时长 ×1.5 /
   HARD_CAP 900s / 撤离点全程可见），本文件 2~4 段的断言全部基于标准局参数，
   因此先抬高 runs，避免首局新手模式导致假失败。新手模式单独在第 7 段验证。 */
run("Meta.load(); Meta.data.runs = 9;");

/* ---------- 1. 仿真数据完整性 ---------- */
console.log("\n-- 仿真数据层（标准局）--");
run("Mission.start()");   // 同时触发 MapHeight.init / LootSystem.spawn / 实体生成
check("地图网格 30x20 = 600 格", ev("MapHeight.grid.length") === 600,
      ev("MapHeight.nx") + "x" + ev("MapHeight.nz"));
check("战利品生成 25 件", ev("LootSystem.items.length") === 25,
      ev("LootSystem.items.length") + " 件");
check("拾荒者 12 名", ev("Mission.entities.scavs.length") === 12);
check("无人机 4 架", ev("Mission.entities.drones.length") === 4);
check("潮汐守望者 1 名", ev("Mission.entities.warden && Mission.entities.warden.hp===300"));
check("撤离点 4 个", ev("Extraction.points.length") === 4);
check("出生点不落在任何撤离点 2.5m 判定圈内", ev(`
  (function(){
    for(const p of Extraction.points)
      if(Math.hypot(PlayerMission.pos.x-p.pos.x, PlayerMission.pos.z-p.pos.z) < 2.5) return false;
    return true;
  })()`), "spawn=(" + ev("PlayerMission.pos.x") + "," + ev("PlayerMission.pos.z") + ")");
check("任务初始为 RUNNING", ev("Mission.state") === "RUNNING");

/* ---------- 2. 潮汐上涨（唯一水位写入方 = TideMission.tick）---------- */
console.log("\n-- 潮汐三阶段 --");
run("Mission.start(); PlayerMission.pos.x=0; PlayerMission.pos.z=0; PlayerMission.damage=function(){};");
check("起始水位 0", Math.abs(ev("TideMission.level")) < 1e-9, "level=" + ev("TideMission.level"));
run("for(let i=0;i<12000;i++) Mission.update(" + DT + ");"); // 200s -> Rising
check("200 秒进入涨潮", ev("TideMission.phase") === "Rising", "phase=" + ev("TideMission.phase"));
check("200 秒水位已达中段", ev("TideMission.level") > 0.15, "level=" + ev("TideMission.level").toFixed(2));
run("for(let i=0;i<25200;i++) Mission.update(" + DT + ");"); // 累计 620s -> High
check("满潮水位封顶 3.20m", Math.abs(ev("TideMission.level") - 3.2) < 1e-6,
      "level=" + ev("TideMission.level").toFixed(2));
check("满潮相位为 High", ev("TideMission.phase") === "High");

/* ---------- 3. 撤离判定（隔离敌人，纯撤离逻辑）---------- */
console.log("\n-- 撤离通道 --");
run(`
  Mission.start();
  PlayerMission.pos.x=26; PlayerMission.pos.z=-4;   // 南路码头（elev 1.0，永不关闭）
  PlayerMission.damage=function(){};
  BackPack.items=[];                                 // 空手
`);
check("开局南路码头可用（水位未淹）", ev("Extraction.active().some(p=>p.id==='南路码头')"));
run("for(let i=0;i<540;i++) Mission.update(" + DT + ");"); // 站满 8s
check("空手站撤离点不结算（堵死发呆通关）",
      ev("Mission.state") === "RUNNING" && ev("Extraction.blocked()") === true,
      "state=" + ev("Mission.state") + " blocked=" + ev("Extraction.blocked()"));
run(`
  LootSystem.items=[{pos:{x:26,z:-4},rarity:0,name:'普通',value:500,kg:1,taken:false}];
  BackPack.take(LootSystem.items[0]);
`);
check("拾取 1 件后撤离门槛解除", ev("Extraction.blocked()") === false,
      "背包 " + ev("BackPack.items.length") + " 件 / ⌾" + ev("BackPack.value"));
run("for(let i=0;i<540;i++) Mission.update(" + DT + ");"); // 通道需 8s
check("带战利品停留 8s 完成撤离", ev("Mission.state") === "ENDED" && ev("Mission.result.extracted") === true,
      "state=" + ev("Mission.state") + " reason=" + ev("Mission.result && Mission.result.reason"));
check("撤离成功记入局外数据", ev("Meta.data.extracted") === 1, "extracted=" + ev("Meta.data.extracted"));

/* ---------- 4. 超时结算（隔离敌人，纯计时逻辑）---------- */
console.log("\n-- 硬上限超时 --");
run(`
  Mission.start();
  PlayerMission.pos.x=0; PlayerMission.pos.z=0;
  PlayerMission.damage=function(){};
`);
run("for(let i=0;i<43800;i++) Mission.update(" + DT + ");"); // 超过 HARD_CAP 720s
check("超过 720s 硬上限自动结算", ev("Mission.state") === "ENDED", "state=" + ev("Mission.state"));
check("超时结局 reason=timeout", ev("Mission.result.reason") === "timeout",
      "reason=" + ev("Mission.result.reason"));

/* ---------- 5. 背包重量与经济 ---------- */
console.log("\n-- 背包 / 重量 --");
run(`
  BackPack.items=[];
  LootSystem.items=[{pos:{x:0,z:0},rarity:1,name:'稀有',value:700,kg:2,taken:false}];
  BackPack.take(LootSystem.items[0]);
`);
check("拾取后价值计入背包", ev("BackPack.value") === 700, "value=" + ev("BackPack.value"));
check("重量随物品累加", Math.abs(ev("BackPack.kg") - 2) < 1e-9, "kg=" + ev("BackPack.kg"));
check("软上限 20kg 内无惩罚", ev("BackPack.penalty") === 0);

/* ---------- 6. 全实体压力跑（捕获运行时异常）---------- */
console.log("\n-- 全实体压力跑（33s）--");
let threw = null;
try {
  run("Mission.start();");
  run(`
    for(let i=0;i<1980;i++){
      // 让玩家缓慢游走，触发涉水/战斗/撤离分支
      PlayerMission.pos.x = Math.max(-28, Math.min(28, PlayerMission.pos.x + 0.02));
      PlayerMission.pos.z = Math.max(-18, Math.min(18, PlayerMission.pos.z + 0.01));
      if(PlayerMission.hp < 30) PlayerMission.hp = 100;   // 防止中途阵亡打断潮汐观察
      Mission.update(${DT});
      if(Mission.state!=='RUNNING') break;
    }
  `);
} catch (e) { threw = e; }
check("全实体更新无运行时异常", threw === null, threw ? threw.message : "33s 无报错");
check("潮汐持续推进（水位>0）", ev("TideMission.level") > 0,
      "level=" + ev("TideMission.level").toFixed(2));
check("遥测埋点有产出", ev("Telemetry.events.length") > 0,
      ev("Telemetry.events.length") + " 条事件");

/* ---------- 7. 新手引导局（前两次进入自动套用简易模式）---------- */
console.log("\n-- 新手引导局 --");
run("Meta.load(); Meta.data.runs = 0; Mission.start();");
check("新手局拾荒者减半（6 名）", ev("Mission.entities.scavs.length") === 6,
      ev("Mission.entities.scavs.length") + " 名");
check("新手局三幕时长 ×1.5（低潮 0–270s）", ev("TideMission.PHASES[0].t1") === 270,
      "Low 结束于 " + ev("TideMission.PHASES[0].t1") + "s");
check("新手局硬上限 900s", ev("TideMission.HARD_CAP") === 900,
      "HARD_CAP=" + ev("TideMission.HARD_CAP") + "s");
check("新手局撤离点全程高亮", ev("Extraction.alwaysShow") === true);
check("新手局赠 1 级护甲（50）", ev("PlayerMission.armor") === 50,
      "armor=" + ev("PlayerMission.armor"));
run("Meta.load(); Meta.data.runs = 9; Mission.start();");
check("老手局恢复满编（12 名）", ev("Mission.entities.scavs.length") === 12,
      ev("Mission.entities.scavs.length") + " 名");
check("老手局硬上限 720s", ev("TideMission.HARD_CAP") === 720,
      "HARD_CAP=" + ev("TideMission.HARD_CAP") + "s");

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS"
                       : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
