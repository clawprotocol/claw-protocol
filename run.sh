#!/bin/bash
clear
echo "🔱 Starting CLAW Backend…"
source venv/bin/activate
uvicorn backend.main:app --workers 2 --loop asyncio --http auto
