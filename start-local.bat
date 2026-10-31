@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ไม่พบ Node.js ใน PATH กรุณาติดตั้ง Node.js แล้วเปิด PowerShell ใหม่
  pause
  exit /b 1
)
echo เริ่มระบบ BSRU Workshop โดยจะลองพอร์ต 8001 ก่อน
echo หากพอร์ต 8001 ไม่ว่าง ระบบจะลองพอร์ต 8002 โดยไม่ปิดโปรแกรมอื่น
node server.js
echo.
echo เซิร์ฟเวอร์หยุดทำงานแล้ว
pause
