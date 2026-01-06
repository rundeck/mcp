#!/bin/bash
# Test script to verify MCP tools are working

echo "Testing MCP Server Tools..."
echo ""

echo "1. Testing tools/list..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js 2>&1 | grep -A 50 '"result"' | head -30
echo ""

echo "2. Testing tool call: rundeck_get_job_template..."
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"rundeck_get_job_template","arguments":{"template_type":"simple-command"}}}' | node dist/index.js 2>&1 | grep -A 20 '"result"'
echo ""

echo "3. Testing tool call: rundeck_generate_job..."
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"rundeck_generate_job","arguments":{"name":"Test Job","project":"test","workflow_steps":[{"type":"command","exec":"echo hello"}]}}}' | node dist/index.js 2>&1 | grep -A 30 '"result"' | head -20
echo ""

echo "Done!"


