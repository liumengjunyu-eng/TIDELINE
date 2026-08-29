# world/floating_bridge.gd
# 浮桥：随潮汐水位升降。甲板始终浮在水面之上 deck_offset 米。
extends Node3D

@export var deck_offset: float = 0.15   # 甲板高出水面量

func _process(_delta: float) -> void:
	if not is_instance_valid(TideController):
		return
	global_position.y = TideController.water_level + deck_offset
