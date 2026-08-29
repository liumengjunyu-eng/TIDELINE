# autoload/telemetry.gd
# A3 + M0' 测试包：本地落盘 + Web 导出能力 + 练习局丢弃
extends Node

var session_id := ""
var tide_enabled := true
var practice_mode := false
var _file: FileAccess
var _events: Array = []
var _log_path := ""

func _ready():
	_parse_args()
	session_id = "%d_%d" % [Time.get_unix_time_from_system(), randi() % 99999]
	_log_path = "user://telemetry_%s.jsonl" % session_id
	if practice_mode:
		print("[TELEMETRY] 练习局模式：本局数据不落盘")
		_file = null
		return
	_file = FileAccess.open(_log_path, FileAccess.WRITE)
	emit("session_start", {"tide_enabled": tide_enabled})

func _parse_args():
	for a in OS.get_cmdline_args():
		if a == "--tide-off": tide_enabled = false
		elif a == "--tide-on": tide_enabled = true
		elif a.begins_with("--practice="): practice_mode = (a != "--practice=0")
	if OS.has_feature("web"):
		var s = JavaScriptBridge.eval("window.location.search", true)
		if s is String:
			if s.find("tide=0") != -1: tide_enabled = false
			if s.find("practice=1") != -1: practice_mode = true

func emit(event: String, payload: Dictionary = {}) -> void:
	if _file == null: return
	payload["ts"] = Time.get_unix_time_from_system()
	payload["session"] = session_id
	payload["tide"] = tide_enabled
	payload["event"] = event
	_events.append(payload)
	_file.store_line(JSON.stringify(payload))
	_file.flush()

func export_to_web_storage() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"window.localStorage.setItem('tideline_telemetry', '%s')" % JSON.stringify(_events), true)

func get_log_path() -> String:
	return _log_path
