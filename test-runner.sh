#!/bin/bash

echo "🚀 MCP Secrets Vault Test Runner"
echo "================================"
echo ""

# Set up test environment
export GITHUB_TOKEN="ghp_test_1234567890abcdef"
export OPENAI_API_KEY="sk-test-abcdef1234567890"
export SLACK_BOT_TOKEN="xoxb-test-1234567890"
export VAULT_CONFIG="./test-vault.config.json"

echo "✅ Environment variables set"
echo ""

# Run doctor first
echo "📋 Running diagnostics..."
echo "------------------------"
npx mcp-secrets-vault doctor test-vault.config.json
echo ""

# Now test with Claude Desktop configuration
echo "📝 Claude Desktop Configuration:"
echo "-------------------------------"
cat << 'EOF'
Add this to your Claude Desktop config.json:

{
  "mcpServers": {
    "secrets-vault-test": {
      "command": "npx",
      "args": ["mcp-secrets-vault"],
      "env": {
        "VAULT_CONFIG": "./test-vault.config.json",
        "GITHUB_TOKEN": "ghp_test_1234567890abcdef",
        "OPENAI_API_KEY": "sk-test-abcdef1234567890",
        "SLACK_BOT_TOKEN": "xoxb-test-1234567890"
      }
    }
  }
}

Or for production use (with real tokens in your environment):

{
  "mcpServers": {
    "secrets-vault": {
      "command": "npx",
      "args": ["mcp-secrets-vault"],
      "env": {
        "VAULT_CONFIG": "/path/to/your/vault.config.json"
      }
    }
  }
}
EOF

echo ""
echo "✅ Setup complete! The MCP Secrets Vault is ready to use."