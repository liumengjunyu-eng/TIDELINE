// tools/test_unlock_headless.js
// P1-a 成就式解锁 的无浏览器回归测试。
// 核心主张：**锁定卡是钩子，不是障碍。**
// 每一条断言都在守护同一件事——玩家必须能在游戏里看见"还能这么玩"。
// 运行： cd TIDELINE/game && node tools/test_unlock_headless.js

const fs = require("fs"), path = require("path"), vm = require("vm");
const HTML = path.join(__dirname, "..", "..", "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");
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
  return { textContent: "", innerHTML: "", style: {}, dataset: {}, hidden: false,
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
// 重置到"刚建号"状态
const fresh = (runs) => run(`Meta.load(); Meta.data.credits=0; Meta.data.runs=${runs||0};`
  + `Meta.data.extracted=0; Meta.data.totalHaul=0; Meta.data.achDone={}; Meta.data.bestHaul=0;`);

console.log("=".repeat(66));
console.log("TIDELINE · P1-a 成就式解锁 回归测试");
console.log("=".repeat(66));

/* ---------- 1. 解锁表完整性 ---------- */
console.log("\n-- 解锁表 --");
check("除隼（初始干员）外每名干员都有成就路径", ev(`
  (function(){
    const need = OPS.filter(o=>o.unlock>0).map(o=>o.id);
    return need.every(id=>UNLOCKS[id] && UNLOCKS[id].ach && UNLOCKS[id].hint);
  })()`), "应覆盖 " + ev("OPS.filter(o=>o.unlock>0).length") + " 名干员");
check("每个成就都有能被玩家读懂的文案", ev(`
  Object.values(UNLOCKS).every(u=>u.ach.text && u.ach.text.length>=6)`));
check("保底次数路径全部保留（防卡关）", ev(`
  (function(){
    return OPS.filter(o=>o.unlock>0).every(o=>UNLOCKS[o.id] && UNLOCKS[o.id].runs===o.unlock);
  })()`), "成就路径失败时仍可靠累计撤离解锁");

/* ---------- 2. 成就判定 ---------- */
console.log("\n-- 成就判定 --");
fresh();
const ach1 = JSON.parse(ev(`JSON.stringify(evalAchievements(
  {extracted:true, kills:0, value:1200, phase:'Low', damageTaken:50, hpLeft:70}))`));
check("零击杀撤离 → 达成掠波成就", ach1.includes('skimmer'), JSON.stringify(ach1));
const ach2 = JSON.parse(ev(`JSON.stringify(evalAchievements(
  {extracted:true, kills:1, value:1200, phase:'Low', damageTaken:50, hpLeft:70}))`));
check("击杀 1 个即失去掠波资格（条件二元且脆弱）", !ach2.includes('skimmer'));
const ach3 = JSON.parse(ev(`JSON.stringify(evalAchievements(
  {extracted:true, kills:5, value:8000, phase:'High', damageTaken:900, hpLeft:5}))`));
check("一局可同时达成多个成就", ach3.length >= 5,
      ach3.length + " 项：" + ach3.join('/'));
const ach4 = JSON.parse(ev(`JSON.stringify(evalAchievements(
  {extracted:false, reason:'killed', kills:0, value:9000, phase:'High', damageTaken:900, hpLeft:0}))`));
check("阵亡则不计入「需要撤离」的成就", ach4.length === 0,
      "带出 ⌾9000 但没撤出 → 无成就");
check("累计带出成就不要求本局撤离", ev(`
  (function(){ Meta.data.totalHaul=60000;
    return evalAchievements({extracted:false,kills:0,value:0,phase:'Low',damageTaken:0,hpLeft:0})
      .includes('ledger'); })()`), "账房按累计值解锁");

/* ---------- 3. 双路径解锁 ---------- */
console.log("\n-- 双路径解锁 --");
fresh();
run("Meta.data.extracted=1;");
check("未达成成就 + 次数不足 → 锁定", ev("ShellMeta.opUnlocked('skimmer')") === false);
run("Meta.data.achDone={skimmer:true};");
check("成就路径：撤离 1 次即可解锁（无需熬到 9 次）",
      ev("ShellMeta.opUnlocked('skimmer')") === true,
      "extracted=" + ev("Meta.data.extracted") + " 次，runs 保底线 9 次");
fresh();
run("Meta.data.extracted=9;");
check("次数保底路径：不碰成就也能解锁", ev("ShellMeta.opUnlocked('skimmer')") === true,
      "撤离 9 次");
fresh();
check("隼始终解锁（初始干员）", ev("ShellMeta.opUnlocked('kestrel')") === true);
check("未达成时其他干员仍锁定", ev(`
  ['cauldron','lamplight','bulwark','gannel','ledger','dredger']
    .every(id=>!ShellMeta.opUnlocked(id))`));

/* ---------- 4. 锁定卡文案（钩子必须可读）---------- */
console.log("\n-- 锁定卡文案 --");
fresh();
const txt = ev("ShellMeta.opLockText('skimmer')");
check("锁定卡写出「一枪不开地回来」这句钩子", txt.includes('一枪不开地回来'), txt.slice(0, 46) + "…");
check("锁定卡写明成就条件全文", txt.includes('全程 0 击杀完成撤离'));
check("锁定卡写明保底路径", txt.includes('或再撤离 9 次'));
// 集成检查：文案不只要能生成，还必须真的出现在部署屏 DOM 里
run("Meta.load(); MenuShell.renderDeploy();");
const rowHtml = ev("document.getElementById('opRow').innerHTML");
check("部署屏锁定卡真的渲染出成就钩子", rowHtml.includes('一枪不开地回来'),
      "opRow 内含 " + (rowHtml.match(/一枪不开地回来/g)||[]).length + " 处");
check("锁定卡上不出现旧的纯次数文案", !/撤离 \d+ 次解锁/.test(rowHtml));
const txtL = ev("ShellMeta.opLockText('ledger')");
check("累积型成就显示进度数字", /50,000/.test(txtL) && /0 \/ 50000|0 \/ 50,000/.test(txtL),
      txtL.replace(/<[^>]+>/g, ' ').trim());

/* ---------- 5. 局内实时追踪（最关键的一层）---------- */
console.log("\n-- 局内实时成就追踪 --");
fresh();
run("Mission.start(); PlayerMission.kills=0; BackPack.items=[];");
check("开局零击杀 → HUD 显示「无痕」",
      ev("liveAchievements().some(a=>a.id==='skimmer')"),
      "tag=" + JSON.stringify(ev("(liveAchievements().find(a=>a.id==='skimmer')||{}).tag")));
run("PlayerMission.kills=1;");
check("开一枪即失去无痕标记（一次失误、不可恢复）",
      ev("!liveAchievements().some(a=>a.id==='skimmer')"));
run("BackPack.items=[{value:6000,name:'x',kg:1}]; PlayerMission.kills=0;");
check("带出 ⌾6000 → 显示「满载」",
      ev("liveAchievements().some(a=>a.id==='lamplight')"),
      "tag=" + JSON.stringify(ev("(liveAchievements().find(a=>a.id==='lamplight')||{}).tag")));
run("PlayerMission.dmgTaken=850;");
check("承伤 850 → 显示「硬扛」", ev("liveAchievements().some(a=>a.id==='bulwark')"));
run("TideMission.t=430; TideMission.phase='High';");
check("满潮 → 显示「现在撤离」", ev("liveAchievements().some(a=>a.id==='gannel')"));
run("Meta.data.achDone={skimmer:true}; PlayerMission.kills=0;");
check("已解锁的干员不再刷提示", ev("!liveAchievements().some(a=>a.id==='skimmer')"));
run("PlayerMission.dead=true;");
check("阵亡后不再显示成就追踪", ev("liveAchievements().length") === 0);

/* ---------- 6. 「就差一点」复玩钩子 ---------- */
console.log("\n-- 就差一点 --");
fresh();
const nm1 = JSON.parse(ev(`JSON.stringify(nearMiss(
  {extracted:true, value:4300, kills:2, phase:'Low', damageTaken:120, hpLeft:60}))`));
check("擦肩而过时给出具体差额", nm1.length > 0 && /再贪 ⌾700/.test(nm1[0]),
      nm1[0] || "(空)");
const nm2 = JSON.parse(ev(`JSON.stringify(nearMiss(
  {extracted:false, reason:'killed', kills:0, value:0, phase:'Low', damageTaken:200, hpLeft:0}))`));
check("零击杀阵亡时提示「活着撤出去就能解锁掠波」",
      nm2.some(s=>s.includes('掠波') && s.includes('零击杀')), nm2[0] || "(空)");
run("Meta.data.achDone={skimmer:true,lamplight:true,cauldron:true,bulwark:true,dredger:true,gannel:true};");
const nm3 = JSON.parse(ev(`JSON.stringify(nearMiss(
  {extracted:true, value:4300, kills:2, phase:'Low', damageTaken:120, hpLeft:60}))`));
check("已解锁的目标不再提示", nm3.every(s=>!s.includes('渔火')), JSON.stringify(nm3));
check("提示最多 2 条（不刷屏）", nm1.length <= 2, nm1.length + " 条");

/* ---------- 7. 结算闭环 + 存档 ---------- */
console.log("\n-- 结算闭环 --");
fresh();
run(`
  Mission.start();
  BackPack.items=[{value:1500,name:'打捞物',kg:2}];
  PlayerMission.kills=0; PlayerMission.dmgTaken=30;
  Mission.end(true,'extracted');
`);
check("零击杀撤离 → 结算即解锁掠波",
      ev("Mission.result.newOps.includes('skimmer')"),
      "newOps=" + JSON.stringify(ev("Mission.result.newOps")));
check("成就写入存档（下次开局仍解锁）", ev("Meta.data.achDone.skimmer") === true);
check("本局计入累计带出", ev("Meta.data.totalHaul") === 1500, "totalHaul=" + ev("Meta.data.totalHaul"));
check("结算附带「下一个目标」提示", ev("(Mission.result.nearMiss||[]).length") > 0,
      JSON.stringify(ev("Mission.result.nearMiss")));
run("Meta.load();");
check("成就可从 localStorage 恢复", ev("Meta.data.achDone && Meta.data.achDone.skimmer") === true);
check("恢复后掠波仍为已解锁", ev("ShellMeta.opUnlocked('skimmer')") === true);

console.log("\n" + "=".repeat(66));
console.log(fail === 0 ? "全部通过：" + pass + " 项 PASS"
                       : "有 " + fail + " 项 FAIL / 共 " + (pass + fail) + " 项");
console.log("=".repeat(66));
process.exit(fail === 0 ? 0 : 1);
