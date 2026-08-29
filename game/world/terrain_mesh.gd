# world/terrain_mesh.gd
# A2 地形网格生成（灰盒可视化）：与 terrain_body.gd 共用同一标高数据源，
# 保证"看到的"与"踩到的"完全一致。
@tool
extends MeshInstance3D
class_name TerrainMesh

const CELL := 1.0   # 每格世界尺寸（米）

# 根据本场景标高数据，把地形网格直接构建到 self.mesh（P0 灰盒可视化，
# 与 terrain_body.gd 共用同一数据源，保证"看到的"与"踩到的"一致）。
func _ready() -> void:
	build_mesh_instance()

func build_mesh_instance() -> void:
	var size = M01Slagwerf.GRID_SIZE
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for z in range(size - 1):
		for x in range(size - 1):
			var h00 := M01Slagwerf._get_height_at(x,     z)
			var h10 := M01Slagwerf._get_height_at(x + 1, z)
			var h01 := M01Slagwerf._get_height_at(x,     z + 1)
			var h11 := M01Slagwerf._get_height_at(x + 1, z + 1)
			var p00 := Vector3(float(x) * CELL, h00, float(z) * CELL)
			var p10 := Vector3(float(x + 1) * CELL, h10, float(z) * CELL)
			var p01 := Vector3(float(x) * CELL, h01, float(z + 1) * CELL)
			var p11 := Vector3(float(x + 1) * CELL, h11, float(z + 1) * CELL)
			st.add_vertex(p00); st.add_vertex(p10); st.add_vertex(p01)
			st.add_vertex(p10); st.add_vertex(p11); st.add_vertex(p01)

	st.generate_normals()   # 没有法线，受光的地形会整片渲染成黑色
	st.index()
	mesh = st.commit()

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.54, 0.51, 0.46)
	mat.roughness = 0.95
	material_override = mat
