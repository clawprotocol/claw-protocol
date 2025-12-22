#!/bin/bash
echo "♻️ Restarting CLAW Backend…"
./kill.sh
sleep 1
./run.sh
