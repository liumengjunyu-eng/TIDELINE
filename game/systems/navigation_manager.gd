# systems/navigation_manager.gd
# 随潮汐阶段切换 NavRegion，让 AI 寻路避开被淹没区域。
# 预先烘焙 3 张 NavMesh（见 tools/bake_navmeshes.gd），此处只负责启用对应层。
extends Node

@export var nav_low: NavigationRegion3D
@export var nav_rising: NavigationRegion3D
@export var nav_high: NavigationRegion3D

var _regions := {}

func _ready() -> void:
	_regions = {
		TideController.TidePhase.LOW: nav_low,
		TideController.TidePhase.RISING: nav_rising,
		TideController.TidePhase.HIGH: nav_high,
	}
	TideController.phase_changed.connect(_on_phase)
	_apply(TideController.current_phase)

func _on_phase(_old: int, new_phase: int) -> void:
	_apply(new_phase)

func _apply(phase: int) -> void:
	for p in _regions:
		if _regions[p]: _regions[p].enabled = (p == phase)
	Telemetry.emit("nav_active", {"phase": phase})
