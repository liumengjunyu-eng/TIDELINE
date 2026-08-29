# entities/weapon.gd
# KESTREL 三人称武器系统（P0 灰盒）：HEAT 热衰变 = 第三类射击手感，
# 介于 CS 固定后坐与 Valorant 纯随机之间 —— 越打越抖。
extends Node3D

enum Kind { K7, V31, A3 }

const WEAPON_STATS := {
	Kind.K7:  {"rpm": 800, "dmg": 30, "pellets": 1, "spread": 0.010, "mag": 30, "heat": 9.0},
	Kind.V31: {"rpm": 600, "dmg": 41, "pellets": 1, "spread": 0.015, "mag": 20, "heat": 14.0},
	Kind.A3:  {"rpm": 60,  "dmg": 18, "pellets": 9, "spread": 0.080, "mag": 6,  "heat": 28.0},
}
const HEAT_MAX := 100.0
const HEAT_COOL := 18.0          # 每秒散热
const SPREAD_MULT := 4.5         # 满热时散布放大倍数（叠加基础散布）
const HIT_MASK := (1 << 0) | (1 << 2)

@export var kind: int = Kind.K7

var _stats: Dictionary
var _heat := 0.0
var _cooldown := 0.0
var _ammo := 0
var _ray := PhysicsRayQueryParameters3D.new()

func _ready() -> void:
	_stats = WEAPON_STATS[kind]
	_ammo = _stats["mag"]

func _process(delta: float) -> void:
	if _cooldown > 0.0: _cooldown -= delta
	if _heat > 0.0: _heat = max(0.0, _heat - HEAT_COOL * delta)

# 返回实际命中目标数（命中判定由调用方传入 world 射线起点/方向，或自身 muzzle）。
func try_shoot(origin: Vector3, base_dir: Vector3) -> Dictionary:
	if _cooldown > 0.0 or _ammo <= 0:
		return {"fired": false}
	_cooldown = 60.0 / float(_stats["rpm"])
	_ammo -= 1
	_heat = min(HEAT_MAX, _heat + float(_stats["heat"]))

	var spread := float(_stats["spread"]) * (1.0 + (_heat / HEAT_MAX) * SPREAD_MULT)
	var hits := 0
	for _i in int(_stats["pellets"]):
		var dir := base_dir
		if spread > 0.0:
			dir = dir.rotated(Vector3.UP, randf_range(-spread, spread))
			dir = dir.rotated(get_global_transform().basis.x, randf_range(-spread, spread))
		_ray.from = origin
		_ray.to = origin + dir * 200.0
		_ray.collision_mask = HIT_MASK
		var space := get_world_3d().direct_space_state
		var res := space.intersect_ray(_ray)
		if res and res.has("collider"):
			hits += 1
			# P0 占位：对命中实体调用 take_damage（玩家/AI 须实现）
			if res["collider"].has_method("take_damage"):
				res["collider"].take_damage(_stats["dmg"])

	Telemetry.emit("weapon_fire", {
		"kind": kind, "ammo": _ammo, "heat": round(_heat), "hits": hits,
	})
	var result := {"fired": true, "hits": hits}
	if _ammo <= 0: reload()
	return result

func reload() -> void:
	_ammo = int(_stats["mag"])
	Telemetry.emit("weapon_reload", {"kind": kind})
