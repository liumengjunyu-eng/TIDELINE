# ScavengerAI — 拾荒者：随水位向高地撤离（核心设计"敌人抢高地"）
# P0 必须验证：潮汐上升时，AI 主动往高地迁移，与玩家动线重合制造遭遇。
# 若 AI 不响应潮汐 -> 项目 KILL（机制沦为背景演出）。
extends CharacterBody3D

enum AiState { PATROL, RETREAT, ENGAGE }

const GRAVITY := 16.0
const RETREAT_REPLAN := 0.5          # 高地搜索是 O(r^2)，每帧跑会拖垮帧率

@export var move_speed: float = 4.2           # 干地基础速度（米/秒）
@export var detect_radius: float = 18.0
@export var attack_range: float = 2.2
@export var attack_damage: float = 12.0
@export var attack_interval: float = 1.1
@export var max_health: float = 60.0

var ws := WaterStateResource.get_instance()
var water_state: int = WaterStateResource.State.DRY
var ai_state: int = AiState.PATROL
var _target := Vector3.ZERO
var _repick_cooldown := 0.0
var _replan_timer := 0.0
var _attack_cd := 0.0
var health: float = 60.0
# 外部注入（由 enemy_spawner 每帧写入）：玩家当前世界坐标
var player_position: Vector3 = Vector3.ZERO

func _ready() -> void:
	health = max_health
	TideController.phase_changed.connect(_on_phase)
	_pick_target()

# 参数个数必须与 phase_changed(old, new) 对齐，否则部分版本会在连接/发射时报错
func _on_phase(_old: int, _new: int) -> void:
	_repick_cooldown = 0.0   # 阶段切换立刻重算目标

func _physics_process(delta: float) -> void:
	var depth := TideController.get_depth(global_position)
	water_state = ws.update_state(water_state, depth)
	var speed := move_speed * ws.speed_mults[water_state]

	# 状态机：涨潮淹没 -> 抢高地；近身 -> 交火；否则巡逻
	var tide := TideController.water_level
	var new_state := AiState.PATROL
	if depth > 2.0 or (TideController.current_phase == TideController.TidePhase.RISING and depth > 1.2):
		new_state = AiState.RETREAT
	elif global_position.distance_to(player_position) < detect_radius:
		new_state = AiState.ENGAGE

	if new_state != ai_state:
		ai_state = new_state
		Telemetry.emit("scav_state", {"state": ai_state, "depth": depth})

	if ai_state == AiState.PATROL:
		if _repick_cooldown > 0.0:
			_repick_cooldown -= delta
		else:
			_repick_cooldown = 0.6
			_target = _random_low_point()
	elif ai_state == AiState.RETREAT:
		_replan_timer -= delta
		if _replan_timer <= 0.0:
			_replan_timer = RETREAT_REPLAN
			_target = M01Slagwerf.nearest_high_ground(global_position, 40.0, tide + 0.3)
	elif ai_state == AiState.ENGAGE:
		_target = player_position

	# 朝目标移动（P0 直线转向；P0.5 接入 NavigationAgent3D 做寻路）
	var dir := (_target - global_position)
	dir.y = 0.0
	var want_x := 0.0
	var want_z := 0.0
	if dir.length() > 0.2:
		dir = dir.normalized()
		want_x = dir.x * speed
		want_z = dir.z * speed

	# 垂直：重力 + 落地贴合（没有这一步 AI 会悬空，也爬不上高地）
	if is_on_floor():
		velocity.y = 0.0
	else:
		velocity.y -= GRAVITY * delta
	velocity.x = want_x
	velocity.z = want_z
	move_and_slide()

	# 交火：近身后按节奏造成伤害（P0 只做接触伤害，不做弹道/动画）
	if ai_state == AiState.ENGAGE:
		_attack_cd -= delta
		if global_position.distance_to(player_position) < attack_range and _attack_cd <= 0.0:
			_attack_cd = attack_interval
			Telemetry.emit("scav_attack", {"dist": global_position.distance_to(player_position)})
			var p := get_tree().get_first_node_in_group("player")
			if p != null and p.has_method("take_damage"):
				p.take_damage(attack_damage)

# 受伤时被玩家激怒，强制切入交火
func take_damage(amount: float) -> void:
	health -= amount
	ai_state = AiState.ENGAGE
	_target = player_position
	Telemetry.emit("scav_hit", {"hp": health})
	if health <= 0.0:
		Telemetry.emit("scav_death", {})
		queue_free()

func _random_low_point() -> Vector3:
	# P0 占位：在地图范围内随机取一个低标高点。正式版改为巡逻路点。
	return global_position + Vector3(randf_range(-15, 15), 0, randf_range(-15, 15))
