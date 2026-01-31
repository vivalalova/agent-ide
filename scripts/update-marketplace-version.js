#!/usr/bin/env node
/**
 * 更新 marketplace.json 中的版本號
 * 由 semantic-release prepareCmd 呼叫
 * 用法: node scripts/update-marketplace-version.js <version>
 */
import { readFileSync, writeFileSync } from 'fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/update-marketplace-version.js <version>');
  process.exit(1);
}

const filePath = '.claude-plugin/marketplace.json';
const manifest = JSON.parse(readFileSync(filePath, 'utf-8'));
manifest.plugins[0].version = version;
writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Updated ${filePath} to version ${version}`);
