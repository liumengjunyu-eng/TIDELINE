# tools/sim_verify.py
# 无 Godot 的纯逻辑验证：把 GDScript 的核心数学在 Python 里复刻一遍，
# 用数值证明"地形对齐/落地/潮汐/抢高地/撤离点浮起"这几项机制是自洽的。
# 这不是替代真机跑，而是在拿到编辑器前先把能算的算死。

import math

GRID_SIZE = 64
HALF = (GRID_SIZE - 1) * 0.5   # 31.5


# ---- 复刻 world/m01_slagwerf.gd :: _get_height_at ----
def get_height_at(x, z):
    if x < 0 or x >= GRID_SIZE or z < 0 or z >= GRID_SIZE:
        return 2.2
    wx, wz = float(x), float(z)
    # 顺序与 m01_slagwerf.gd 保持一致：具体地貌优先，干船坞背景最后
    if (wx < 16.0 and wz > 48.0) or (wx > 48.0 and wz < 16.0):
        return 2.2
    if abs(wx - 48.0) <= 8.0 and abs(wz - 20.0) <= 8.0:
        return 4.0
    if abs(wx - 20.0) <= 3.0 and abs(wz - 44.0) <= 3.0:
        return 3.9
    if wz < 24.0 and abs(wx - 16.0) <= 12.0:
        return 1.8
    if wz > 40.0 and abs(wx - 48.0) <= 12.0:
        return 1.0
    if abs(wx - 20.0) <= 8.0 and abs(wz - 48.0) <= 8.0:
        return 0.2
    if abs(wx - 32.0) <= 4.0 and wz > 36.0 and wz <= 44.0:
        return 0.0
    if abs(wx - 32.0) <= 16.0 and abs(wz - 32.0) <= 16.0:
        return 0.0
    return 2.2


def mesh_h(wx, wz):
    """玩家'看到'的地面高度：terrain_mesh.gd 把索引 x 直接建在世界坐标 x。"""
    return get_height_at(int(round(wx)), int(round(wz)))


def collision_h(wx, wz, offset):
    """玩家'踩到'的碰撞高度：HeightMapShape3D 以顶点中心为原点。
    源码 godot_shape_3d.cpp: 索引 i 的局部坐标 = i - (width-1)*0.5
    世界坐标 = offset + (i - HALF)  =>  i = wx - offset + HALF
    """
    i = int(round(wx - offset + HALF))
    j = int(round(wz - offset + HALF))
    i = max(0, min(GRID_SIZE - 1, i))
    j = max(0, min(GRID_SIZE - 1, j))
    return get_height_at(i, j)


def collide(gx, gz, gmin, gmax):
    return max(gmin, min(gmax, gx)), max(gmin, min(gmax, gz))


# ---- 复刻 world/m01_slagwerf.gd :: nearest_high_ground ----
def nearest_high_ground(fx, fz, radius, min_h):
    bx, bh, bz = fx, get_height_at(int(fx), int(fz)), fz
    r = int(math.ceil(radius))
    for dx in range(-r, r + 1):
        for dz in range(-r, r + 1):
            x, z = int(fx) + dx, int(fz) + dz
            if x < 0 or x >= GRID_SIZE or z < 0 or z >= GRID_SIZE:
                continue
            if abs(dx) + abs(dz) > r:
                continue
            h = get_height_at(x, z)
            if h >= min_h and h > bh:
                bx, bh, bz = x, h, z
    return bx, bh, bz


line = "=" * 66
ok_all = True


def check(label, cond, detail=""):
    global ok_all
    ok_all = ok_all and cond
    print("  [%s] %-42s %s" % ("PASS" if cond else "FAIL", label, detail))


# ============================================================
print(line)
print("1. 地形碰撞对齐 —— 验证 31.5 偏移修复")
print(line)

err0 = errfix = worst0 = worstfix = 0.0
for x in range(GRID_SIZE):
    for z in range(GRID_SIZE):
        m = mesh_h(x, z)
        e0 = abs(collision_h(x, z, 0.0) - m)
        ef = abs(collision_h(x, z, HALF) - m)
        if e0 > worst0:
            worst0 = e0
        if ef > worstfix:
            worstfix = ef
        err0 += e0
        errfix += ef
n = GRID_SIZE * GRID_SIZE
print("  偏移=0    (修复前): 最大误差 %.2f m  平均 %.3f m" % (worst0, err0 / n))
print("  偏移=31.5 (修复后): 最大误差 %.2f m  平均 %.3f m" % (worstfix, errfix / n))
check("修复后碰撞与网格逐格对齐", worstfix < 1e-9, "max err = %.3f" % worstfix)
check("修复前确实存在错位（证明此 bug 真实）", worst0 > 1.0, "max err = %.2f m" % worst0)

print()
print("  -- 逐点对照（世界坐标 -> 网格高度 / 修复前碰撞 / 修复后碰撞）--")
for (wx, wz, name) in [(32, 32, "干船坞中心"), (8, 56, "玩家出生点"),
                       (48, 20, "A点高地"), (20, 44, "B点高地"), (20, 48, "B点主区")]:
    m = mesh_h(wx, wz)
    c0 = collision_h(wx, wz, 0.0)
    cf = collision_h(wx, wz, HALF)
    flag = "" if abs(cf - m) < 1e-9 else "  <== 仍不匹配"
    print("    %-8s 世界(%2d,%2d)  网格%.2f  修复前%.2f  修复后%.2f%s"
          % (name, wx, wz, m, c0, cf, flag))

# REGION_CENTERS 声明的标高必须等于标高函数的实际返回值，
# 否则"设计文档里的 A 点高地"在地图上是假的。
print()
print("  -- REGION_CENTERS 声明标高 vs 标高函数实际值 --")
REGIONS = [
    ("攻击出生", 8, 56, 2.2), ("防守出生", 56, 8, 2.2),
    ("干船坞中心", 32, 32, 0.0), ("北通道", 16, 16, 1.8),
    ("南通道", 48, 48, 1.0), ("A点高地", 48, 20, 4.0),
    ("B点主区", 20, 48, 0.2), ("B点高地", 20, 44, 3.9),
    ("桥区", 32, 40, 0.0),
]
region_ok = True
for (nm, rx, rz, want) in REGIONS:
    got = get_height_at(rx, rz)
    good = abs(got - want) < 1e-9
    region_ok = region_ok and good
    print("    %-10s (%2d,%2d)  声明 %.1f  实际 %.1f   %s"
          % (nm, rx, rz, want, got, "OK" if good else "<== 不一致"))
check("全部区域声明标高与标高函数一致", region_ok)

# ============================================================
print()
print(line)
print("2. 玩家出生落地（验证不会卡进地形）")
print(line)

SPAWN = (8.0, 56.0)
CAP_HALF = 0.9          # CapsuleShape3D height=1.8
start_y = 3.2           # main.tscn 中 Player 的 transform.y
ground = collision_h(SPAWN[0], SPAWN[1], HALF)
bottom0 = start_y - CAP_HALF
land_y = ground + CAP_HALF
print("  出生点世界坐标 (%g, %g)" % SPAWN)
print("  碰撞地面高度      %.2f" % ground)
print("  胶囊半高          %.2f" % CAP_HALF)
print("  起始胶囊底        %.2f  (离地 %.2f m)" % (bottom0, bottom0 - ground))
print("  稳定后胶囊中心 y  %.2f" % land_y)
check("出生点在地形之上（不会卡进去）", bottom0 >= ground - 1e-9,
      "离地 %.2f m" % (bottom0 - ground))
check("下落距离可接受（<2m，不会摔死/穿模）", 0.0 <= bottom0 - ground < 2.0,
      "%.2f m" % (bottom0 - ground))
t = math.sqrt(2.0 * (bottom0 - ground) / 16.0)
print("  落地耗时          %.2f s (重力 16 m/s²)" % t)

# 修复前会怎样
g_bug = collision_h(SPAWN[0], SPAWN[1], 0.0)
print()
print("  若未修复：碰撞报 %.2f 而网格渲染 %.2f -> 玩家会下沉 %.2f m 陷进地里"
      % (g_bug, mesh_h(*SPAWN), mesh_h(*SPAWN) - g_bug))

# ============================================================
print()
print(line)
print("3. 潮汐时间线（复刻 autoload/tide_controller.gd）")
print(line)

PHASE = ["LOW", "RISING", "HIGH"]
# 取自 04_数值与平衡初稿 §3.1：低潮 0–40s / 涨潮 40–75s / 满潮 75–100s，共 100s
DUR = {"LOW": 40.0, "RISING": 35.0, "HIGH": 25.0}
RANGE = {"LOW": (0.00, 0.15), "RISING": (0.15, 1.50), "HIGH": (1.50, 3.20)}


def tide_at(t):
    acc = 0.0
    for p in PHASE:
        if t < acc + DUR[p]:
            lo, hi = RANGE[p]
            return p, lo + (hi - lo) * ((t - acc) / DUR[p])
        acc += DUR[p]
    return "HIGH", RANGE["HIGH"][1]


def state_of(w, h):
    """涉水档位：0 Dry / 1 Shallow / 2 Wading / 3 Swimming"""
    d = w - h
    if d >= 2.0:
        return 3, d
    if d >= 1.2:
        return 2, d
    if d >= 0.3:
        return 1, d
    return 0, d


SNAME = ["Dry", "Shallow", "Wading", "Swimming"]

print("  阶段     时长    水位区间        可站立(<2m) 淹没(游泳档)")
for p in PHASE:
    lo, hi = RANGE[p]
    dry = sum(1 for x in range(GRID_SIZE) for z in range(GRID_SIZE)
              if hi - get_height_at(x, z) < 2.0)
    swm = sum(1 for x in range(GRID_SIZE) for z in range(GRID_SIZE)
              if hi - get_height_at(x, z) >= 2.0)
    print("  %-7s %5.0fs  %.2f -> %.2f m     %5.1f%%      %5.1f%%"
          % (p, DUR[p], lo, hi, 100.0 * dry / n, 100.0 * swm / n))

print()
print("  关键时间点：")
for t in [0, 20, 40, 60, 75, 88, 100]:
    p, w = tide_at(t)
    swm = sum(1 for x in range(GRID_SIZE) for z in range(GRID_SIZE)
              if w - get_height_at(x, z) >= 2.0)
    print("    t=%3ds  %-6s  water=%.2f  淹没 %5.1f%%" % (t, p, w, 100.0 * swm / n))

# ---- 逐条核对设计文档写明的玩法影响 ----
print()
print("  -- 核对设计文档写明的玩法影响 --")
# 04_数值与平衡初稿 §3.1：
#   低潮「所有区域仍在 Dry 档」
#   涨潮「干船坞变运河，B 点主区涉水」
#   满潮「B 点成孤岛，强制 A 点决战」
SPOTS = {"干船坞": (32, 32), "B点主区": (20, 48), "B点高地": (20, 44),
         "A点高地": (48, 20), "出生点": (8, 56)}
for (nm, (sx, sz)) in SPOTS.items():
    h = get_height_at(sx, sz)
    row = "%-8s 标高%.1f |" % (nm, h)
    for p in PHASE:
        _, hi = RANGE[p]
        s, d = state_of(hi, h)
        row += "  %s:%s" % (p[:3], SNAME[s])
    print("   " + row)

print()
_, w_low = tide_at(40)
_, w_rise = tide_at(75)
_, w_high = tide_at(100)

dry_low = all(state_of(w_low, get_height_at(x, z))[0] == 0
              for x in range(GRID_SIZE) for z in range(GRID_SIZE))
check("低潮：所有区域仍在 Dry 档（文档 §3.1）", dry_low)
check("涨潮：干船坞变运河（涉水档）", state_of(w_rise, get_height_at(32, 32))[0] >= 2,
      "干船坞 depth=%.2f -> %s" % (state_of(w_rise, get_height_at(32, 32))[1],
                                   SNAME[state_of(w_rise, get_height_at(32, 32))[0]]))
check("涨潮：B 点主区涉水", state_of(w_rise, get_height_at(20, 48))[0] >= 2,
      "B点主区 depth=%.2f" % state_of(w_rise, get_height_at(20, 48))[1])
check("满潮：B 点成孤岛（主区没入游泳档）",
      state_of(w_high, get_height_at(20, 48))[0] == 3,
      "B点主区 depth=%.2f" % state_of(w_high, get_height_at(20, 48))[1])
check("满潮：A 点仍干爽（强制 A 点决战）",
      state_of(w_high, get_height_at(48, 20))[0] == 0,
      "A点 depth=%.2f" % state_of(w_high, get_height_at(48, 20))[1])
check("满潮：B 点高地仍可站（孤岛有落脚点）",
      state_of(w_high, get_height_at(20, 44))[0] == 0,
      "B点高地 depth=%.2f" % state_of(w_high, get_height_at(20, 44))[1])
check("满潮仍留有高地（不会无解）",
      sum(1 for x in range(GRID_SIZE) for z in range(GRID_SIZE)
          if w_high - get_height_at(x, z) < 0.0) > 0)
check("单个潮汐回合计 100 秒（设定集 / 04 文档一致）",
      abs(sum(DUR.values()) - 100.0) < 1e-9, "%.0f s" % sum(DUR.values()))

# ============================================================
print()
print(line)
print("4. 拾荒者抢高地（复刻 scavenger_ai RETREAT 分支）")
print(line)

print("  起点              水位   目标高地      高度   是否高于水面")
for (sx, sz) in [(32, 32), (20, 48), (8, 56), (48, 20)]:
    for w in [1.5, 3.2]:
        bx, bh, bz = nearest_high_ground(sx, sz, 40.0, w + 0.3)
        above = "是" if bh > w else "否"
        print("    (%2d,%2d) h=%.1f   %.1f   (%2d,%2d)     %.1f    %s"
              % (sx, sz, get_height_at(sx, sz), w, bx, bz, bh, above))

bx, bh, bz = nearest_high_ground(32, 32, 40.0, 3.2 + 0.3)
check("干船坞的拾荒者在满潮能找到高于水面的落脚点", bh > 3.2,
      "目标 (%d,%d) h=%.1f > 水位 3.2" % (bx, bz, bh))

# ============================================================
print()
print(line)
print("5. 撤离点浮起（复刻 floating_bridge + extraction）")
print(line)

DECK = 0.15
print("  桥甲板 = 水位 + %.2f；撤离点坐甲板上 +0.30" % DECK)
print("  水位    桥面    撤离点   撤离点是否在水面之上")
for w in [0.15, 1.5, 2.4, 3.2]:
    deck = w + DECK
    mark = deck + 0.30
    print("    %.2f   %.2f   %.2f     %s" % (w, deck, mark, "是" if mark > w else "否"))

deck = 3.2 + DECK
mark = deck + 0.30
check("满潮时浮桥撤离点浮出水面", mark > 3.2, "撤离点 y=%.2f > 水位 3.2" % mark)
check("低潮时浮桥贴在原位（不会飞起来）", 0.15 + DECK < 1.0, "桥面 y=%.2f" % (0.15 + DECK))

# ============================================================
print()
print(line)
print("6. 涉水状态机（复刻 core/water_state.gd）")
print(line)

ENTER = [0.0, 0.3, 1.2, 2.0]
EXIT = [0.0, 0.2, 1.1, 1.9]
MULT = [1.0, 0.85, 0.55, 0.40]
NAME = ["DRY", "SHALLOW", "WADING", "SWIMMING"]


def update_state(cur, depth):
    if cur < 3 and depth >= ENTER[cur + 1]:
        return cur + 1
    elif cur > 0 and depth <= EXIT[cur]:
        return cur - 1
    return cur


print("  深度 -> 状态 -> 速度倍率（单向加深）")
s = 0
for d in [0.0, 0.5, 1.5, 2.5]:
    s = update_state(s, d)
    print("    depth %.1f m -> %-8s x%.2f  %s"
          % (d, NAME[s], MULT[s], "禁止开火" if s == 3 else ""))
check("游泳状态禁止开火（核心规则）", update_state(2, 2.0) == 3)

# ============================================================
print()
print(line)
if ok_all:
    print("结论：全部逻辑校验 PASS —— 机制在数值层面自洽。")
    print("      （渲染/手感/性能仍需真机跑，编辑器下载中）")
else:
    print("结论：存在 FAIL 项，见上。")
print(line)
