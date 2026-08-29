# world/water_surface.gd
# 水面可视化：潮汐是主角，玩家必须"看得见水涨上来"，否则机制沦为日志里的数字。
# 半透明平面，每帧贴合 TideController.water_level（只读，不改水位）。
extends MeshInstance3D

@export var size: float = 128.0
@export var water_color: Color = Color(0.14, 0.42, 0.72, 0.55)

func _ready() -> void:
	var m := PlaneMesh.new()
	m.size = Vector2(size, size)
	mesh = m

	var mat := StandardMaterial3D.new()
	mat.albedo_color = water_color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.15
	mat.metallic = 0.1
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED   # 从水下也能看见水面
	material_override = mat

func _process(_delta: float) -> void:
	if not is_instance_valid(TideController):
		return
	global_position.y = TideController.water_level
