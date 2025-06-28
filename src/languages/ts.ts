import * as vscode from "vscode";
import ts from "typescript";
import { VariableUsage } from "./type";


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
  const variableData: VariableUsage[] = [];

  // 作用域栈管理
  const scopeStack: ts.Node[] = [ast];

  // 改为使用作用域变量映射栈
  const scopeVarsStack: Map<string, VariableUsage>[] = [new Map()];

  const visit = (node: ts.Node) => {
    // 进入新作用域
    if (ts.isBlock(node) || ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      scopeStack.push(node);
      // 创建新的作用域变量映射并压入栈
      scopeVarsStack.push(new Map());
    }

    // 获取当前作用域的变量映射
    const currentScopeVars = scopeVarsStack[scopeVarsStack.length - 1];

    // 变量声明处理
    if (ts.isVariableDeclaration(node)) {
      const varName = node.name.getText();
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

      // 只处理当前作用域未声明的变量
      if (!currentScopeVars.has(varName)) {
        const varUsage: VariableUsage = {
          name: varName,
          declaredAt: line,
          usedAt: [line] // 声明行不计入使用
        };

        variableData.push(varUsage);
        currentScopeVars.set(varName, varUsage);
      }
    }

    // 参数声明处理
    if (ts.isParameter(node)) {
      // 处理解构参数
      if (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) {
        ts.forEachChild(node.name, element => {
          if (ts.isBindingElement(element)) {
            const elemName = element.name.getText();
            const line = ast.getLineAndCharacterOfPosition(element.getStart()).line;

            if (!currentScopeVars.has(elemName)) {
              const varUsage: VariableUsage = {
                name: elemName,
                declaredAt: line,
                usedAt: [line]
              };

              variableData.push(varUsage);
              currentScopeVars.set(elemName, varUsage);
            }
          }
        });
      }
      // 处理普通参数
      else {
        const paramName = node.name.getText();
        const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

        if (!currentScopeVars.has(paramName)) {
          const varUsage: VariableUsage = {
            name: paramName,
            declaredAt: line,
            usedAt: [line]
          };

          variableData.push(varUsage);
          currentScopeVars.set(paramName, varUsage);
        }
      }
    }

    // 变量使用处理
    if (ts.isIdentifier(node) && !isDeclarationContext(node)) {
      const varName = node.getText();
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

      // 从当前作用域向父作用域链查找变量
      for (let i = scopeVarsStack.length - 1; i >= 0; i--) {
        const scopeVars = scopeVarsStack[i];
        const varUsage = scopeVars.get(varName);

        if (varUsage &&
          varUsage.declaredAt < line &&
          !varUsage.usedAt.includes(line)) {
          varUsage.usedAt.push(line);
          break; // 找到后停止查找
        }
      }
    }

    ts.forEachChild(node, visit);

    // 退出作用域
    if (ts.isBlock(node) || ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      scopeStack.pop();
      scopeVarsStack.pop(); // 弹出当前作用域的变量映射
    }
  };

  // 辅助函数：检查是否在声明位置
  const isDeclarationContext = (node: ts.Node): boolean => {
    return ts.isVariableDeclaration(node.parent) ||
      ts.isParameter(node.parent) ||
      ts.isBindingElement(node.parent);
  };

  visit(ast);
  return variableData;
}

export function getScopeRangeForLine(ast: ts.SourceFile, targetLine: number): { startLine: number; endLine: number } | null {
  let functionScope: ts.Node | null = null;
  let blockScope: ts.Node | null = null;

  const visit = (node: ts.Node) => {
    if (!node) {return;}

    const startLine = ast.getLineAndCharacterOfPosition(node.getStart()).line;
    const endLine = ast.getLineAndCharacterOfPosition(node.getEnd()).line;

    // 检查节点是否包含目标行
    if (startLine <= targetLine && endLine >= targetLine) {
      // 优先处理函数节点
      if (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) {
        // 记录最内层的函数节点
        functionScope = node;
      }
      // 如果没有函数节点，再处理其他作用域类型
      else if (!functionScope && (
        ts.isBlock(node) ||
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isClassDeclaration(node))) {
        blockScope = node;
      }
    }

    // 递归遍历子节点
    ts.forEachChild(node, visit);
  };

  visit(ast);

  // 优先返回函数范围
  if (functionScope) {
    const startLine = ast.getLineAndCharacterOfPosition((functionScope as ts.Node).getStart()).line;
    const endLine = ast.getLineAndCharacterOfPosition((functionScope as ts.Node).getEnd()).line;
    return { startLine, endLine };
  }

  // 其次返回块级作用域
  if (blockScope) {
    const startLine = ast.getLineAndCharacterOfPosition((blockScope as ts.Node).getStart()).line;
    const endLine = ast.getLineAndCharacterOfPosition((blockScope as ts.Node).getEnd()).line;
    return { startLine, endLine };
  }

  console.log("getScopeRangeForLine: no scope found for line", targetLine);
  return null;
}