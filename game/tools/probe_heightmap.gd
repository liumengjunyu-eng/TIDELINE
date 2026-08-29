# tools/probe_heightmap.gd
# 一次性探针：确定 HeightMapShape3D 的局部原点约定。
# 地形网格建在世界 0..63，而碰撞体若不与其对齐，玩家会踩空/陷地。
# 运行：godot --headless --script res://tools/probe_heightmap.gd
extends SceneTree

func _initialize() -> void:
	var size := 8
	var data := PackedFloat32Array()
	data.resize(size * size)
	for z in size:
		for x in size:
			# 明确不对称的高程：仅 (0,0) 抬高，便于从顶点范围反推原点
			data[z * size + x] = 5.0 if (x == 0 and z == 0) else 0.0

	var shape := HeightMapShape3D.new()
	shape.map_width = size
	shape.map_depth = size
	shape.map_data = data

	var dm := shape.get_debug_mesh()
	if dm == null:
		print("[PROBE] get_debug_mesh() 返回 null —— 无法判定，需要改用射线法")
		quit()
		return

	var faces := dm.get_faces()
	var minv := Vector3(INF, INF, INF)
	var maxv := Vector3(-INF, -INF, -INF)
	for v in faces:
		minv = minv.min(v)
		maxv = maxv.max(v)

	print("[PROBE] 顶点数: ", faces.size())
	print("[PROBE] local X 范围: ", minv.x, " .. ", maxv.x)
	print("[PROBE] local Z 范围: ", minv.z, " .. ", maxv.z)
	print("[PROBE] local Y 范围: ", minv.y, " .. ", maxv.y)
	print("[PROBE] AABB: ", dm.get_aabb())

	# 判定：
	#   0 .. (size-1)      -> 以原点为起点，向 +X/+Z 延伸（无需偏移）
	#   -(size-1)/2 .. +.. -> 以顶点中心为原点（偏移 +(size-1)/2）
	#   -size/2 .. +..     -> 以格心为原点（偏移 +size/2）
	if abs(minv.x) < 0.001:
		print("[PROBE] 结论: ORIGIN_CORNER（从局部原点向正方向延伸），偏移 = 0")
	elif abs(minv.x + (size - 1) * 0.5) < 0.001:
		print("[PROBE] 结论: CENTER_VERTEX（顶点居中），偏移 = +(size-1)/2 = ", (size - 1) * 0.5)
	elif abs(minv.x + size * 0.5) < 0.001:
		print("[PROBE] 结论: CENTER_CELL（格心居中），偏移 = +size/2 = ", size * 0.5)
	else:
		print("[PROBE] 结论: 未知约定，minv.x = ", minv.x)
	quit()
