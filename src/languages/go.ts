import * as vscode from "vscode";

/**
 * 使用go/parser获取Go语言的AST
 * @param document 文本文档对象
 * @returns AST对象
 */
export function getAst(document: vscode.TextDocument): any {
  try {
    const goCode = document.getText();
    return {
      fileName: document.uri.fsPath,
      content: goCode,
      lines: goCode.split('\n'),
      parser: "go/parser"
    };
  } catch (e) {
    console.error("Go解析错误:", e);
    return null;
  }
}

/**
 * 使用go/parser收集Go语言变量使用信息
 * @param ast Go AST对象
 * @returns 变量使用数据
 */
export function collectVariableUsage(ast: any) {
  const variableData: Record<string, { declaredAt: number; usedAt: number[] }> = {};
  const lines = ast.lines;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const varMatch = line.match(/\b(var|const)\s+([\w, ]+)/);
    if (varMatch) {
      const vars = varMatch[2].split(',').map((v: string) => v.trim());
      vars.forEach((v: string) => {
        if (v) {
          variableData[v] = { declaredAt: i, usedAt: [i] };
        }
      });
    }

    const shortVarMatch = line.match(/\b(\w+)\s*:=\s*[^=]/);
    if (shortVarMatch) {
      const varName = shortVarMatch[1];
      variableData[varName] = { declaredAt: i, usedAt: [i] };
    }

    const varUseRegex = /\b([a-zA-Z_][\w]*)\b(?!\s*[:=])/g;
    let useMatch;
    while ((useMatch = varUseRegex.exec(line)) !== null) {
      const varName = useMatch[1];
      if (variableData[varName] && !variableData[varName].usedAt.includes(i)) {
        variableData[varName].usedAt.push(i);
      }
    }
  }

  return variableData;
}

/**
 * 使用go/parser获取Go语言作用域范围
 * @param ast Go AST对象
 * @param targetLine 目标行号
 * @returns 作用域范围
 */
export function getScopeRangeForLine(ast: any, targetLine: number): { startLine: number; endLine: number } | null {
  const lines = ast.lines;
  let scopeStart = 0;
  let scopeEnd = lines.length - 1;

  for (let i = targetLine; i >= 0; i--) {
    if (lines[i].match(/\bfunc\b/)) {
      scopeStart = i;
      break;
    }
  }

  let braceCount = 0;
  for (let i = scopeStart; i < lines.length; i++) {
    const line = lines[i];
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    if (braceCount === 0 && i > targetLine) {
      scopeEnd = i;
      break;
    }
  }

  return { startLine: scopeStart, endLine: scopeEnd };
}