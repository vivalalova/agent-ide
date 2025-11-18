/**
 * ESLint 自定義規則：禁止在 constructor 中實例化依賴
 *
 * 禁止模式：
 * 1. 參數預設值：constructor(fs: FileSystem = new FileSystem())
 * 2. Body 實例化：constructor(fs?: FileSystem) { this.fs = fs ?? new FileSystem(); }
 *
 * 目的：強制依賴注入，確保所有依賴從外部注入，提高可測試性
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow instance creation in constructor (parameters and body)',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noDefaultInstance: 'Default instance creation in constructor is not allowed. Use strict dependency injection: Remove optional parameter and pass instance from outside.',
      noBodyInstance: 'Instance creation in constructor body is not allowed. Use strict dependency injection: Remove optional parameter and pass instance from outside.',
    },
    schema: [],
  },
  create(context) {
    return {
      // 檢查類別方法定義
      MethodDefinition(node) {
        // 只檢查 constructor
        if (node.kind !== 'constructor') {
          return;
        }

        // 收集 constructor 參數名稱（用於檢查 body）
        const paramNames = new Set();
        const params = node.value.params;

        // 1. 檢查參數預設值
        params.forEach(param => {
          // 提取參數名稱
          if (param.type === 'Identifier') {
            paramNames.add(param.name);
          } else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
            paramNames.add(param.left.name);
          } else if (param.type === 'TSParameterProperty') {
            const parameter = param.parameter;
            if (parameter.type === 'Identifier') {
              paramNames.add(parameter.name);
            } else if (parameter.type === 'AssignmentPattern' && parameter.left.type === 'Identifier') {
              paramNames.add(parameter.left.name);
            }
          }

          // 檢查是否為 AssignmentPattern（帶有預設值的參數）
          if (param.type === 'AssignmentPattern') {
            const right = param.right;

            // 檢查預設值是否為 NewExpression（new ClassName()）
            if (right.type === 'NewExpression') {
              context.report({
                node: right,
                messageId: 'noDefaultInstance',
              });
            }
          }

          // 處理 TypeScript 參數屬性（private/public/protected fileSystem: Type = new Class()）
          if (param.type === 'TSParameterProperty') {
            const parameter = param.parameter;
            if (parameter.type === 'AssignmentPattern') {
              const right = parameter.right;
              if (right.type === 'NewExpression') {
                context.report({
                  node: right,
                  messageId: 'noDefaultInstance',
                });
              }
            }
          }
        });

        // 2. 檢查 constructor body
        if (node.value.body && node.value.body.type === 'BlockStatement') {
          checkConstructorBody(node.value.body, paramNames, context);
        }
      },
    };
  },
};

/**
 * 檢查 constructor body 中的實例化模式
 * 偵測：fs ?? new FileSystem()、fs || new FileSystem()、fs ? fs : new FileSystem()
 */
function checkConstructorBody(body, paramNames, context) {
  // 遍歷所有語句
  body.body.forEach(statement => {
    // 檢查賦值語句和變數宣告
    if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
      checkExpression(statement.expression.right, paramNames, context);
    } else if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach(declarator => {
        if (declarator.init) {
          checkExpression(declarator.init, paramNames, context);
        }
      });
    }
  });
}

/**
 * 檢查表達式是否包含實例化模式
 */
function checkExpression(expr, paramNames, context) {
  if (!expr) return;

  // 檢查 LogicalExpression (??、||)
  if (expr.type === 'LogicalExpression' && (expr.operator === '??' || expr.operator === '||')) {
    // 檢查左側是否為 constructor 參數
    if (isParamReference(expr.left, paramNames)) {
      // 檢查右側是否為 NewExpression
      if (expr.right.type === 'NewExpression') {
        context.report({
          node: expr.right,
          messageId: 'noBodyInstance',
        });
      }
    }
  }

  // 檢查 ConditionalExpression (三元運算子)
  if (expr.type === 'ConditionalExpression') {
    // 檢查條件是否與 constructor 參數相關
    if (isParamReference(expr.test, paramNames) || isParamReference(expr.consequent, paramNames)) {
      // 檢查 alternate 是否為 NewExpression
      if (expr.alternate.type === 'NewExpression') {
        context.report({
          node: expr.alternate,
          messageId: 'noBodyInstance',
        });
      }
    }
  }
}

/**
 * 檢查表達式是否引用 constructor 參數
 */
function isParamReference(expr, paramNames) {
  if (!expr) return false;

  // 直接引用：fileSystem
  if (expr.type === 'Identifier') {
    return paramNames.has(expr.name);
  }

  // 成員存取：this.fileSystem（不算參數引用）
  if (expr.type === 'MemberExpression') {
    return false;
  }

  // 邏輯表達式：檢查左右兩側
  if (expr.type === 'LogicalExpression') {
    return isParamReference(expr.left, paramNames) || isParamReference(expr.right, paramNames);
  }

  // 一元運算子：!fileSystem
  if (expr.type === 'UnaryExpression') {
    return isParamReference(expr.argument, paramNames);
  }

  return false;
}
