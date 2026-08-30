// tools/test_ghost_headless.js
// P1-c.1 幽灵竞速：轨迹录制（GhostRecorder）+ 分享码编解码（GhostCodec）回归测试。
//   1) 编解码纯逻辑：合成「潮痕」→ 编码 → 解码，关键字段逐一对齐（含量化容差）
//   2) 完整性校验：篡改分享码 → 解码返回 null（防损坏/防作弊的第一道关）
//   3) 任务链路：真实跑一局，拾取/开火/击杀/撤离都会被录进轨迹，并产出可编码的 LastGhost
//   4) 挑战模式锁定满编：novice 强制 false，同一 seed 复现同一张地图（公平前提）
// 运行： cd TIDELINE/game && node tools/test_ghost_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g);
const SRC = blocks[blocks.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

/* ---------- 最小 DOM 桩（与 test_seed_headless 同款） ---------- */
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
const hasEvent = (dec, evName) => dec.samples.some(s => s.event === evName);

console.log("=".repeat(66));
console.log("TIDELINE · P1-c.1 幽灵竞速（录制 + 分享码）回归测试");
console.log("=".repeat(66));

/* ---------- 1. 编解码纯逻辑：合成潮痕 → 编码 → 解码 ---------- */
console.log("\n-- 编解码闭环（含量化容差）--");
const GSYN = `{ seed:123456, op:'kestrel', gun:'K7', novice:false, value:4321, kills:3, t:247.3,
  extracted:true, samples:[
    {t:0,x:-24,z:2},{t:2,x:-20.3,z:5.7},{t:4.1,x:0.4,z:10.2,event:'loot'},
    {t:6,x:5,z:8,event:'kill'},{t:247.3,x:18,z:-15,event:'extract'} ] }`;
const synCode = ev("GhostCodec.encode(" + GSYN + ");");
const synDec = ev("GhostCodec.decode(" + JSON.stringify(synCode) + ");");
check("编码产出非空字符串", typeof synCode === "string" && synCode.length > 0, "len=" + synCode.length);
check("解码非 null", synDec !== null);
check("种子逐字节一致", synDec && synDec.seed === 123456, "seed=" + (synDec && synDec.seed));
check("干员 id 一致", synDec && synDec.op === 'kestrel');
check("武器 id 一致", synDec && synDec.gun === 'K7');
check("novice 一致", synDec && synDec.novice === false);
check("撤离价值一致", synDec && synDec.value === 4321, "val=" + (synDec && synDec.value));
check("击杀数一致", synDec && synDec.kills === 3);
check("撤离标志一致", synDec && synDec.extracted === true);
check("撤离用时量化误差 < 0.1s", synDec && Math.abs(synDec.t - 247.3) < 0.1, "t=" + (synDec && synDec.t));
check("样本总数一致（2 位置 + 3 事件 = 5）", synDec && synDec.samples.length === 5, "n=" + (synDec && synDec.samples.length));
check("含 loot 事件", synDec && hasEvent(synDec, 'loot'));
check("含 kill 事件", synDec && hasEvent(synDec, 'kill'));
check("含 extract 事件（回放结尾）", synDec && hasEvent(synDec, 'extract'));
check("位置量化误差 < 0.5m", synDec && (() => {
  const ps = synDec.samples.filter(s => !s.event);
  return ps.every(s => Math.abs(s.x) <= 32 && Math.abs(s.z) <= 32)
      && Math.abs(ps[0].x + 24) < 0.01 && Math.abs(ps[0].z - 2) < 0.01
      && Math.abs(ps[1].x + 20.3) < 0.5 && Math.abs(ps[1].z - 5.7) < 0.5;
})(), "");

/* ---------- 2. 完整性校验：篡改 → null ---------- */
console.log("\n-- 完整性校验（防损坏 / 防作弊）--");
const flipped = synCode.slice(0, 8) + (synCode[8] === 'A' ? 'B' : 'A') + synCode.slice(9);
const decBad = ev("GhostCodec.decode(" + JSON.stringify(flipped) + ");");
check("篡改分享码体 → 解码返回 null", decBad === null);
check("空字符串 → null", ev("GhostCodec.decode('')") === null);
check("乱码 → null", ev("GhostCodec.decode('not-a-code')") === null);
check("无校验和分隔符 → null", ev("GhostCodec.decode('abcdef')") === null);

/* ---------- 3. 任务链路：真实一局，录制 → LastGhost → 编码 ---------- */
console.log("\n-- 任务链路（真实录制）--");
run("Meta.load(); Meta.data.runs = 9; Mission.start(777);");   // 满编难度
run(`for(let i=0;i<600;i++){ PlayerMission.pos.x = -24 + i*0.05; PlayerMission.pos.z = 2 + i*0.02; Mission.update(1/60); }`);
// 拾取：把玩家移到一件战利品上并拿走
run(`const it = (LootSystem.items.find(x=>!x.taken) || LootSystem.items[0]);
     PlayerMission.pos.x = it.pos.x; PlayerMission.pos.z = it.pos.z; BackPack.take(it);`);
const lootOk = ev("GhostRecorder.samples.some(s=>s.event==='loot')");
check("拾取被录为 loot 事件", lootOk);
// 开火 + 击杀：清场除一个置于正前方的残血敌人
run(`playerYaw=0;
     for(const s of Mission.entities.scavs){ s.pos.x=PlayerMission.pos.x+100; s.pos.z=PlayerMission.pos.z+100; }
     for(const d of Mission.entities.drones){ d.pos.x=PlayerMission.pos.x+100; d.pos.z=PlayerMission.pos.z+100; }
     Mission.entities.warden.pos.x=PlayerMission.pos.x+100; Mission.entities.warden.pos.z=PlayerMission.pos.z+100;
     const sc=Mission.entities.scavs[0]; sc.pos.x=PlayerMission.pos.x; sc.pos.z=PlayerMission.pos.z-5; sc.hp=1;
     fireSalvage();`);
check("开火触发破无痕 fire 事件", ev("GhostRecorder.samples.some(s=>s.event==='fire')"));
check("击杀被录为 kill 事件", ev("GhostRecorder.samples.some(s=>s.event==='kill')"));
// 撤离
run("Mission.end(true,'extracted');");
check("本局结束产出 LastGhost", ev("LastGhost !== null"));
const ghostCode = ev("GhostCodec.encode(LastGhost);");
const ghostDec = ev("GhostCodec.decode(" + JSON.stringify(ghostCode) + ");");
check("LastGhost 可编码且解码非 null", ghostDec !== null);
check("解码 op/gun 来自本局配置", ghostDec && ghostDec.op === 'kestrel' && ghostDec.gun === 'K7',
      "op=" + (ghostDec && ghostDec.op) + " gun=" + (ghostDec && ghostDec.gun));
check("解码 extracted=true", ghostDec && ghostDec.extracted === true);
check("解码含 loot/fire/kill/extract 四类事件",
      ghostDec && hasEvent(ghostDec,'loot') && hasEvent(ghostDec,'fire') && hasEvent(ghostDec,'kill') && hasEvent(ghostDec,'extract'));
check("位置采样已记录（轨迹非空）", ghostDec && ghostDec.samples.filter(s=>!s.event).length >= 3,
      "pos=" + (ghostDec && ghostDec.samples.filter(s=>!s.event).length));
check("分享码体量 < 4KB（2s 采样 · 10s 测试局）", ghostCode.length < 4096, "len=" + ghostCode.length);

/* ---------- 4. 挑战模式锁定满编难度 ---------- */
console.log("\n-- 挑战模式：novice 强制 false（公平复现前提）--");
run("Meta.load(); Meta.data.runs = 0;");          // 正常应为新手局
run("Mission.start(555);");
const noviceNormal = ev("Mission.novice");
const scavNormal = ev("Mission.entities.scavs.length");
run("Mission.start(555, true);");                  // 挑战模式
const noviceChal = ev("Mission.novice");
const chalFlag = ev("Mission.challenge");
const scavChal = ev("Mission.entities.scavs.length");
check("正常首局 = 新手（novice true, 6 敌）", noviceNormal === true && scavNormal === 6, "novice=" + noviceNormal + " scav=" + scavNormal);
check("挑战模式 novice 强制 false", noviceChal === false, "novice=" + noviceChal);
check("挑战模式 flag 置位", chalFlag === true);
check("挑战模式满编 12 敌（无教学壳）", scavChal === 12, "scav=" + scavChal);
// 同一 seed 在挑战模式与正常满编局复现同一张地图
const SNAP = `JSON.stringify({
  loot: LootSystem.items.map(i=>({x:+i.pos.x.toFixed(3),z:+i.pos.z.toFixed(3),v:i.value})),
  scav: Mission.entities.scavs.map(s=>({x:+s.pos.x.toFixed(3),z:+s.pos.z.toFixed(3)}))
})`;
run("Meta.data.runs = 9; Mission.start(555);"); const mapFull = ev(SNAP);
run("Mission.start(555, true);");              const mapChal = ev(SNAP);
check("挑战模式复现与满编同种子同一地图", mapFull === mapChal);

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS" : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
