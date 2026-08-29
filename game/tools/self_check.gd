# tools/self_check.gd
# 启动自检：所有 P0 必需文件存在 + 关键 autoload 已注册（project.godot）。
# 任一失败打印 [SELF-CHECK] FAIL 并给原因；全过打印 [SELF-CHECK] PASS。
# 用法：main 场景 _ready 调用 SelfCheck.run() 或在编辑器 Run 本脚本。
extends RefCounted
class_name SelfCheck

const REQUIRED_FILES := [
	"res://core/water_state.gd",
	"res://autoload/telemetry.gd",
	"res://autoload/tide_controller.gd",
	"res://world/m01_slagwerf.gd",
	"res://world/terrain_body.gd",
	"res://world/terrain_mesh.gd",
	"res://world/floating_bridge.gd",
	"res://entities/player_controller.gd",
	"res://entities/weapon.gd",
	"res://entities/scavenger_ai.gd",
	"res://systems/extraction.gd",
	"res://systems/enemy_spawner.gd",
	"res://systems/navigation_manager.gd",
	"res://camera/tide_camera.gd",
]

const REQUIRED_AUTOLOADS := ["Telemetry", "TideController"]

static func run() -> bool:
	var ok := true
	for f in REQUIRED_FILES:
		if not ResourceLoader.exists(f):
			ok = false
			printerr("[SELF-CHECK] FAIL 缺少文件: ", f)
	for a in REQUIRED_AUTOLOADS:
		if not _autoload_present(a):
			ok = false
			printerr("[SELF-CHECK] FAIL 未注册 autoload: ", a)
	if ok:
		print("[SELF-CHECK] PASS")
	return ok

# autoload 在编辑器/运行期以全局名存在，用 has_signal 友好检测：直接查 project settings。
static func _autoload_present(name: String) -> bool:
	var cfg := ProjectSettings.get_setting("autoload/" + name, null)
	return cfg != null
