#!/usr/bin/env node
/**
 * CLI 入口點
 */
import { AgentIdeCLI } from './cli.js';
// 啟動 CLI
async function main() {
    const cli = new AgentIdeCLI();
    try {
        await cli.run(process.argv);
    }
    catch (error) {
        console.error('CLI 執行失敗:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
// 只在直接執行時啟動 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
export { AgentIdeCLI };
//# sourceMappingURL=index.js.map