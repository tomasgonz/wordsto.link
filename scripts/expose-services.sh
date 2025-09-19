#!/bin/bash

# Script to expose WordsTo.Link services using ngrok or similar

echo "🌐 Exposing WordsTo.Link Services"
echo "================================="
echo ""
echo "Your local IP: $(hostname -I | awk '{print $1}')"
echo ""
echo "Local Access URLs:"
echo "  Backend:  http://$(hostname -I | awk '{print $1}'):8080"
echo "  Frontend: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Adminer:  http://$(hostname -I | awk '{print $1}'):8000"
echo ""

# Check if ngrok is installed
if command -v ngrok &> /dev/null; then
    echo "📡 Ngrok detected. You can expose services with:"
    echo ""
    echo "  ngrok http 8080  # Expose backend"
    echo "  ngrok http 3000  # Expose frontend"
    echo "  ngrok http 8000  # Expose Adminer"
else
    echo "💡 To expose to the internet, install ngrok:"
    echo "  wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz"
    echo "  tar xvzf ngrok-v3-stable-linux-amd64.tgz"
    echo "  sudo mv ngrok /usr/local/bin/"
fi

echo ""
echo "🔧 Alternative: Use SSH tunneling"
echo "  From remote machine:"
echo "  ssh -L 3000:localhost:3000 -L 8080:localhost:8080 -L 8000:localhost:8000 user@$(hostname -I | awk '{print $1}')"
