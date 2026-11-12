@echo off
rem Starts the Undula presentation (and the live app at /app/) and opens it in the browser.
cd /d "%~dp0"
python serve.py
