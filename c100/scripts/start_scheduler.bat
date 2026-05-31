@echo off
cd /d "%~dp0.."
cd scheduler
go run .
pause
