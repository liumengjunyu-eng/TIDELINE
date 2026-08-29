# world/m01_slagwerf.gd
# M01 闸门区·标高网格数据（P0 硬编码，未来从编辑期烘焙纹理导入）
class_name M01Slagwerf
extends RefCounted

const GRID_SIZE := 64

enum Region { ATTACK_SPAWN, DEFEND_SPAWN, MID_DRYDOCK, NORTH_PASSAGE, SOUTH_PASSAGE, A_POINT, B_POINT_MAIN, B_POINT_HIGH, BRIDGE }

const REGION_CENTERS := {
	Region.ATTACK_SPAWN:   Vector3( 8.0, 2.2, 56.0),
	Region.DEFEND_SPAWN:   Vector3(56.0, 2.2,  8.0),
	Region.MID_DRYDOCK:    Vector3(32.0, 0.0, 32.0),
	Region.NORTH_PASSAGE:  Vector3(16.0, 1.8, 16.0),
	Region.SOUTH_PASSAGE:  Vector3(48.0, 1.0, 48.0),
	Region.A_POINT:        Vector3(48.0, 4.0, 20.0),
	Region.B_POINT_MAIN:   Vector3(20.0, 0.2, 48.0),
	Region.B_POINT_HIGH:   Vector3(20.0, 3.9, 44.0),
	Region.BRIDGE:         Vector3(32.0, 0.0, 40.0),
}

# 判定顺序即优先级，**不要随意调换**（这里踩过坑）：
# 干船坞是个 32×32 的大范围背景框（x/z ∈ 16..48），而 A 点高地、B 点高地、南北通道
# 都落在它内部。若把干船坞写在前面，它会先把这些区域统统判成 0.0，
# 高地被彻底抹平 —— 满潮 3.2m 时全图无立锥之地，
# "B 点成孤岛 / 强制 A 点决战 / 拾荒者抢高地"这些核心设计会全部失效。
# 因此：先判具体地貌（高地 → 通道 → 低洼），最后才回落到干船坞背景。
static func _get_height_at(x: int, z: int) -> float:
	if x < 0 or x >= GRID_SIZE or z < 0 or z >= GRID_SIZE:
		return 2.2
	var wx := float(x)
	var wz := float(z)

	# 1) 双方出生角（高地，永不淹）
	if (wx < 16.0 and wz > 48.0) or (wx > 48.0 and wz < 16.0):
		return 2.2

	# 2) 高地优先：A 点 4.0 / B 点高地 3.9
	#    B 点高地收紧到 ±3（原 ±4 会把 z=48 的 B 点主区一起抬成 3.9，
	#    导致"B 点成孤岛"不成立 —— 主区本该是 0.2 被淹掉）
	if abs(wx - 48.0) <= 8.0 and abs(wz - 20.0) <= 8.0:
		return 4.0
	if abs(wx - 20.0) <= 3.0 and abs(wz - 44.0) <= 3.0:
		return 3.9

	# 3) 南北通道
	if wz < 24.0 and abs(wx - 16.0) <= 12.0:
		return 1.8
	if wz > 40.0 and abs(wx - 48.0) <= 12.0:
		return 1.0

	# 4) 低洼：B 点主区 0.2（满潮必淹，把 B 点变成孤岛）
	if abs(wx - 20.0) <= 8.0 and abs(wz - 48.0) <= 8.0:
		return 0.2

	# 5) 桥区（标高 0，浮桥在此）
	if abs(wx - 32.0) <= 4.0 and wz > 36.0 and wz <= 44.0:
		return 0.0

	# 6) 干船坞背景：范围最大，必须最后判
	if abs(wx - 32.0) <= 16.0 and abs(wz - 32.0) <= 16.0:
		return 0.0

	return 2.2

static func sample_height(world_pos: Vector3) -> float:
	var gx = int(clamp(world_pos.x, 0.0, 63.0))
	var gz = int(clamp(world_pos.z, 0.0, 63.0))
	return _get_height_at(gx, gz)

static func world_to_grid(world_pos: Vector3) -> Vector2i:
	return Vector2i(int(world_pos.x), int(world_pos.z))

# 在 from 周围 radius 米内，返回标高中高于 min_h 的最高可达点（世界坐标）。
# 用于拾荒者"抢高地"：潮汐淹没低处时，AI 迁往最近高地。
static func nearest_high_ground(from: Vector3, radius: float, min_h: float) -> Vector3:
	var best := from
	var best_h := _get_height_at(int(from.x), int(from.z))
	var r := int(ceil(radius))
	for dx in range(-r, r + 1):
		for dz in range(-r, r + 1):
			var x := int(from.x) + dx
			var z := int(from.z) + dz
			if x < 0 or x >= GRID_SIZE or z < 0 or z >= GRID_SIZE:
				continue
			if abs(dx) + abs(dz) > r:        # 菱形搜索范围
				continue
			var h := _get_height_at(x, z)
			if h >= min_h and h > best_h:
				best = Vector3(float(x), h, float(z))
				best_h = h
	return best
