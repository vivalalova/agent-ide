/**
 * Analyze 命令處理器
 * 處理程式碼品質分析相關的命令操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import * as FileUtils from '../utils/file-utils.js';

/**
 * 處理分析命令
 */
export async function handleAnalyzeCommand(type: string | undefined, options: any): Promise<void> {
  const analyzeType = type || 'complexity';

  if (options.format !== 'json') {
    console.log('📊 分析程式碼品質...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    // 根據分析類型執行對應分析
    if (analyzeType === 'complexity') {
      // 使用 ParserPlugin 分析複雜度
      const registry = ParserRegistry.getInstance();
      const files = await FileUtils.getAllProjectFiles(analyzePath);
      const results: Array<{ file: string; complexity: any }> = [];

      for (const file of files) {
        try {
          const parser = registry.getParser(path.extname(file));
          if (!parser) {continue;}

          const content = await fs.readFile(file, 'utf-8');
          const ast = await parser.parse(content, file);
          const complexity = await parser.analyzeComplexity(content, ast);

          results.push({ file, complexity });
        } catch {
          // 忽略無法分析的檔案
        }
      }

      // 過濾高複雜度檔案（evaluation === 'high' 或 complexity > 10）
      const highComplexityFiles = results.filter(r =>
        r.complexity.evaluation === 'high' || r.complexity.cyclomaticComplexity > 10
      );

      // 計算統計資訊
      const complexities = results.map(r => r.complexity.cyclomaticComplexity);
      const averageComplexity = complexities.length > 0
        ? complexities.reduce((sum, c) => sum + c, 0) / complexities.length
        : 0;
      const maxComplexity = complexities.length > 0
        ? Math.max(...complexities)
        : 0;

      if (options.format === 'json') {
        const outputData: any = {
          summary: {
            totalScanned: results.length,
            issuesFound: highComplexityFiles.length,
            averageComplexity,
            maxComplexity
          },
          issues: highComplexityFiles.map(r => ({
            path: r.file,
            complexity: r.complexity.cyclomaticComplexity,
            cognitiveComplexity: r.complexity.cognitiveComplexity,
            evaluation: r.complexity.evaluation
          }))
        };

        if (options.all) {
          outputData.all = results.map(r => ({
            path: r.file,
            complexity: r.complexity.cyclomaticComplexity,
            cognitiveComplexity: r.complexity.cognitiveComplexity,
            evaluation: r.complexity.evaluation
          }));
        }

        console.log(JSON.stringify(outputData, null, 2));
      } else {
        console.log('✅ 複雜度分析完成!');
        console.log(`📊 統計: ${results.length} 個檔案，${highComplexityFiles.length} 個高複雜度檔案`);
        console.log(`   平均複雜度: ${averageComplexity.toFixed(2)}`);
        console.log(`   最高複雜度: ${maxComplexity}`);
        if (!options.all && highComplexityFiles.length > 0) {
          console.log('\n⚠️  高複雜度檔案:');
          highComplexityFiles.forEach(r => {
            console.log(`   - ${r.file}: ${r.complexity.cyclomaticComplexity}`);
          });
        }
      }
    } else if (analyzeType === 'dead-code') {
      // 使用 ParserPlugin 檢測死代碼
      const registry = ParserRegistry.getInstance();

      const files = await FileUtils.getAllProjectFiles(analyzePath);
      const results: Array<{ file: string; deadCode: any[] }> = [];

      for (const file of files) {
        try {
          const parser = registry.getParser(path.extname(file));
          if (!parser) {continue;}

          const content = await fs.readFile(file, 'utf-8');
          const ast = await parser.parse(content, file);
          const symbols = await parser.extractSymbols(ast);
          const deadCode = await parser.detectUnusedSymbols(ast, symbols);

          results.push({ file, deadCode });
        } catch {
          // 忽略無法分析的檔案
        }
      }

      // 過濾有 dead code 的檔案
      const filesWithDeadCode = results.filter(r => r.deadCode.length > 0);

      // 統計結果
      const allDeadCode = results.flatMap(r => r.deadCode);
      const deadFunctions = allDeadCode.filter(d => d.type === 'function');
      const deadVariables = allDeadCode.filter(d => d.type === 'variable');

      if (options.format === 'json') {
        const outputData: any = {
          summary: {
            totalScanned: results.length,
            filesWithIssues: filesWithDeadCode.length,
            totalDeadFunctions: deadFunctions.length,
            totalDeadVariables: deadVariables.length,
            totalDeadCode: allDeadCode.length
          },
          issues: filesWithDeadCode.map(r => ({
            path: r.file,
            deadCode: r.deadCode
          }))
        };

        if (options.all) {
          outputData.all = results.map(r => ({
            path: r.file,
            deadCode: r.deadCode
          }));
        }

        outputData.deadFunctions = deadFunctions;
        outputData.deadVariables = deadVariables;

        console.log(JSON.stringify(outputData, null, 2));
      } else {
        console.log('✅ 死代碼檢測完成!');
        console.log(`📊 統計: ${results.length} 個檔案，${filesWithDeadCode.length} 個有死代碼`);
        console.log('📊 發現:');
        console.log(`   未使用函式: ${deadFunctions.length} 個`);
        console.log(`   未使用變數: ${deadVariables.length} 個`);
        if (!options.all && filesWithDeadCode.length > 0) {
          console.log('\n⚠️  有死代碼的檔案:');
          filesWithDeadCode.forEach(r => {
            console.log(`   - ${r.file}: ${r.deadCode.length} 項`);
          });
        }
      }
    } else if (analyzeType === 'best-practices') {
      // 檢查最佳實踐
      const files = await FileUtils.getAllProjectFiles(analyzePath);
      const issues: any[] = [];
      const recommendations: any[] = [];

      // 檢查 ES Module 使用情況
      const hasEsmImports = files.some(async (file) => {
        const content = await fs.readFile(file, 'utf-8');
        return content.includes('import ') && content.includes('from ');
      });

      if (hasEsmImports) {
        recommendations.push({
          type: 'es-modules',
          status: 'good',
          message: '專案使用 ES Module'
        });
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({
          issues,
          recommendations
        }, null, 2));
      } else {
        console.log('✅ 最佳實踐檢查完成!');
        console.log(`📊 建議數: ${recommendations.length}`);
      }
    } else if (analyzeType === 'patterns') {
      // 檢測程式碼模式
      const files = await FileUtils.getAllProjectFiles(analyzePath);
      const patterns: string[] = [];
      let asyncFunctionCount = 0;

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');

        // 檢測 async 函式
        if (content.includes('async ')) {
          asyncFunctionCount++;
          if (!patterns.includes('async-functions')) {
            patterns.push('async-functions');
          }
        }

        // 檢測 Promise 使用
        if (content.includes('Promise') || content.includes('.then(')) {
          if (!patterns.includes('promise-usage')) {
            patterns.push('promise-usage');
          }
        }

        // TypeScript 特定模式
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          // 檢測 interface 使用
          if (content.includes('interface ') && !patterns.includes('interface-usage')) {
            patterns.push('interface-usage');
          }

          // 檢測泛型類型
          if (content.match(/<[A-Z]\w*(\s*extends\s+\w+)?>/g) && !patterns.includes('generic-types')) {
            patterns.push('generic-types');
          }

          // 檢測 enum 使用
          if (content.includes('enum ') && !patterns.includes('enum-usage')) {
            patterns.push('enum-usage');
          }
        }
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({
          patterns,
          statistics: {
            asyncFunctions: asyncFunctionCount
          }
        }, null, 2));
      } else {
        console.log('✅ 模式檢測完成!');
        console.log(`📊 發現模式: ${patterns.join(', ')}`);
      }
    } else if (analyzeType === 'quality') {
      // 品質分析（整合多個維度）
      const registry = ParserRegistry.getInstance();
      const files = await FileUtils.getAllProjectFiles(analyzePath);

      // 檢查路徑是否存在或沒有找到檔案
      if (files.length === 0) {
        const pathExists = await FileUtils.fileExists(analyzePath);
        if (!pathExists) {
          throw new Error(`路徑不存在: ${analyzePath}`);
        }
        throw new Error(`在路徑 ${analyzePath} 中找不到支援的檔案`);
      }

      // 統計資料
      const summary = {
        totalScanned: files.length,
        totalIssues: 0,
        qualityScore: 0
      };

      // 各維度問題列表
      const allIssues: any[] = [];
      const recommendations: string[] = [];

      // 各維度分數（權重參考 ShitScore QA 維度）
      let typeSafetyScore = 100;
      let errorHandlingScore = 100;
      let securityScore = 100;
      let namingScore = 100;
      let testCoverageScore = 0;

      let testFileCount = 0;

      for (const file of files) {
        try {
          const parser = registry.getParser(path.extname(file));
          if (!parser) {continue;}

          const content = await fs.readFile(file, 'utf-8');
          const ast = await parser.parse(content, file);

          // 判斷是否為測試檔案
          if (parser.isTestFile && parser.isTestFile(file)) {
            testFileCount++;
            continue; // 跳過測試檔案
          }

          // 1. 型別安全檢測
          if (parser.checkTypeSafety) {
            const typeSafetyIssues = await parser.checkTypeSafety(content, ast);
            typeSafetyIssues.forEach((issue) => {
              allIssues.push({
                type: 'type-safety',
                severity: issue.severity === 'error' ? 'high' : 'medium',
                message: issue.message,
                filePath: issue.location.filePath,
                line: issue.location.line
              });
              typeSafetyScore -= issue.severity === 'error' ? 10 : 5;
            });
          }

          // 2. 錯誤處理檢測
          if (parser.checkErrorHandling) {
            const errorHandlingIssues = await parser.checkErrorHandling(content, ast);
            errorHandlingIssues.forEach((issue) => {
              allIssues.push({
                type: 'error-handling',
                severity: issue.severity === 'error' ? 'high' : 'medium',
                message: issue.message,
                filePath: issue.location.filePath,
                line: issue.location.line
              });
              errorHandlingScore -= issue.severity === 'error' ? 10 : 5;
            });
          }

          // 3. 安全性檢測
          if (parser.checkSecurity) {
            const securityIssues = await parser.checkSecurity(content, ast);
            securityIssues.forEach((issue) => {
              allIssues.push({
                type: 'security',
                severity: issue.severity === 'critical' ? 'high' : 'medium',
                message: issue.message,
                filePath: issue.location.filePath,
                line: issue.location.line
              });
              securityScore -= issue.severity === 'critical' ? 15 : 10;
            });
          }

          // 4. 命名規範檢測
          if (parser.checkNamingConventions) {
            const symbols = await parser.extractSymbols(ast);
            const namingIssues = await parser.checkNamingConventions(symbols, file);
            namingIssues.forEach((issue) => {
              allIssues.push({
                type: 'naming',
                severity: 'low',
                message: issue.message,
                filePath: issue.location.filePath,
                line: issue.location.line
              });
              namingScore -= 3;
            });
          }
        } catch {
          // 忽略無法分析的檔案
        }
      }

      // 5. 測試覆蓋率評估
      const testFileRatio = files.length > 0 ? testFileCount / files.length : 0;
      testCoverageScore = Math.min(100, testFileRatio * 200); // 50% 測試覆蓋率 = 100 分

      // 確保分數不低於 0
      typeSafetyScore = Math.max(0, typeSafetyScore);
      errorHandlingScore = Math.max(0, errorHandlingScore);
      securityScore = Math.max(0, securityScore);
      namingScore = Math.max(0, namingScore);

      // 計算整體品質評分（加權平均，參考 ShitScore QA 維度權重）
      const overallScore = Math.round(
        typeSafetyScore * 0.30 +      // Type Safety 30%
        testCoverageScore * 0.25 +    // Test Coverage 25%
        errorHandlingScore * 0.20 +   // Error Handling 20%
        namingScore * 0.15 +          // Naming 15%
        securityScore * 0.10          // Security 10%
      );

      summary.totalIssues = allIssues.length;
      summary.qualityScore = overallScore;

      // 產生改善建議
      if (typeSafetyScore < 80) {
        recommendations.push('型別安全：建議使用可選綁定（if let, guard let）代替強制解包');
      }
      if (errorHandlingScore < 80) {
        recommendations.push('錯誤處理：建議使用 do-catch 明確處理錯誤，避免空 catch 區塊');
      }
      if (securityScore < 80) {
        recommendations.push('安全性：建議使用 Keychain 或環境變數儲存敏感資訊');
      }
      if (namingScore < 80) {
        recommendations.push('命名規範：建議遵循 Swift API Design Guidelines 命名規範');
      }
      if (testCoverageScore < 50) {
        recommendations.push('測試覆蓋率：建議提升測試覆蓋率至 50% 以上');
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({
          summary,
          issues: allIssues,
          complexity: {
            score: 100 // 預留位置（可選擇整合複雜度分析）
          },
          maintainability: {
            score: 100 // 預留位置（可選擇整合維護性分析）
          },
          typeSafety: {
            score: typeSafetyScore,
            issues: allIssues.filter((i) => i.type === 'type-safety')
          },
          errorHandling: {
            score: errorHandlingScore,
            issues: allIssues.filter((i) => i.type === 'error-handling')
          },
          security: {
            score: securityScore,
            issues: allIssues.filter((i) => i.type === 'security')
          },
          namingConventions: {
            score: namingScore,
            issues: allIssues.filter((i) => i.type === 'naming')
          },
          testCoverage: {
            score: testCoverageScore,
            testFileRatio,
            testFiles: testFileCount,
            totalFiles: files.length
          },
          overallScore,
          recommendations
        }, null, 2));
      } else {
        console.log('✅ 品質分析完成!');
        console.log(`📊 整體評分: ${overallScore}/100`);
        console.log(`   總問題數: ${summary.totalIssues}`);
        console.log('\n維度評分:');
        console.log(`   型別安全:     ${typeSafetyScore.toFixed(1)}/100`);
        console.log(`   錯誤處理:     ${errorHandlingScore.toFixed(1)}/100`);
        console.log(`   安全性:       ${securityScore.toFixed(1)}/100`);
        console.log(`   命名規範:     ${namingScore.toFixed(1)}/100`);
        console.log(`   測試覆蓋率:   ${testCoverageScore.toFixed(1)}/100 (${(testFileRatio * 100).toFixed(1)}%)`);

        if (recommendations.length > 0) {
          console.log('\n改善建議:');
          recommendations.forEach((rec, index) => {
            console.log(`   ${index + 1}. ${rec}`);
          });
        }
      }
    } else {
      throw new Error(`不支援的分析類型: ${analyzeType}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.error(JSON.stringify({ error: errorMessage }));
    } else {
      console.error('❌ 分析失敗:', errorMessage);
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}
