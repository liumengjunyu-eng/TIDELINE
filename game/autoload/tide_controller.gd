# autoload/tide_controller.gd
# A4 + B3 + 信号声明：全局水位标量（唯一真相源，只读铁律）
extends Node

enum TidePhase { LOW, RISING, HIGH }
signal phase_changed(old_phase, new_phase)
signal tide_warning(next_phase)
signal water_vignette(alpha: float)

# 阶段时长取自设计文档，不是随手估的分钟数：
#   04_数值与平衡初稿 §3.1 / 01_核心设定集：低潮 0–40s、涨潮 40–75s、满潮 75–100s
# → 一个完整潮汐回合 = 100 秒（"把风险感塞进 100 秒的战术回合里"）。
# 早期曾误写为 180/240/180（600 秒），导致测试者要干等 7 分钟才看得到满潮，
# 核心机制在冒烟测试里等于隐形。切勿改回。
const PHASE_DURATIONS := { TidePhase.LOW: 40.0, TidePhase.RISING: 35.0, TidePhase.HIGH: 25.0 }
const PHASE_WATER := {
	TidePhase.LOW:    Vector2(0.00, 0.15),
	TidePhase.RISING: Vector2(0.15, 1.50),
	TidePhase.HIGH:   Vector2(1.50, 3.20),
}
const WARNING_LEAD := 2.0
const TIDE_OFF_LEVEL := 0.15

var current_phase: TidePhase = TidePhase.LOW
var water_level: float = 0.0
var phase_elapsed: float = 0.0
var _warned := false

func _process(delta):
	if not Telemetry.tide_enabled:
		water_level = TIDE_OFF_LEVEL
		phase_elapsed += delta
		if phase_elapsed >= PHASE_DURATIONS[current_phase] and current_phase != TidePhase.HIGH:
			_advance_phase()
		return
	var dur = PHASE_DURATIONS[current_phase]
	phase_elapsed += delta
	var ft = PHASE_WATER[current_phase]
	water_level = lerp(ft.x, ft.y, clamp(phase_elapsed / dur, 0.0, 1.0))
	if current_phase == TidePhase.LOW:
		water_vignette.emit(clamp(phase_elapsed / dur, 0.0, 1.0) * 0.35)
	var remaining = dur - phase_elapsed
	if remaining <= WARNING_LEAD and not _warned:
		_warned = true
		var nxt = current_phase + 1
		if nxt <= TidePhase.HIGH:
			tide_warning.emit(nxt)
			Telemetry.emit("tide_warning", {"next_phase": nxt})
	if phase_elapsed >= dur:
		_advance_phase()

func _advance_phase():
	var old = current_phase
	if current_phase == TidePhase.HIGH: return
	current_phase += 1
	phase_elapsed = 0.0
	_warned = false
	Telemetry.emit("phase_change", {"from": old, "to": current_phase})
	phase_changed.emit(old, current_phase)

func get_depth(world_pos: Vector3) -> float:
	return water_level - M01Slagwerf.sample_height(world_pos)

func get_phase_remaining() -> float:
	return PHASE_DURATIONS[current_phase] - phase_elapsed
