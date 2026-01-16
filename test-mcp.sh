#!/bin/bash
# Test script to verify MCP server functionality
# Usage: ./test-mcp.sh [test-name]
# Test names: tools, resources, guidance

set -e

SERVER_CMD="node dist/index.js"
TEST_DIR=$(dirname "$0")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to send JSON-RPC request
send_request() {
  local method=$1
  local params=$2
  local id=${3:-1}
  
  if [ -z "$params" ]; then
    echo "{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"$method\"}"
  else
    echo "{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"$method\",\"params\":$params}"
  fi
}

# Test tools/list
test_tools_list() {
  echo -e "${YELLOW}Testing tools/list...${NC}"
  local response=$(send_request "tools/list" "" 1 | $SERVER_CMD 2>&1)
  
  if echo "$response" | grep -q '"result"'; then
    echo -e "${GREEN}✓ tools/list works${NC}"
    echo "$response" | grep -A 5 '"result"' | head -10
    return 0
  else
    echo -e "${RED}✗ tools/list failed${NC}"
    echo "$response"
    return 1
  fi
}

# Test tool call (guidance mode - no params)
test_guidance_mode() {
  echo -e "${YELLOW}Testing guidance mode (job_create without params)...${NC}"
  local params="{\"name\":\"job_create\"}"
  local response=$(send_request "tools/call" "$params" 2 | $SERVER_CMD 2>&1)
  
  if echo "$response" | grep -q '"result"'; then
    echo -e "${GREEN}✓ Guidance mode works${NC}"
    echo "$response" | grep -A 3 '"result"' | head -5
    return 0
  else
    echo -e "${RED}✗ Guidance mode failed${NC}"
    echo "$response"
    return 1
  fi
}

# Test tool call (normal mode - with params)
test_tool_call() {
  echo -e "${YELLOW}Testing tool call (job_create with params)...${NC}"
  local params="{\"name\":\"job_create\",\"arguments\":{\"name\":\"Test Job\",\"project\":\"test\",\"workflow_steps\":[{\"type\":\"command\",\"exec\":\"echo hello\"}]}}"
  local response=$(send_request "tools/call" "$params" 3 | $SERVER_CMD 2>&1)
  
  if echo "$response" | grep -q '"result"'; then
    echo -e "${GREEN}✓ Tool call works${NC}"
    echo "$response" | grep -A 5 '"result"' | head -10
    return 0
  else
    echo -e "${RED}✗ Tool call failed${NC}"
    echo "$response"
    return 1
  fi
}

# Test resources/list
test_resources_list() {
  echo -e "${YELLOW}Testing resources/list...${NC}"
  local response=$(send_request "resources/list" "" 4 | $SERVER_CMD 2>&1)
  
  if echo "$response" | grep -q '"result"'; then
    echo -e "${GREEN}✓ resources/list works${NC}"
    echo "$response" | grep -A 5 '"result"' | head -10
    return 0
  else
    echo -e "${RED}✗ resources/list failed${NC}"
    echo "$response"
    return 1
  fi
}

# Test resource read (new URI)
test_resource_read_new() {
  echo -e "${YELLOW}Testing resource read (new URI: rundeck://api)...${NC}"
  local params="{\"uri\":\"rundeck://api\"}"
  local response=$(send_request "resources/read" "$params" 5 | $SERVER_CMD 2>&1)
  
  if echo "$response" | grep -q '"result"'; then
    echo -e "${GREEN}✓ New URI works${NC}"
    return 0
  else
    echo -e "${RED}✗ New URI failed${NC}"
    echo "$response"
    return 1
  fi
}


# Main test runner
main() {
  local test_name=${1:-"all"}
  
  echo "MCP Server Test Suite"
  echo "===================="
  echo ""
  
  # Check if server is built
  if [ ! -f "dist/index.js" ]; then
    echo -e "${RED}Error: dist/index.js not found. Run 'npm run build' first.${NC}"
    exit 1
  fi
  
  local failed=0
  
  case "$test_name" in
    "tools")
      test_tools_list || ((failed++))
      test_tool_call || ((failed++))
      ;;
    "resources")
      test_resources_list || ((failed++))
      test_resource_read_new || ((failed++))
      ;;
    "guidance")
      test_guidance_mode || ((failed++))
      ;;
    "all"|*)
      test_tools_list || ((failed++))
      test_resources_list || ((failed++))
      test_resource_read_new || ((failed++))
      test_guidance_mode || ((failed++))
      test_tool_call || ((failed++))
      ;;
  esac
  
  echo ""
  if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}$failed test(s) failed${NC}"
    exit 1
  fi
}

main "$@"

