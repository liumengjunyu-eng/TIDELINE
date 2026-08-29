# TIDELINE · 潮线 — 项目总览

> 第一人称（3D）战术射击原型 · 依据 01–07 号设计文档实现
> 核心机制：**潮汐是主角**——水位随回合涨落，淹没低地、浮起集装箱、把 B 点变成孤岛，强制在 A 点决战。

---

## 怎么玩（最快路径）

**双击打开 `web/index.html` 即可玩**（单 HTML 文件；3D 需联网加载引擎，离线自动走 2D）。
- 主菜单顶部可切换三种模式（点击对应标签）：
  - **BREACH 破堤 · 5v5**：选干员/武器/护甲 → 部署 → 进入第一人称对局。
  - **SALVAGE 打捞 · 单人撤离**：直接开局，潮汐涨落中潜入、搜刮战利品、在撤离点撤离。
  - **SURGE 涌潮 · 12v12 占点**：12v12 抢 3 座浮动泵站，潮汐涨落 + 随机涌潮淹没低地，`Q` 涌潮步位移形夺点。先到 150 分或 600s 结算。
- 第一人称操作（两种模式通用）：
  - 点击画面 **锁定鼠标** 控制视角（移动鼠标 = 转向/俯仰）
  - `W A S D` 移动（相对视角前后/左右）
  - **左键** 开火 · `R` 换弹 · `Q` 技能 · `E` 长按安放/拆除解码器
  - 水越深越慢；水深 > 2.0m 自动降级为**副武器（手枪）**，不是缴械
  - 集装箱随水位浮起，水涨后变成通往高地的新路

> 若浏览器不支持 WebGL，或 Three.js CDN 加载失败（如离线），游戏会**自动回退到俯视 2D 模式**，机制完全一致。

---

## 目录结构

```
TIDELINE/
├─ web/index.html            ★ 可玩交付物（单文件，双击即玩）
├─ 01_核心设定集.md          世界观 / 模式 / 干员 / 武器 原始设定
├─ 02_M0白盒验证方案.md      验证计划
├─ 03_W1技术任务拆解.md      技术拆解
├─ 04_数值与平衡初稿.md      数值表
├─ 05_重新定位与上线方案.md  上线方案
├─ 06_完整设定集·单人版.md   单人版设定
├─ 07_综合决策与游戏开发执行方案.md  执行总案
├─ game/                    Godot 工程源码（参考 / 本地导出用）
│  ├─ project.godot
│  ├─ main.gd / scenes/ / entities/ / systems/ / world/ / autoload/ / core/
│  ├─ build_dist.bat        ★ 你本机导出 exe/web 的一键脚本（需先装 Godot+模板）
│  ├─ README_测试说明.txt    测试者一页纸说明
│  └─ tools/
│     ├─ test_breach_headless.js  ★ 无浏览器逻辑冒烟测试（66 项）
│     ├─ test_salvage_headless.js ★ SALVAGE 单人撤离仿真（23 项）
│     ├─ test_surge_headless.js   ★ SURGE 12v12 占点逻辑仿真（19 项）
│     ├─ test_fp3d_smoke.js       ★ 第一人称 3D 渲染路径冒烟测试（10 项）
│     ├─ sim_verify.py            纯逻辑数值校验（Python）
│     ├─ self_check.gd / probe_heightmap.gd / bake_navmeshes.gd
└─ （Godot 编辑器/导出模板需你在本机安装，沙箱环境无法产出可执行包）
```

---

## 设计文档索引（实现依据）

| 文档 | 关键内容 | 已实现 |
|---|---|---|
| 01_核心设定集 | §3.1 涉水/游泳/浮箱 · §5 干员武器 · §7 BREACH | ✅ |
| 04_数值与平衡 | 经济原表 / 潮汐节奏 / 技能定价 | ✅ |
| 07_执行方案 | 5v5 先到 13 分 / 第 12 回合换边 | ✅ |

**已落地系统**：
- **BREACH 5v5**（先到 13 分、第 12 回合换边、100s 回合）· 解码器安放/拆除 ·
  8 干员（三级主动+被动）· 24 枪 · 5 槽改装 · 4 级弹药 · 3 级护甲 · 回合经济 ·
  根据地 7 设施（localStorage 持久化）· 潮汐（满潮 3.2m）·
  §3.1 三规则（游泳降级副武器 / 涉水噪音波纹 / 浮动集装箱二层通路）· 程序化音频。
- **SALVAGE 单人潮汐撤离**（05_重定位 / 06_单人设定集 / 07_执行方案）：
  与 BREACH **共用同一套 Three.js 3D / 俯视 2D 管线、干员/枪械/经济/音频系统**；
  独立潮汐任务（满潮 3.2m、硬上限 720s）· 25 件分级战利品 · 12 拾荒者（潮汐预判躲水）·
  4 打捞无人机 · 潮汐守望者（随水位强化护甲）· 4 个撤离点（随水位关闭）·
  背包重量惩罚 · 局外信用持久化（localStorage）· 埋点遥测。
- 第一人称 3D（两种模式共用）。
- **SURGE 涌潮 · 12v12 占点**（01_核心设定集 §模式三）：与 BREACH/SALVAGE **共用同一套 Three.js 3D / 俯视 2D 管线**；
  12v12 抢 3 座浮动泵站（标高 3.0m）· 在场即占领、控制度 50→100 计分（×2.2/s）·
  基础潮汐 0→1.2m（420s）+ 随机涌潮事件 +1.8m/20s · 干脚底（涉水惩罚减半）·
  涌潮步（Q 瞬移 8m，CD 28s）· 先到 150 分或 600s 结算 · 死亡 3s 重生。

---

## 测试

在 `game/` 目录下运行：

```bash
# 逻辑冒烟（66 项）：潮汐/经济/干员/武器/护甲/换边/存档……
node tools/test_breach_headless.js

# SALVAGE 单人撤离仿真（23 项）：潮汐上涨/撤离判定/超时结算/全实体压力跑
node tools/test_salvage_headless.js

# SURGE 12v12 占点逻辑仿真（19 项）：占领计分/涌潮事件/重生/涌潮步/全实体压力跑
node tools/test_surge_headless.js

# 第一人称 3D 渲染路径（10 项）：FP.init / FP.render / FP.renderSalvage / FP.renderSurge 跑帧无异常
node tools/test_fp3d_smoke.js

# 纯数值校验（Python，无需引擎）
python tools/sim_verify.py
```

---

## 已知限制（架构性，非偷懒）

- **真多人实时联机**需要独立后端（WebSocket/专用服务器 + 反作弊），静态托管给不了；
  当前 5v5 另外 9 个位置由 AI 填充。
- **可执行包（.exe）** 需你在本机：装 Godot 4.3 → 装 Win 导出模板 →
  改 `game/build_dist.bat` 的 `GODOT` 路径 → 双击运行。沙箱出口带宽受限，无法在此产出。
- 待办（按设计文档）：地图 M02–M06 / 可破坏场景 /
  皮肤磨损 / 交易市场 / 排位赛 / 反作弊。
  （BREACH 5v5、SALVAGE 单人撤离、SURGE 涌潮均已实现，见上「已落地系统」。）

---

## 上线到 GitHub Pages（免费静态托管，访客点链接即玩）

1. 把本仓库推送到 GitHub（见下方「推送到 GitHub」）。
2. 仓库 **Settings → Pages → Source** 选 **Deploy from a branch** → 分支 `main` + 目录 `/ (root)` → Save。
3. 等待 1–2 分钟，按下面两种方式之一访问：
   - **方式 A（推荐，零改动）**：直接把 `web/` 作为站点目录，链接为
     `https://<用户名>.github.io/<仓库名>/web/`
   - **方式 B**：把 `web/index.html` 移到仓库根目录，则根链接 `https://<用户名>.github.io/<仓库名>/` 即打开游戏。
4. 第一人称 3D 依赖 **Three.js CDN**（见下），访客需联网；若需完全离线托管，见「离线化」。

### 关于 Three.js CDN 依赖
`web/index.html` 通过 `https://cdnjs.cloudflare.com/.../three.min.js (r128)` 加载 3D 引擎。
- 联网时一切正常（GitHub Pages 访客默认可用）。
- **离线 / 自包含方案**：下载 `three.min.js`（r128）放到 `web/vendor/three.min.js`，
  并把 `index.html` 中 `<script src="...cdnjs...">` 改为 `<script src="vendor/three.min.js">`。
  （`.gitignore` 已放行 `web/vendor/`，不会误忽略。本仓库因沙箱无外网，未预置该文件。）

### 推送到 GitHub（此步骤需你提供仓库地址）
当前已 `git init` 并在本地提交（commit `51397e4`，共 39 个文件）。推送到 GitHub 需你：
- 在 github.com **新建空仓库**（不要勾选自动生成 README / LICENSE，避免冲突）；
- 然后告诉我仓库地址，我执行：
  ```bash
  git remote add origin <你的仓库URL>
  git branch -M main
  git push -u origin main
  ```
  或你在本地自行执行这三条命令。

---

_最后更新：新增 **SURGE 涌潮 · 12v12 占点模式**（与 BREACH/SALVAGE 共用 3D/2D 管线，主菜单三模式可切换）；三模式分流接入 `loop()`，未改名任何 BREACH 函数以保证零回归。设计依据 01_核心设定集 §模式三（浮动泵站 / 在场占领 / 随机涌潮 / 涌潮步）。测试：BREACH 66/66、SALVAGE 23/23、SURGE 19/19、3D 路径 10/10 全过。_

_注：SALVAGE 仿真逻辑由外部模型提供，我已审计命名冲突（`rnd` 改名为 `srnd`）并加 `localStorage` 保护；SURGE 由设计文档落地。3D 画面与玩法未经真实浏览器肉眼验收，靠渲染路径冒烟测试证明不抛错。_
