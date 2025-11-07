#!/bin/bash

# Test script for MEGA Agent endpoint
# Usage: ./test-mega-agent.sh "your message here"

# Get the replit URL (adjust if needed)
BASE_URL="https://${REPL_SLUG}.${REPL_OWNER}.repl.co"

# Default message if none provided
MESSAGE="${1:-Find pubs selling canned beer in Kent}"

# Your user credentials (from your account)
USER_ID="9be10227781aa2d0c57e5fb62892ba50"
USER_EMAIL="tom@tom.com"

echo "🧪 Testing MEGA Agent Endpoint"
echo "================================"
echo "Message: $MESSAGE"
echo "User: $USER_EMAIL"
echo ""

# Make the request
curl -X POST "${BASE_URL}/agent/chat?user_id=${USER_ID}&user_email=${USER_EMAIL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"${MESSAGE}\",
    \"conversationId\": \"test-mega-session\"
  }" | jq '.'

echo ""
echo "✅ Test complete!"
