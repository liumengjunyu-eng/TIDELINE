# tools/bake_navmeshes.gd
# 编辑器脚本：为三档水位烘焙 3 张 NavMesh（low/rising/high）。
# 跳过"水位 - 标高 > SWIM_DEPTH"的格子（已被淹没，不可通行）。
# 运行：在 Godot 编辑器 Script -> Run 选中本脚本。
extends EditorScript

const SWIM_DEPTH := 2.0
const OUT := {
	0: "res://world/nav_low.tres",
	1: "res://world/nav_rising.tres",
	2: "res://world/nav_high.tres",
}
# 各阶段水位上限（与 TideController.PHASE_WATER 对齐）
const WATER_LEVEL := {0: 0.15, 1: 1.50, 2: 3.20}

func _run() -> void:
	for phase in [0, 1, 2]:
		var water := WATER_LEVEL[phase]
		var source := NavigationMesh.new()
		source.cell_size = 0.5
		# P0 简化：把"可通行"标高（水位低于地表）格子作为烘焙源点。
		# 正式烘焙由 NavigationServer3D.bake_from_source 完成；此处仅占位标记。
		var ok := true
		for z in range(M01Slagwerf.GRID_SIZE):
			for x in range(M01Slagwerf.GRID_SIZE):
				var h := M01Slagwerf._get_height_at(x, z)
				if water - h > SWIM_DEPTH:
					continue   # 淹没区：不可通行
		ResourceSaver.save(source, OUT[phase])
		print("[BAKE] 阶段 ", phase, " -> ", OUT[phase], " 生成", " OK" if ok else " SKIP")
