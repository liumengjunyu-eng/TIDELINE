---
name: tideline-balance
description: This skill should be used when tuning, balancing, or extending TIDELINE (潮线) gameplay numbers — tide phases, salvage/haul economy, perk (专长) unlock thresholds, newbie grace, or achievement/unlock paths. Trigger on "balance the game", "adjust tide timing", "change perk unlock", "tune salvage values", or any numerical/design tuning for this repo.
---

# TIDELINE 数值与平衡模型

## 权威数据源（改数前先读）
- `web/index.html` 内联配置（主逻辑在最后一个 `<script>` 块）：潮汐相位、SALVAGE_PERKS、HARD_CAP、PlayerMission 等。
- `game/README_测试说明.txt`：潮汐对照实验与单局时间线。
- 设计文档：`01_核心设定集.md`、`04_数值与平衡初稿.md`、`08_P1设计路线图.md`、`09_人物设定·视觉与文案.md`。
- 回归测试：`game/tools/test_salvage_headless.js`、`test_unlock_headless.js` 等（改完跑 game-test 技能全套）。

## 核心节奏（单局 100s 基准，见 README_测试说明.txt）
- 0–40s 低潮：水位 0 → 0.15m，地面干爽。
- 40–75s 涨潮：0.15 → 1.50m，干船坞变运河，走路变慢。
- 75–100s 满潮：1.50 → 3.20m，B 点成孤岛，撤离点浮到浮桥，必须踩桥撤离。
- 老手局 HARD_CAP=720s（新手局短很多，见 test_salvage_headless 断言）。

## 专长解锁（SALVAGE_PERKS，来自 web/index.html 内联配置）
- 阈值以「累计撤离次数 runs」为主。已知：waveStep 解锁 runs:9，calmAnchor 解锁 runs:15；其余见内联配置。
- 改阈值务必同步 `test_salvage_headless.js` / `test_unlock_headless.js` 的断言，否则回归失败。

## 新手局保底
- 赠 1 级护甲（armor=50），撤离点全程高亮（Extraction.alwaysShow=true），阵容满编 12 名 scav。
- 成就/干员解锁存在「次数保底路径」防卡关（撤离 N 次即可解锁，无需达成成就）。

## 修改后必做
1. 同步 `web/index.html` 内联数值与对应 `test_*_headless.js` 断言。
2. 跑 `node .codebuddy/skills/game-test/scripts/run_all_tests.js` 确认全过（当前基线 365 PASS / 0 FAIL）。
3. 如需重新导出 Web：见 godot-export 技能。
