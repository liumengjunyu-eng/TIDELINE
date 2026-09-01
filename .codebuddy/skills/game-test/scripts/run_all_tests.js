// 聚合运行 TIDELINE 全部无头测试 (game/tools/test_*_headless.js)
// 用法: node run_all_tests.js [TIDELINE_ROOT]
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");

function findRoot() {
  let d = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, "game", "tools", "test_salvage_headless.js"))) return d;
    const p = path.dirname(d);
    if (p === d) break;
    d = p;
  }
  return null;
}

const root = process.argv[2] || findRoot();
if (!root) { console.error("找不到 TIDELINE 根目录，请传入路径参数。"); process.exit(2); }

const tools = path.join(root, "game", "tools");
const gameDir = path.join(root, "game");
const tests = fs.readdirSync(tools).filter(f => /^test_.*_headless\.js$/.test(f)).sort();

let totalPass = 0, totalFail = 0;
const failedFiles = [];

for (const t of tests) {
  const fp = path.join(tools, t);
  process.stdout.write("\n========== " + t + " ==========\n");
  let out = "";
  try {
    out = execFileSync("node", [fp], { cwd: gameDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "") + "\n[运行异常: " + (e.message || "") + "]";
  }
  process.stdout.write(out);
  const p = (out.match(/\[PASS\]/g) || []).length;
  const f = (out.match(/\[FAIL\]/g) || []).length;
  totalPass += p; totalFail += f;
  if (f > 0) failedFiles.push(t);
}

console.log("\n==============================");
console.log("测试文件: " + tests.length + "  通过: " + totalPass + "  失败: " + totalFail);
if (failedFiles.length) console.log("失败文件: " + failedFiles.join(", "));
process.exit(totalFail > 0 ? 1 : 0);
