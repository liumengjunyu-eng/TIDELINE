@echo off
REM ============================================================
REM  TIDELINE · 潮线 — 一键导出脚本 (Windows)
REM  用法：先安装 Godot 4.3 并下载「导出模板」，
REM        再把下面 GODOT 路径改成你的 godot.exe 实际位置，
REM        双击本文件即可导出 Windows 包（Web 可选）。
REM ============================================================
SETLOCAL

REM >>> 改成你本机 Godot 4.3 的路径 <<<
SET "GODOT=C:\Program Files\Godot\Godot_v4.3-stable_win64.exe"
REM 如果 Godot 已在 PATH，可直接写： SET "GODOT=godot"

SET "PROJDIR=%~dp0"
SET "OUT=%PROJDIR%build"

IF NOT EXIST "%GODOT%" (
  echo [错误] 找不到 Godot：%GODOT%
  echo 请编辑本脚本顶部的 GODOT 路径为你的 godot.exe 实际位置。
  pause
  EXIT /B 1
)

echo [1/3] 导入项目资源（校验脚本/场景）...
"%GODOT%" --headless --path "%PROJDIR%." --import 2>&1 | findstr /I "SCRIPT ERROR ERROR parse" && (
  echo [失败] 导入阶段发现脚本错误，见上方输出。请先修复再导出。
  pause
  EXIT /B 1
) || echo [OK] 导入无脚本错误。

echo [2/3] 导出 Windows x64 包...
"%GODOT%" --headless --path "%PROJDIR%." --export-release "Windows Desktop" "%OUT%\win\TIDELINE.exe"
IF EXIST "%OUT%\win\TIDELINE.exe" (
  echo [OK] 已生成 %OUT%\win\TIDELINE.exe
) ELSE (
  echo [失败] Windows 导出未生成 exe，请确认已安装「Windows 导出模板」。
  pause
  EXIT /B 1
)

echo [3/3] 导出 Web 包（可选）...
"%GODOT%" --headless --path "%PROJDIR%." --export-release "Web" "%OUT%\web\index.html"
IF EXIST "%OUT%\web\index.html" (
  echo [OK] 已生成 %OUT%\web\index.html
) ELSE (
  echo [提示] Web 导出未成功（可能未装 Web 模板），不影响 Windows 包。
)

echo.
echo 导出完成。把 build\win\ 文件夹连同 README_测试说明.txt 一起压缩发给测试者。
pause
ENDLOCAL
