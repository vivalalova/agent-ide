#!/usr/bin/env node

/**
 * Agent IDE CLI 入口點
 */

import { AgentIdeCLI } from '../dist/interfaces/cli/index.js';

async function main() {
  try {
    const cli = new AgentIdeCLI();
    await cli.run();
  } catch (error) {
    console.error('CLI 執行失敗:', error.message);
    process.exit(1);
  }
}

main();