# main.gd — 根节点启动脚本（P0 冒烟日志 + 输入映射注册）
# 仅做加载反馈、输入动作注册与埋点会话开始，不承载游戏逻辑。
extends Node3D

# 键位在代码里注册，避免手写 project.godot 的 InputEvent 序列化格式出错。
# 若编辑器里已手工配置过同名动作，这里直接沿用，不覆盖。
func _ready() -> void:
	_register_inputs()
	print("[SMOKE] 进入主场景，地形/网格/相机已构建")
	print("[SMOKE] 当前潮汐相位: ", TideController.TidePhase.keys()[TideController.current_phase])
	print("[SMOKE] 潮汐启用: ", Telemetry.tide_enabled)
	SelfCheck.run()
	Telemetry.emit("session_start", {"tide_enabled": Telemetry.tide_enabled})


func _register_inputs() -> void:
	_action("move_left",   [KEY_A, KEY_LEFT])
	_action("move_right",  [KEY_D, KEY_RIGHT])
	_action("move_forward", [KEY_W, KEY_UP])
	_action("move_back",   [KEY_S, KEY_DOWN])
	_action("fire",        [KEY_SPACE])
	_action("reload",      [KEY_R])
	if InputMap.has_action("fire"):
		var mb := InputEventMouseButton.new()
		mb.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event("fire", mb)


func _action(name: String, keycodes: Array) -> void:
	if not InputMap.has_action(name):
		InputMap.add_action(name)
	for k in keycodes:
		var e := InputEventKey.new()
		e.keycode = k
		e.physical_keycode = k
		InputMap.action_add_event(name, e)
