#!/bin/bash
echo "📡 Checking CLAW status…"
if pgrep -f "uvicorn backend.main:app" > /dev/null
then
  echo "🟢 CLAW is running"
else
  echo "🔴 CLAW is NOT running"
fi
