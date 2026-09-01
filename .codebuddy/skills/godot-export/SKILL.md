---
name: godot-export
description: This skill should be used when building, exporting, or releasing the TIDELINE (潮线) Godot project — producing the Windows Desktop package (build/win/TIDELINE.exe) or the Web build (build/web/index.html). Trigger on "export the game", "build Windows/Web", "release a package", "run build_dist", or any Godot export/import task for this repo.
---

# TIDELINE Godot 导出与发布

## 前置条件
- Godot 4.3（game/build_dist.bat 顶部 GODOT 变量指向本机 godot.exe）。
- 已安装「Windows 导出模板」与「Web 导出模板」（Godot 编辑器：编辑器 → 管理导出模板 → 下载）。缺模板会报 "导出模板未安装"。

## 导出预设（来自 game/export_presets.cfg）
- `Windows Desktop` → `build/win/TIDELINE.exe`；`debug/export_console=true`（测试期保留控制台，方便看 telemetry 与 [SELF-CHECK] 输出）。
- `Web` → `build/web/index.html`；`web/export_lib_with_separate_wasm_file=true`、`web/use_threads=false`、`html/canvas_resize_policy=2`。

## 一键脚本
- `game/build_dist.bat`：先改顶部 `GODOT` 路径为实际 godot.exe，双击运行 → 导入校验 → 导出 Windows →（可选）导出 Web。

## 等价命令行（无头，便于自动化 / CI）
```bash
# 先导入项目资源（校验脚本与场景）
godot --headless --path game --import
# 导出 Windows
godot --headless --path game --export-release "Windows Desktop" "build/win/TIDELINE.exe"
# 导出 Web
godot --headless --path game --export-release "Web" "build/web/index.html"
```
注：`--path game` 用项目相对路径；若 Godot 已在 PATH 用 `godot`，否则用绝对路径。

## 常见问题
- "找不到 Godot"：编辑 build_dist.bat 的 GODOT 路径，或把 godot 加入 PATH。
- "导出模板未安装"：在 Godot 编辑器里下载对应平台模板。
- Web 导出未成功但 Windows 成功：不影响 Windows 包（build_dist.bat 第 3 步仅提示）。
- 发给测试者：把 `build/win/` 与 `game/README_测试说明.txt` 一起压缩；Web 版部署 `build/web/` 或仓库根 `web/`。

## 部署 Web
- 仓库根 `web/` 即已构建好的 Web 版（GitHub Pages 工作流部署它）。
- 本地预览用 game-test 技能的 `scripts/serve_web.js`。
