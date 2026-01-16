#!/bin/bash
cd "$(dirname "$0")"

# Start backend silently
cd backend
npm run dev > /dev/null 2>&1 &
BACKEND_PID=$!

# Start frontend silently
cd ../frontend
npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!

# Save PIDs for stop script
echo $BACKEND_PID > /tmp/minemanager-backend.pid
echo $FRONTEND_PID > /tmp/minemanager-frontend.pid

# Wait for services to start
sleep 3

# Open with Electron
cd ../frontend
npm run electron > /dev/null 2>&1 &
