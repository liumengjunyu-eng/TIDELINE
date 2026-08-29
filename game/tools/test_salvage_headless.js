// tools/test_salvage_headless.js
// SALVAGE 单人潮汐撤离模式的无浏览器冒烟测试。
// 复用与 test_breach_headless.js 相同的 vm + DOM 桩，驱动 SALVAGE 仿真层并断言。
// 运行： cd TIDELINE/game && node tools/test_salvage_headless.js

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
const DT = 1 / 60;

console.log("=".repeat(66));
console.log("TIDELINE · SALVAGE 打捞 · 无浏览器冒烟测试");
console.log("=".repeat(66));

/* ---------- 1. 仿真数据完整性 ---------- */
console.log("\n-- 仿真数据层 --");
run("Mission.start()");   // 同时触发 MapHeight.init / LootSystem.spawn / 实体生成
check("地图网格 30x20 = 600 格", ev("MapHeight.grid.length") === 600,
      ev("MapHeight.nx") + "x" + ev("MapHeight.nz"));
check("战利品生成 25 件", ev("LootSystem.items.length") === 25,
      ev("LootSystem.items.length") + " 件");
check("拾荒者 12 名", ev("Mission.entities.scavs.length") === 12);
check("无人机 4 架", ev("Mission.entities.drones.length") === 4);
check("潮汐守望者 1 名", ev("Mission.entities.warden && Mission.entities.warden.hp===300"));
check("撤离点 4 个", ev("Extraction.points.length") === 4);
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
`);
check("开局南路码头可用（水位未淹）", ev("Extraction.active().some(p=>p.id==='南路码头')"));
run("for(let i=0;i<540;i++) Mission.update(" + DT + ");"); // 通道需 8s
check("在撤离点停留 8s 完成撤离", ev("Mission.state") === "ENDED" && ev("Mission.result.extracted") === true,
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

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS"
                       : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
