import * as path from 'path';
import {
  ParserRegistry,
  getParserCapabilities,
  type ParserPlugin
} from '@infrastructure/parser/index.js';
import {
  isJavaScriptSourceExtension,
  isTypeScriptSourceExtension
} from '@shared/types/index.js';
import type { ParserCapabilities } from '@infrastructure/parser/types.js';

export enum ParserCapabilityName {
  ChangeSignature = 'change-signature',
  CallHierarchy = 'call-hierarchy',
  MoveMember = 'move-member'
}

const capabilityFieldByName: Record<ParserCapabilityName, keyof ParserCapabilities> = {
  [ParserCapabilityName.ChangeSignature]: 'supportsChangeSignature',
  [ParserCapabilityName.CallHierarchy]: 'supportsCallHierarchy',
  [ParserCapabilityName.MoveMember]: 'supportsMoveMember'
};

export function getUnsupportedParserCapabilityMessage(
  filePath: string,
  registry: ParserRegistry,
  capability: ParserCapabilityName
): string | undefined {
  const extension = path.extname(filePath);
  if (isTypeScriptSourceExtension(extension) || isJavaScriptSourceExtension(extension)) {
    return undefined;
  }

  const parser = registry.getParser(extension);
  if (!parser) {
    return `不支援 ${capability} 的檔案類型: ${extension || '(無副檔名)'}`;
  }

  if (parserSupports(parser, capability)) {
    return undefined;
  }

  return `Parser ${parser.name} (${extension}) 未宣告支援 ${capability}`;
}

function parserSupports(parser: ParserPlugin, capability: ParserCapabilityName): boolean {
  const capabilityField = capabilityFieldByName[capability];
  return getParserCapabilities(parser)[capabilityField] === true;
}
