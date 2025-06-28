import * as vscode from "vscode";
import * as ts from "typescript";

/**
 * 使用TypeScript编译器API获取AST
 * @param document 文本文档对象
 * @returns AST源文件对象
 */
export function getAst(document: vscode.TextDocument): ts.SourceFile | null {
  const filePath = document.uri.fsPath;
  const sourceText = document.getText();

  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
}

/**
 * 收集TypeScript变量使用信息
 * @param ast TypeScript源文件AST对象
 * @returns 变量使用数据
 */
export function collectVariableUsage(ast: ts.SourceFile) {
  const variableData: Record<string, { declaredAt: number; usedAt: number[] }> = {};

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      const varName = node.name.getText();
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

      if (!variableData[varName]) {
        variableData[varName] = {
          declaredAt: line,
          usedAt: [line]
        };
      }
    }

    if (ts.isParameter(node)) {
      if (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) {
        ts.forEachChild(node.name, element => {
          if (ts.isBindingElement(element)) {
            const elemName = element.name.getText();
            const line = ast.getLineAndCharacterOfPosition(element.getStart()).line;

            if (!variableData[elemName]) {
              variableData[elemName] = {
                declaredAt: line,
                usedAt: [line]
              };
            }
          }
        });
      } else {
        const paramName = node.name.getText();
        const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

        if (!variableData[paramName]) {
          variableData[paramName] = {
            declaredAt: line,
            usedAt: [line]
          };
        }
      }
    }

    if (ts.isIdentifier(node)) {
      const varName = node.getText();
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

      if (variableData[varName] && variableData[varName].declaredAt < line) {
        variableData[varName].usedAt.push(line);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(ast);
  return variableData;
}

/**
 * 获取TypeScript指定行的作用域范围
 * @param ast TypeScript源文件AST对象
 * @param targetLine 目标行号
 * @returns 作用域范围
 */
export function getScopeRangeForLine(ast: ts.SourceFile, targetLine: number): { startLine: number; endLine: number } | null {
  function visit(node: ts.Node, parentScope: ts.Node | null = null): boolean {
    const startLine = ast.getLineAndCharacterOfPosition(node.getStart()).line;
    const endLine = ast.getLineAndCharacterOfPosition(node.getEnd()).line;

    if (startLine <= targetLine && endLine >= targetLine) {
      if (ts.isFunctionDeclaration(node) ||
        ts.isBlock(node) ||
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isClassDeclaration(node)) {
        parentScope = node;
      }

      let foundInChildren = false;
      ts.forEachChild(node, child => {
        if (visit(child, parentScope)) {
          foundInChildren = true;
          return true;
        }
      });

      if (!foundInChildren && parentScope) {
        const scopeStart = ast.getLineAndCharacterOfPosition(parentScope.getStart()).line;
        const scopeEnd = ast.getLineAndCharacterOfPosition(parentScope.getEnd()).line;
        result = { startLine: scopeStart, endLine: scopeEnd };
      }

      return true;
    }
    return false;
  }

  let result: { startLine: number; endLine: number } | null = null;
  visit(ast);
  return result;
}