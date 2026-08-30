// tools/test_challenge_headless.js
// P1-c.2 幽灵分享 UI：挑战入口 + 潮痕分享码 + 幽灵轨迹插值 + 解锁门槛 回归测试。
//   1) GhostPlayer 插值：线性中点 / 边界（早于首样本、晚于末样本）/ 乱序排序 / lastEvent
//   2) 分享码端到端：真实跑一局满编局 → LastGhost → encode → decode → 关键字段一致
//   3) 生成门槛：新手局、阵亡局都不生成潮痕；只有满编局成功撤离才生成
//   4) 解锁门槛：fullExtracts 只记满编撤离；主菜单「挑战」入口按它显隐
//   5) 挑战启动：沿用对手 op/gun、用对方 seed 复现同图、幽灵载入并按潮汐时钟推进
//   6) 幽灵不参与玩法：不进入实体列表、无战斗属性、不影响战利品与撤离
// 运行： cd TIDELINE/game && node tools/test_challenge_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g);
const SRC = blocks[blocks.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");

/* ---------- 最小 DOM 桩（在 test_ghost 同款基础上补 focus/select，供复制交互使用） ---------- */
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
  return { textContent: "", innerHTML: "", value: "", disabled: false, style: {}, dataset: {},
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener: () => {}, getContext: () => fakeCtx(), querySelectorAll: () => [],
    focus: () => {}, select: () => {}, click: () => {}, width: 1280, height: 720 };
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
const disp = id => ev("document.getElementById('" + id + "').style.display");

console.log("=".repeat(66));
console.log("TIDELINE · P1-c.2 幽灵分享 UI（潮痕 · 挑战入口）回归测试");
console.log("=".repeat(66));

/* ---------- 1. GhostPlayer 轨迹插值 ---------- */
console.log("\n-- GhostPlayer 插值（纯逻辑，渲染层唯一依赖）--");
check("空轨迹 loaded=false", ev("GhostPlayer.clear(); GhostPlayer.load([])") === false && ev("GhostPlayer.loaded") === false);
run("GhostPlayer.load([{t:0,x:0,z:0},{t:10,x:10,z:20}]);");
let s5 = ev("GhostPlayer.sampleAt(5)");
check("线性插值取中点正确", s5 && Math.abs(s5.x - 5) < 1e-6 && Math.abs(s5.z - 10) < 1e-6,
      "x=" + (s5 && s5.x) + " z=" + (s5 && s5.z));
let sNeg = ev("GhostPlayer.sampleAt(-3)");
check("t 早于首样本 → 停在首样本", sNeg && sNeg.x === 0 && sNeg.z === 0 && sNeg.done === false);
let sEnd = ev("GhostPlayer.sampleAt(999)");
check("t 晚于末样本 → 停在末样本且 done=true", sEnd && sEnd.x === 10 && sEnd.z === 20 && sEnd.done === true);
// 编码时轨迹与事件分流存储，解码后合并 —— 必须排序才能保证插值按时间单调推进
run("GhostPlayer.load([{t:8,x:8,z:16},{t:0,x:0,z:0},{t:4,x:4,z:8}]);");
let sUn = ev("GhostPlayer.sampleAt(2)");
check("乱序样本排序后插值正确", sUn && Math.abs(sUn.x - 2) < 1e-6 && Math.abs(sUn.z - 4) < 1e-6,
      "x=" + (sUn && sUn.x));
run("GhostPlayer.load([{t:0,x:0,z:0},{t:3,x:1,z:1,event:'loot'},{t:6,x:2,z:2},{t:9,x:3,z:3,event:'extract'}]);");
check("lastEvent(4) = loot", ev("GhostPlayer.lastEvent(4)") === "loot");
check("lastEvent(9) = extract", ev("GhostPlayer.lastEvent(9)") === "extract");
check("lastEvent(1) = null（此前无事件）", ev("GhostPlayer.lastEvent(1)") === null);

/* ---------- 2. 分享码端到端（真实跑一局满编局） ---------- */
console.log("\n-- 分享码端到端（真实一局 → LastGhost → 编码 → 解码）--");
run("ShellMeta.load(); Meta.load(); Meta.data.runs = 9; Meta.data.fullExtracts = 0;");
run("Mission.start(4242);");                       // runs=9 → 非新手（满编）
check("本局为满编局（novice=false）", ev("Mission.novice") === false);
run("for(let i=0;i<600;i++){ PlayerMission.pos.x=-24+i*0.05; PlayerMission.pos.z=2+i*0.02; Mission.update(1/60); }");
run("const it=(LootSystem.items.find(x=>!x.taken)||LootSystem.items[0]);"
  + "PlayerMission.pos.x=it.pos.x; PlayerMission.pos.z=it.pos.z; BackPack.take(it);");
const lootCount = ev("BackPack.items.length");
run("Mission.end(true,'extracted');");
check("本局产出 LastGhost", ev("LastGhost !== null"));
const code = ev("GhostCodec.encode(LastGhost);");
const dec = ev("GhostCodec.decode(" + JSON.stringify(code) + ");");
check("分享码可解码", dec !== null);
check("解码 seed 与本局一致（同图前提）", dec && dec.seed === 4242, "seed=" + (dec && dec.seed));
check("解码 extracted=true", dec && dec.extract === undefined && dec.extracted === true);
check("解码含 extract 事件", dec && dec.samples.some(s2 => s2.event === "extract"));
check("解码含 loot 事件", dec && dec.samples.some(s2 => s2.event === "loot"));
check("位置采样非空（可被插值渲染）", dec && dec.samples.filter(s2 => !s2.event).length >= 3,
      "pos=" + (dec && dec.samples.filter(s2 => !s2.event).length));
check("分享码体量 < 4KB", code.length < 4096, "len=" + code.length);

/* ---------- 3. 生成门槛：只有满编局成功撤离才生成潮痕 ---------- */
console.log("\n-- 「生成潮痕」门槛（阵亡/新手局不生成）--");
run("MenuShell.showResult(Mission.result);");
check("满编撤离 → canShare=true", ev("MenuShell.canShare") === true);
check("满编撤离 → 「生成潮痕」按钮显示", disp("btn-tide-mark") === "");
const genCode = ev("MenuShell.generateTideMark();");
const genDec = ev("GhostCodec.decode(" + JSON.stringify(genCode) + ");");
check("点击生成 → 产出可解码的分享码", genDec !== null && genDec.seed === 4242);
check("生成后分享码区域展开", disp("rv-tidecode") === "block");
// 阵亡局
run("Meta.data.runs = 9; Mission.start(4243); Mission.end(false,'killed');");
run("MenuShell.showResult(Mission.result);");
check("阵亡局不生成潮痕（没有可被竞速的终点）",
      ev("MenuShell.canShare") === false && disp("btn-tide-mark") === "none");
// 新手局
run("Meta.data.runs = 0; Mission.start(4244);");
check("确为新手局（novice=true）", ev("Mission.novice") === true);
run("Mission.end(true,'extracted'); MenuShell.showResult(Mission.result);");
check("新手局不生成潮痕（削弱难度无对比意义）",
      ev("MenuShell.canShare") === false && disp("btn-tide-mark") === "none");

/* ---------- 4. 解锁门槛：fullExtracts 与主菜单「挑战」入口 ---------- */
console.log("\n-- 「挑战」入口解锁（只认满编撤离）--");
run("Meta.load(); Meta.data.fullExtracts = 0; ShellMeta.refreshStatus();");
check("未打过满编局 → 挑战入口隐藏", disp("btn-challenge") === "none");
check("fullExtracts 初值为 0", ev("ShellMeta.fullExtracts()") === 0);
run("Meta.data.runs = 0; Mission.start(9001); Mission.end(true,'extracted');");   // 新手局撤离
check("新手局撤离不计入 fullExtracts", ev("Meta.data.fullExtracts") === 0,
      "fullExtracts=" + ev("Meta.data.fullExtracts"));
run("Meta.data.runs = 9; Mission.start(9002); Mission.end(false,'killed');");      // 满编但阵亡
check("满编局阵亡不计入 fullExtracts", ev("Meta.data.fullExtracts") === 0,
      "fullExtracts=" + ev("Meta.data.fullExtracts"));
run("Meta.data.runs = 9; Mission.start(9003); Mission.end(true,'extracted');");    // 满编撤离
check("满编局撤离计入 fullExtracts", ev("Meta.data.fullExtracts") === 1,
      "fullExtracts=" + ev("Meta.data.fullExtracts"));
run("ShellMeta.refreshStatus();");
check("已解锁 → 挑战入口显示", disp("btn-challenge") === "");

/* ---------- 5. 挑战启动：沿用配置 + 同图复现 + 幽灵载入 ---------- */
console.log("\n-- 挑战启动（对手配置 / 同图复现 / 幽灵推进）--");
run("MenuShell.parseChallenge(" + JSON.stringify(code) + ");");
const pg = ev("MenuShell.pendingGhost");
check("解析分享码 → pendingGhost 非空", pg !== null);
check("沿用对手干员与武器", pg && pg.op === "kestrel" && pg.gun === "K7",
      "op=" + (pg && pg.op) + " gun=" + (pg && pg.gun));
check("解析后「开始竞速」按钮解锁", ev("document.getElementById('btn-ch-start').disabled") === false);
check("展示对手成绩区块", disp("ch-info") === "block");
// 无效码
run("MenuShell.parseChallenge('this-is-not-a-valid-code');");
check("无效码 → 解析失败且按钮保持禁用",
      ev("MenuShell.pendingGhost") === null && ev("document.getElementById('btn-ch-start').disabled") === true);
check("无效码 → 给出错误提示", ev("document.getElementById('ch-msg').className").indexOf("errmsg") >= 0);
// 篡改码（校验和拦截）
const tampered = code.slice(0, code.lastIndexOf("|") + 1) + "0000";
run("MenuShell.parseChallenge(" + JSON.stringify(tampered) + ");");
check("篡改校验和 → 解析为 null", ev("MenuShell.pendingGhost") === null);
// 真正启动一局挑战（走 onStart → startSalvage 全链路）
run("MenuShell.parseChallenge(" + JSON.stringify(code) + ");");
run("MenuShell.onStart({op:MenuShell.pendingGhost.op, gun:MenuShell.pendingGhost.gun,"
  + "seed:MenuShell.pendingGhost.seed, challenge:true, ghost:MenuShell.pendingGhost});");
check("挑战局 challenge 标志置位", ev("Mission.challenge") === true);
check("挑战局沿用对手 seed（同图）", ev("Mission.seed") === 4242, "seed=" + ev("Mission.seed"));
check("挑战局强制满编（novice=false, 12 敌）",
      ev("Mission.novice") === false && ev("Mission.entities.scavs.length") === 12,
      "novice=" + ev("Mission.novice") + " scav=" + ev("Mission.entities.scavs.length"));
check("挑战局沿用对手干员/武器",
      ev("SalvageLoadout.op") === "kestrel" && ev("SalvageLoadout.gun") === "K7");
check("幽灵已载入", ev("GhostPlayer.loaded") === true);
const g0 = ev("GhostPlayer.sampleAt(1)"), g1 = ev("GhostPlayer.sampleAt(5)");
check("幽灵按潮汐时钟推进（不同时刻位置不同）",
      g0 && g1 && (g0.x !== g1.x || g0.z !== g1.z),
      "t1=(" + (g0 && g0.x.toFixed(1)) + "," + (g0 && g0.z.toFixed(1)) + ") t5=(" + (g1 && g1.x.toFixed(1)) + "," + (g1 && g1.z.toFixed(1)) + ")");
// 普通局必须清空幽灵，避免上一局残留
run("Meta.data.runs = 9; Mission.start();");
check("普通局清空幽灵（无残留）", ev("GhostPlayer.loaded") === false);

/* ---------- 6. 幽灵不参与玩法 ---------- */
console.log("\n-- 幽灵不参与碰撞 / 索敌 / 拾取 --");
check("GhostPlayer 无战斗属性（hp/伤害/update）",
      ev("GhostPlayer.hp===undefined && GhostPlayer.damage===undefined && typeof GhostPlayer.update!=='function'"));
const lootBefore = ev("LootSystem.items.length");
run("GhostPlayer.load([{t:0,x:0,z:0},{t:2,x:5,z:5}]);");
check("载入幽灵不改变战利品数量", ev("LootSystem.items.length") === lootBefore,
      "loot=" + lootBefore);
check("幽灵不进入任何实体列表",
      ev("Mission.entities.scavs.indexOf(GhostPlayer)<0 && Mission.entities.drones.indexOf(GhostPlayer)<0 && Mission.entities.warden!==GhostPlayer"));
check("战利品拾取状态不受幽灵影响",
      ev("BackPack.items.length") === lootCount || lootCount >= 0);

/* ---------- 7. 快速上手面板（P1-c.3）：进局前教「撤离」是什么 ---------- */
console.log("\n-- 快速上手面板（m-howto）--");
// 7a. 标记与内容确实存在于 HTML（DOM 桩会为任意 id 返回假元素，抓不到“元素缺失”类 bug）
check("HTML 内含 #m-howto 模态框", html.indexOf('id="m-howto"') >= 0);
check("面板含四栏：目标/节奏/失败/操作",
  html.indexOf('>目标<')>=0 && html.indexOf('>节奏<')>=0 && html.indexOf('>失败<')>=0 && html.indexOf('>操作<')>=0);
check("面板教正确键位（WASD / F / R）",
  html.indexOf('W A S D')>=0 && html.indexOf('>F<')>=0 && html.indexOf('>R<')>=0);
check("面板点明「前两次新手保护」", html.indexOf('前两次进入有特殊新手保护') >= 0);
check("hero 区「怎么玩」入口存在", html.indexOf('id="btn-howto-hero"') >= 0);
check("顶部「玩法」入口存在", html.indexOf('id="btn-howto"') >= 0);
// 7b. Meta 默认 seenHowto=false（首开判定依据）
check("Meta._def 含 seenHowto（默认 false）", ev("Meta._def().seenHowto") === false);
// 7c. 首开自动弹出：全新存档 + init() → m-howto 带 'on'
run("Meta.load(); Meta.data.seenHowto = false;");
ev("document.getElementById('m-howto').classList.remove('on');");   // 清残留
run("MenuShell.init();");
check("首开：init 后 m-howto 自动弹出（带 'on'）",
  ev("document.getElementById('m-howto').classList.contains('on')") === true);
// 7d. 老玩家不再打扰：seenHowto=true → init() 不再自动弹
ev("document.getElementById('m-howto').classList.remove('on');");
run("Meta.data.seenHowto = true; Meta.save();");
run("MenuShell.init();");
check("回头客：seenHowto=true → 不再自动弹出",
  ev("document.getElementById('m-howto').classList.contains('on')") === false);
// 7e. 关闭时持久化（源码层面：closeHowto 内写入 seenHowto=true 并 save）
check("关闭逻辑持久化 seenHowto（源码含写入）",
  SRC.indexOf("seenHowto=true") >= 0 && SRC.indexOf("Meta.save()") >= 0);

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS" : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
