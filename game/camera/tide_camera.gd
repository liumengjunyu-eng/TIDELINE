# camera/tide_camera.gd
# 三视角：TOP_DOWN（P0 默认）/ OVER_SHOULDER（备选）/ GOD（上帝俯瞰）。
# P0 用 2.5D 顶视角：水涨上来玩家是否"慌"，是判定视角留存的核心标准。
extends Camera3D

enum Mode { TOP_DOWN, OVER_SHOULDER, GOD }

@export var mode: int = Mode.TOP_DOWN
@export var top_height: float = 38.0
@export var shoulder_dist: float = 6.0
@export var shoulder_height: float = 4.0

var _target: Node3D

# 顶视角若严格垂直俯视，视线与 UP 平行会让 look_at 的朝向退化（roll 不可控）。
# 稍微后倾一点既解除退化，也更符合 2.5D 的可读性。
@export var top_tilt: float = 8.0

func _ready() -> void:
	_acquire_target()

func _acquire_target() -> void:
	var player = get_tree().get_first_node_in_group("player")
	if player: _target = player

func _process(_delta: float) -> void:
	# 惰性取玩家：不能只在 _ready 取一次，节点入场顺序一变就永远跟丢
	if not is_instance_valid(_target):
		_acquire_target()
		if _target == null:
			return
	match mode:
		Mode.TOP_DOWN:
			global_position = _target.global_position + Vector3(0, top_height, top_tilt)
			look_at(_target.global_position, Vector3.UP)
		Mode.OVER_SHOULDER:
			var back := Vector3(sin(_target.rotation.y), 0, cos(_target.rotation.y))
			global_position = _target.global_position - back * shoulder_dist + Vector3(0, shoulder_height, 0)
			look_at(_target.global_position, Vector3.UP)
		Mode.GOD:
			global_position = _target.global_position + Vector3(0, top_height * 1.6, top_height * 0.6)
			look_at(_target.global_position, Vector3.UP)

func set_mode(m: int) -> void:
	mode = m
	Telemetry.emit("camera_mode", {"mode": m})
