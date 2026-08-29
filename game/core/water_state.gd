# core/water_state.gd
# B7 单一数据源：四档涉水阈值与倍率，编辑期可调参。
extends Resource
class_name WaterStateResource

enum State { DRY, SHALLOW, WADING, SWIMMING }

@export var enter_thresholds: Array[float] = [0.0, 0.3, 1.2, 2.0]
@export var exit_thresholds:  Array[float] = [0.0, 0.2, 1.1, 1.9]
@export var speed_mults:      Array[float] = [1.0, 0.85, 0.55, 0.40]
@export var spread_mults:     Array[float] = [3.2, 3.6, 4.5, 1.0]

func update_state(cur: int, depth: float) -> int:
	if cur < State.SWIMMING and depth >= enter_thresholds[cur + 1]:
		return cur + 1
	elif cur > State.DRY and depth <= exit_thresholds[cur]:
		return cur - 1
	return cur

static func get_instance() -> WaterStateResource:
	const P := "res://core/water_state.tres"
	if ResourceLoader.exists(P):
		return load(P) as WaterStateResource
	return WaterStateResource.new()
