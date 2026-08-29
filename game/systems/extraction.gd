# systems/extraction.gd
# 撤离系统：随潮汐阶段揭示撤离点。满潮阶段，最后一个撤离点浮到浮桥上，
# 玩家须踩桥撤离 —— 把"敌人抢高地"反向变成"玩家抢桥"。
extends Node

@export var extraction_markers: Array[Node3D] = []
@export var bridge: Node3D

func _ready() -> void:
	TideController.phase_changed.connect(_on_phase)
	_update_visibility()

func _on_phase(_old: int, new_phase: int) -> void:
	_update_visibility()
	Telemetry.emit("extraction_phase", {"phase": new_phase})

# 满潮把最后一个撤离点挂到浮桥下，低/涨潮只显示前两个点。
func _update_visibility() -> void:
	var n := extraction_markers.size()
	for i in n:
		var show := false
		match TideController.current_phase:
			TideController.TidePhase.LOW:    show = (i == 0)
			TideController.TidePhase.RISING: show = (i < 2)
			TideController.TidePhase.HIGH:   show = true
		extraction_markers[i].visible = show
	if bridge and n > 0 and TideController.current_phase == TideController.TidePhase.HIGH:
		var m := extraction_markers[n - 1]
		if m.get_parent() != bridge:
			m.reparent(bridge, false)
		m.position = Vector3(0, 0.3, 0)   # 坐到甲板上，随桥一起浮出水面
