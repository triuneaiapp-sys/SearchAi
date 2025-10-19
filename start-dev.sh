#!/bin/bash

# Start webhook server in background
echo "Starting webhook server..."
cd /Users/ankurkulkarni/Documents/Triune-Info/candidate-match-portal
node webhook-server.js &
WEBHOOK_PID=$!

# Wait a moment for webhook server to start
sleep 2

# Start React app
echo "Starting React app..."
pnpm dev &
REACT_PID=$!

echo "Both servers started!"
echo "Webhook server: http://localhost:3001"
echo "React app: http://localhost:5176"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo "Stopping servers..."
    kill $WEBHOOK_PID 2>/dev/null
    kill $REACT_PID 2>/dev/null
    exit
}

# Trap Ctrl+C
trap cleanup INT

# Wait for both processes
wait
