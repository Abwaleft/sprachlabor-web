@echo off
rem Pruebas de la app autocontenida (pytest + Playwright sobre Edge sin cabeza). Nunca llaman a la IA ni a GitHub.
rem Usa el entorno Python de sprachlabor-2.0 (carpeta hermana) si existe: Anaconda + .venv con PYTHONPATH.
rem   scripts\test.bat            todas
rem   scripts\test.bat -k logica  filtro de pytest
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
if exist "..\sprachlabor-2.0\scripts\pyenv.bat" (
  pushd ..\sprachlabor-2.0
  call scripts\pyenv.bat
  popd
) else (
  set PY=python
)
"%PY%" -m pytest tests %*
if errorlevel 1 (echo. & echo [!!] Hay pruebas que fallan. & exit /b 1)
echo.
echo Todo en verde.
