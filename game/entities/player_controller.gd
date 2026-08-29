# PlayerController — KESTREL 主角（P0 灰盒）
# 相机无关：移动意图相对相机，本脚本管位移 + 重力落地 + 涉水惩罚 + 开火 + 撤离判定。
extends CharacterBody3D

const GRAVITY := 16.0

@export var base_speed: float = 5.2          # 干地速度（米/秒），对应 04 数值
@export var accel: float = 40.0
@export var extraction_markers: Array[Node3D] = []   # 直接引用节点：浮桥点会随潮汐浮起
@export var max_health: float = 100.0

var ws := WaterStateResource.get_instance()
var state: int = WaterStateResource.State.DRY
var look_yaw: float = 0.0                    # 由相机脚本每帧写入（缺省用相机 yaw 兜底）
var can_fire: bool = true                    # 游泳时禁用开火（核心规则）
var _weapon: Node3D
var _telemetry_accum := 0.0
var health: float = 100.0
var alive: bool = true

signal panicked(state: int)                  # 供 HUD/演出订阅（湿感反馈触发点）
signal extracted()                           # 到达撤离点（仅满潮阶段有效）

func _ready() -> void:
	add_to_group("player")
	health = max_health
	_weapon = get_node_or_null("Weapon")

# 拾荒者近身造成伤害；血量归零则本局结束（P0 只做埋点，不做重生流程）
func take_damage(amount: float) -> void:
	if not alive:
		return
	health = maxf(0.0, health - amount)
	Telemetry.emit("player_hit", {"hp": health, "dmg": amount})
	if health <= 0.0:
		alive = false
		Telemetry.emit("player_death", {"phase": TideController.current_phase})
		print("[GAME] 玩家阵亡，本局结束")

func _physics_process(delta: float) -> void:
	if not alive:
		velocity = Vector3.ZERO
		move_and_slide()
		return

	# 输入：WASD -> 朝相机朝向的水平意图
	var cam := get_viewport().get_camera_3d()
	if cam: look_yaw = cam.global_rotation.y
	var in_vec := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var dir := Vector3(in_vec.x, 0, -in_vec.y).rotated(Vector3.UP, look_yaw)
	if dir.length() > 1.0: dir = dir.normalized()

	# 涉水惩罚（含滞后区间）：用单一水位标量算出深度 -> 状态 -> 速度倍率
	var depth := TideController.get_depth(global_position)
	state = ws.update_state(state, depth)
	can_fire = state != WaterStateResource.State.SWIMMING   # 游泳时捏不住枪

	# 垂直：重力 + 落地贴合（没有这一步角色会悬空，走下坡也不贴地）
	if is_on_floor():
		velocity.y = 0.0
	else:
		velocity.y -= GRAVITY * delta

	# 水平：只插值 XZ，避免把重力项一起阻尼掉
	var speed := base_speed * ws.speed_mults[state]
	var target_xz := dir * speed
	var blend := clampf(accel * delta / maxf(base_speed, 0.1), 0.0, 1.0)
	velocity.x = lerpf(velocity.x, target_xz.x, blend)
	velocity.z = lerpf(velocity.z, target_xz.z, blend)
	move_and_slide()

	_aim_and_fire(delta)

	# 湿感演出触发点：状态变化时通知 HUD 做镜头晃动 + 水珠
	if state != WaterStateResource.State.DRY:
		panicked.emit(state)

	# 埋点：逐帧写盘会把磁盘打满，按 4Hz 抽样
	_telemetry_accum += delta
	if _telemetry_accum >= 0.25:
		_telemetry_accum = 0.0
		Telemetry.emit("player_state", {"state": state, "depth": depth})

	_check_extraction()

func _aim_and_fire(_delta: float) -> void:
	if _weapon == null or not _weapon.has_method("try_shoot"):
		return
	var aim := _aim_point()
	if aim != global_position:
		var flat := aim - global_position
		flat.y = 0.0
		if flat.length_squared() > 0.0001:
			rotation.y = atan2(flat.x, flat.z)
	if not can_fire:
		return
	if Input.is_action_pressed("reload") and _weapon.has_method("reload"):
		_weapon.reload()
	if Input.is_action_pressed("fire"):
		var flat := aim - global_position
		flat.y = 0.0
		var dir: Vector3 = -global_transform.basis.z if flat.length_squared() < 0.0001 else flat.normalized()
		# 起点推出胶囊外，否则射线会打中玩家自己
		var muzzle := global_position + Vector3(0, 1.2, 0) + dir * 0.7
		_weapon.try_shoot(muzzle, dir)

# 鼠标射线打在玩家所在水平面上 —— 俯视角的标准瞄准方式。
func _aim_point() -> Vector3:
	var vp := get_viewport()
	var cam := vp.get_camera_3d()
	if cam == null:
		return global_position
	var mouse := vp.get_mouse_position()
	var from := cam.project_ray_origin(mouse)
	var ray := cam.project_ray_normal(mouse)
	if abs(ray.y) < 0.0001:
		return global_position
	var t := (global_position.y - from.y) / ray.y
	if t < 0.0:
		return global_position
	return from + ray * t

# 撤离判定：满潮阶段到达任一撤离点。用节点实时坐标，浮桥点才会跟着水面浮。
func _check_extraction() -> void:
	if TideController.current_phase != TideController.TidePhase.HIGH:
		return
	for m in extraction_markers:
		if m == null or not is_instance_valid(m):
			continue
		if not m.visible:
			continue
		if global_position.distance_to(m.global_position) < 2.5:
			extracted.emit()
			return
