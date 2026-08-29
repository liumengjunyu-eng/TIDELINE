# world/terrain_body.gd
# A1 地形碰撞体生成
@tool
extends StaticBody3D
class_name TerrainBody

func _ready() -> void:
	build_collision()

func build_collision() -> void:
	for c in get_children(): c.free()
	var size = M01Slagwerf.GRID_SIZE
	var data = PackedFloat32Array()
	data.resize(size * size)
	for z in range(size):
		for x in range(size):
			data[z * size + x] = M01Slagwerf._get_height_at(x, z)
	var shape = HeightMapShape3D.new()
	shape.map_width = size
	shape.map_depth = size
	shape.map_data = data
	var col = CollisionShape3D.new()
	col.shape = shape

	# 关键：HeightMapShape3D 以"顶点中心"为局部原点。
	# 源码 godot_shape_3d.cpp::GodotHeightMapShape3D::_setup() 中
	#   aabb.size = (width-1, .., depth-1)；local_origin = 0.5*size
	# 即网格索引 x 的局部坐标是 x - (width-1)*0.5。
	# 而 terrain_mesh.gd 把索引 x 直接建在世界坐标 x，所以碰撞体必须补这个偏移，
	# 否则地形碰撞整体错位 (size-1)/2 米 —— 玩家会踩空或者直接卡进地里。
	var half := float(size - 1) * 0.5
	col.position = Vector3(half, 0.0, half)

	add_child(col)
	if Engine.is_editor_hint():
		col.owner = get_tree().edited_scene_root
	print("[TERRAIN] 碰撞体已生成 ", size, "x", size, " 原点偏移 ", half)
