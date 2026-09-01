---
name: game-test
description: This skill should be used when testing, validating, or serving the TIDELINE (潮线) game — running its Node headless test harness (game/tools/test_*_headless.js), starting a local static server for the web build (web/index.html), or building/releasing via Godot. Trigger on requests like "run the game tests", "check TIDELINE", "start a local server for the game", "give me a test URL", "build/deploy the web version", or any regression/smoke-test task for this project.
---

# TIDELINE 游戏测试与本地服务

本技能封装 TIDELINE（潮线）项目的测试与预览流程。环境**没有 Python**，所有脚本均为纯 Node.js。

## 关键词约定
- `TIDELINE_ROOT`：仓库根目录（含 `game/` 与 `web/` 两个文件夹）。
- 测试从 `game/` 目录运行，但脚本内部用 `__dirname` 定位资源，**不依赖当前工作目录**。

## 何时使用
- 回归验证 / 冒烟测试（改完逻辑后跑全套）。
- 给测试者提供可点击的本地预览地址。
- 构建 Windows / Web 发布包（需本机安装 Godot 4.3）。

## 如何运行

### 1) 跑全部无头测试（推荐）
```bash
node <skill>/scripts/run_all_tests.js [TIDELINE_ROOT]
```
- 不传参数时，自动从当前目录向上查找含 `game/tools/test_salvage_headless.js` 的根目录。
- 依次执行 `game/tools/test_*_headless.js`，聚合每项 `[PASS]`/`[FAIL]` 计数。
- 退出码：全过为 0，有失败为 1。
- 单跑某个测试：`cd TIDELINE_ROOT/game && node tools/test_salvage_headless.js`（其余文件同名替换）。

### 2) 起本地服务器预览 Web 版
```bash
node <skill>/scripts/serve_web.js [TIDELINE_ROOT] [PORT]
```
- 默认端口 `8137`，访问 `http://localhost:8137/`。
- 以 `web/` 为根目录，含 `.wasm`（Godot Web 构建需要）的 MIME 映射。
- 已在 `web/index.html` 注入的 URL 参数：`?tide=0`（关潮汐对照）、`?practice=1`（练习局）。

### 3) 构建发布包（需 Godot 4.3 + 导出模板）
- Windows：`game/build_dist.bat`（先改脚本顶部 `GODOT` 路径为你本机 `godot.exe`）。
- Web：同上脚本的第 3 步会导出 `build/web/index.html`。

## 测试覆盖说明（避免误判）
- `test_salvage_headless.js` / `test_breach_headless.js`：单人潮汐撤离 / 12v12 占点逻辑层（驱动 vm + DOM 桩）。
- `test_fp3d_smoke.js`：第一人称 3D 渲染路径（THREE.js 桩 + WebGL 桩，真正调 `FP.init()/render()`）。
- `test_surge_headless.js` / `test_ghost_headless.js` 等：针对归档快照的回归/考古测试，读取 `game/legacy/` 而非 `web/`。
- 速度类断言对专长（perk）敏感：加 perk 后玩家可能变慢属预期，需对照 `SALVAGE_PERKS` 解锁阈值（见 `web/index.html` 内联配置）判断。

## 参考资源
- `scripts/run_all_tests.js` — 全套测试聚合器。
- `scripts/serve_web.js` — 零依赖静态服务器。
- `game/README_测试说明.txt` — 给人工测试者的反馈模板（四行格式）。
