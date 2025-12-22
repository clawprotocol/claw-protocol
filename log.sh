#!/bin/bash
echo "🪵 Showing CLAW logs…"
ps aux | grep "uvicorn backend.main:app"
