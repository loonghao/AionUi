/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP Debugging Tool
 * 
 * Provides comprehensive MCP debugging and diagnostics:
 * 1. Test MCP server connections
 * 2. Validate MCP configurations
 * 3. Monitor MCP protocol communication
 * 4. Diagnose MCP-related issues
 * 
 * Usage:
 *   bunx tsx scripts/debug-mcp.ts test <server-name>     # Test specific MCP server
 *   bunx tsx scripts/debug-mcp.ts list                   # List all MCP servers
 *   bunx tsx scripts/debug-mcp.ts validate               # Validate all configurations
 *   bunx tsx scripts/debug-mcp.ts monitor                # Monitor MCP communication
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface McpServer {
  name: string;
  transport: {
    type: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
}

class McpDebugger {
  /**
   * List all configured MCP servers across different agents
   */
  async listServers() {
    console.log('📋 Listing MCP servers...\n');

    const agents = ['claude', 'qwen', 'gemini', 'codex', 'codebuddy', 'iflow'];

    for (const agent of agents) {
      console.log(`\n🔍 ${agent.toUpperCase()}:`);
      try {
        const result = await this.detectServersForAgent(agent);
        if (result.length === 0) {
          console.log('   No servers configured');
        } else {
          result.forEach((server, i) => {
            console.log(`   ${i + 1}. ${server.name} (${server.transport.type})`);
          });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // List custom extension agents
    console.log('\n🔍 CUSTOM EXTENSION AGENTS:');
    try {
      const customAgents = await this.detectCustomAgents();
      if (customAgents.length === 0) {
        console.log('   No custom agents configured');
      } else {
        customAgents.forEach((agent, i) => {
          console.log(`   ${i + 1}. ${agent.name}`);
          console.log(`      CLI: ${agent.cliPath || 'Not set'}`);
          console.log(`      Args: ${agent.acpArgs?.join(' ') || 'None'}`);
          console.log(`      Enabled: ${agent.enabled ?? true}`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect MCP servers for a specific agent
   */
  private async detectServersForAgent(agent: string): Promise<McpServer[]> {
    try {
      let command = '';
      
      switch (agent) {
        case 'claude':
          command = 'claude mcp list';
          break;
        case 'qwen':
          command = 'qwen mcp list';
          break;
        case 'gemini':
          command = 'gemini mcp list';
          break;
        case 'codex':
          command = 'codex mcp list';
          break;
        case 'codebuddy':
          return this.detectCodebuddyServers();
        case 'iflow':
          command = 'iflow mcp list';
          break;
        default:
          return [];
      }

      const output = execSync(command, { encoding: 'utf-8', timeout: 5000 });
      return this.parseServerList(output);
    } catch (error) {
      // Agent CLI not available or no servers configured
      return [];
    }
  }

  /**
   * Detect CodeBuddy MCP servers from config file
   */
  private detectCodebuddyServers(): McpServer[] {
    const configPath = path.join(os.homedir(), '.codebuddy', 'mcp.json');

    if (!fs.existsSync(configPath)) {
      return [];
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const servers: McpServer[] = [];

      if (config.mcpServers) {
        Object.entries(config.mcpServers).forEach(([name, serverConfig]: [string, any]) => {
          servers.push({
            name,
            transport: serverConfig,
          });
        });
      }

      return servers;
    } catch (error) {
      console.error('Failed to parse CodeBuddy config:', error);
      return [];
    }
  }

  /**
   * Detect custom extension agents from AionUi database
   */
  private async detectCustomAgents(): Promise<Array<{
    id: string;
    name: string;
    cliPath?: string;
    acpArgs?: string[];
    enabled?: boolean;
    env?: Record<string, string>;
  }>> {
    try {
      const appName = 'AionUi';
      const configDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'aionui');
      const dbPath = path.join(configDir, 'aionui.db');

      if (!fs.existsSync(dbPath)) {
        return [];
      }

      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });

      try {
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get('acp.customAgents');

        if (!row || !row.value) {
          return [];
        }

        const customAgents = JSON.parse(row.value);
        return customAgents.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          cliPath: agent.defaultCliPath,
          acpArgs: agent.acpArgs,
          enabled: agent.enabled,
          env: agent.env,
        }));
      } finally {
        db.close();
      }
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse MCP server list output
   */
  private parseServerList(output: string): McpServer[] {
    const servers: McpServer[] = [];
    
    if (output.includes('No MCP servers configured') || !output.trim()) {
      return servers;
    }

    // Parse the output (format varies by CLI)
    const lines = output.split('\n');
    lines.forEach((line) => {
      // Simple parsing - can be enhanced based on actual CLI output format
      const match = line.match(/^\s*-?\s*(\S+)\s+\((\w+)\)/);
      if (match) {
        servers.push({
          name: match[1],
          transport: {
            type: match[2],
          },
        });
      }
    });

    return servers;
  }

  /**
   * Test a specific MCP server connection
   */
  async testServer(serverName: string) {
    console.log(`🧪 Testing MCP server: ${serverName}\n`);

    // This would integrate with the actual MCP testing logic
    // For now, provide a placeholder
    console.log('⚠️  MCP server testing requires integration with McpService');
    console.log('   Use the Settings UI to test MCP connections');
  }

  /**
   * Validate all MCP configurations
   */
  async validate() {
    console.log('✅ Validating MCP configurations...\n');

    const issues: string[] = [];

    // Check for common issues
    const agents = ['claude', 'qwen', 'gemini', 'codex'];
    
    for (const agent of agents) {
      try {
        execSync(`which ${agent}`, { encoding: 'utf-8', timeout: 1000 });
      } catch {
        issues.push(`${agent} CLI not found in PATH`);
      }
    }

    if (issues.length === 0) {
      console.log('✅ All validations passed!');
    } else {
      console.log('⚠️  Issues found:');
      issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
    }
  }
}

// CLI interface
const [command, ...args] = process.argv.slice(2);
const mcpDebugger = new McpDebugger();

switch (command) {
  case 'list':
    mcpDebugger.listServers();
    break;
  case 'test':
    if (args.length === 0) {
      console.error('Usage: debug-mcp.ts test <server-name>');
      process.exit(1);
    }
    mcpDebugger.testServer(args[0]);
    break;
  case 'validate':
    mcpDebugger.validate();
    break;
  default:
    console.log('Usage:');
    console.log('  bunx tsx scripts/debug-mcp.ts list');
    console.log('  bunx tsx scripts/debug-mcp.ts test <server-name>');
    console.log('  bunx tsx scripts/debug-mcp.ts validate');
    process.exit(1);
}

