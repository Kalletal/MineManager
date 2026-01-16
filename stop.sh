#!/bin/bash
echo "Arrêt de MineManager..."

# Kill backend and frontend
pkill -f "npm run dev"
pkill -f "tsx watch"
pkill -f "vite"

# Kill BungeeCord
pkill -f "BungeeCord.jar"

# Kill Minecraft servers
pkill -f "java.*server.jar.*nogui"

echo "MineManager arrêté !"
sleep 2
