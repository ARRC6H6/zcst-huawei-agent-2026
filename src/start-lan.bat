@echo off
rem ???? ? ????? ?? Windows ?????????? ASCII?????? lan-server.py ???
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py"
if not defined PY goto nopython

"%PY%" "%~dp0lan-server.py" %*

echo.
echo Server stopped.
pause
exit /b 0

:nopython
echo.
echo [ERROR] Python 3 not found.
echo         Please install Python 3.7+ from https://www.python.org/downloads/
echo         Remember to tick "Add Python to PATH" during setup.
echo.
pause
exit /b 1
