# systems/enemy_spawner.gd
# 随潮汐阶段递增生成拾荒者：低潮 4 / 涨潮 6 / 满潮 8。
# P0 在边缘点生成，正式版从 prefab 池取。
extends Node

@export var scavenger_scene: PackedScene
@export var edge_points: Array[Vector3] = []

const PHASE_COUNTS := {0: 4, 1: 6, 2: 8}   # LOW, RISING, HIGH

var _spawned := 0
var _live: Array = []

func _ready() -> void:
	TideController.phase_changed.connect(_on_phase)
	# 开局必须立刻铺一批：phase_changed 只在切相位时触发，
	# 否则整个 LOW 阶段（前 3 分钟）地图上一个敌人都没有。
	_spawn_to(PHASE_COUNTS.get(TideController.current_phase, 0))

func _process(_delta: float) -> void:
	# AI 的 ENGAGE 判定依赖 player_position，必须持续注入
	var p := get_tree().get_first_node_in_group("player")
	if p == null:
		return
	for s in _live:
		if is_instance_valid(s):
			s.player_position = p.global_position

func _on_phase(_old: int, new_phase: int) -> void:
	_spawn_to(PHASE_COUNTS.get(new_phase, 0))

const SAFE_SPAWN_DIST := 18.0

func _spawn_to(want: int) -> void:
	if scavenger_scene == null or edge_points.size() == 0:
		return
	var player := get_tree().get_first_node_in_group("player")
	while _spawned < want:
		# 出生点 (8,56) 与边缘点 (6,58) 只隔 2.83m —— 照索引顺序刷会直接刷在玩家脸上，
		# 玩家撑不过 10 秒就被围杀，整局潮汐根本推进不到涨潮。
		# 因此优先取离玩家 SAFE_SPAWN_DIST 以外的边缘点；都不满足时退而取最远的。
		var p := edge_points[_spawned % edge_points.size()]
		if player != null:
			var pp := player.global_position
			var best_pt: Vector3 = p
			var best_dist := -1.0
			for k in edge_points.size():
				var c: Vector3 = edge_points[(_spawned + k) % edge_points.size()]
				var d := Vector2(c.x, c.z).distance_to(Vector2(pp.x, pp.z))
				if d > SAFE_SPAWN_DIST:
					best_pt = c
					break
				if d > best_dist:
					best_dist = d
					best_pt = c
			p = best_pt
		# 贴地生成，避免刷进地形里被挤飞
		p.y = M01Slagwerf.sample_height(p) + 1.0
		var inst := scavenger_scene.instantiate()
		get_tree().current_scene.add_child(inst)
		inst.global_position = p
		_live.append(inst)
		_spawned += 1
		Telemetry.emit("scav_spawn", {"total": _spawned})
