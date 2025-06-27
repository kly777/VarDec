import * as vscode from "vscode";
import * as ts from "typescript";
import { get } from "http";

/**
 * 变量装饰器 - 负责在空白行显示后续使用的变量提示
 */

// 创建变量提示装饰器类型
export const variableHintDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    contentText: "",
    color: "#444444",
    fontWeight: "normal",
    fontStyle: "italic",
    margin: "0px 0px 0px 0px",

  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

let updateTimeout: NodeJS.Timeout | null = null;

/**
 * 使用TypeScript编译器API获取AST
 * @param document 文本文档对象
 * @returns AST源文件对象
 */
function getAst(document: vscode.TextDocument): ts.SourceFile | null {
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
 * 收集变量使用信息，分析AST中变量声明位置及后续使用位置
 * @param ast TypeScript源文件AST对象
 * @returns 记录变量使用情况的对象，结构为：
 *          key: 变量名
 *          value: { declaredAt: 声明行号, usedAfter: [后续使用行号数组] }
 */
function collectVariableUsage(ast: ts.SourceFile) {
  const variableData: Record<string, { declaredAt: number; usedAt: number[] }> = {};

  /**
   * AST遍历函数，处理变量声明和使用节点
   * @param node 当前遍历的AST节点
   */
  const visit = (node: ts.Node) => {
    /**
     * 处理变量声明节点：
     * 1. 提取变量名
     * 2. 获取声明所在行号
     * 3. 在variableData中初始化该变量的记录
     */
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


    /**
     * 处理变量使用节点：
     * 1. 过滤出顶层变量标识符（排除属性访问和对象属性简写）
     * 2. 记录在声明之后的使用位置
     */
    if (ts.isIdentifier(node)
      // &&
      // !ts.isPropertyAccessExpression(node.parent) &&
      // !ts.isShorthandPropertyAssignment(node.parent)
    ) {

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
 * 更新变量提示装饰器
 * @param editor 文本编辑器对象
 */
export function updateVariableDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor) { return; }

  const document = editor.document;
  const decorations: vscode.DecorationOptions[] = [];

  // 只处理JavaScript和TypeScript文件
  if (!['javascript', 'typescript'].includes(document.languageId)) {
    editor.setDecorations(variableHintDecorationType, []);
    return;
  }

  try {
    const ast = getAst(document);
    if (!ast) { return; }
    console.log("ast", ast);
    // console.log("getScopeRangeForLine", getScopeRangeForLine(ast, 64));

    const variableData = collectVariableUsage(ast);
    console.log("variableData", variableData);

    // 分析空白行
    for (let line = 0; line < document.lineCount - 1; line++) {
      const textLine = document.lineAt(line);
      const nextTextLine = document.lineAt(line + 1);
      if (textLine.isEmptyOrWhitespace && !nextTextLine.isEmptyOrWhitespace) {
        const variablesToShow: string[] = [];

        for (const varName in variableData) {
          const varInfo = variableData[varName];
          const scopeRange = getScopeRangeForLine(ast, line);
          if (scopeRange === null) { continue; }
          // 检查变量是否在当前行之后被使用
          if (varInfo.usedAt.some(useLine => useLine >= scopeRange.startLine && useLine <= line) &&
            varInfo.usedAt.some(useLine => useLine > line && useLine <= scopeRange.endLine)) {
            variablesToShow.push(varName);
          }
        }

        if (variablesToShow.length > 0) {
          const range = new vscode.Range(
            new vscode.Position(line, 0),
            new vscode.Position(line, 0)
          );
          // const indentChars = nextTextLine.range.start.character;
          // console.log("indentChars", indentChars);
          const offset = nextTextLine.text.length - nextTextLine.text.trimStart().length;
          console.log("offset", offset);
          const indent = offset >= 0 ? `${offset}ch` : "0px";
          decorations.push({
            range,
            renderOptions: {
              after: {
                contentText: `↓ ${variablesToShow.join(', ')}`,
                margin: `0px 0px 0px ${indent}`,
              }
            }
          });
        }
      }
    }
  } catch (e) {
    console.error("AST解析错误:", e);
  }

  editor.setDecorations(variableHintDecorationType, decorations);
}

/**
 * 触发装饰器更新（带防抖）
 */
export function triggerVariableUpdate(editor: vscode.TextEditor | undefined) {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(() => updateVariableDecorations(editor), 500);
}


/**
 * 获取指定行号所在作用域的行范围
 * @param ast AST源文件对象
 * @param targetLine 目标行号（从0开始）
 * @returns 包含startLine和endLine的对象，若未找到返回null
 */
function getScopeRangeForLine(ast: ts.SourceFile, targetLine: number): { startLine: number; endLine: number } | null {
  /**
   * 深度优先遍历AST节点
   * @param node 当前遍历的节点
   * @param parentScope 最近的父作用域节点
   * @returns 是否找到目标行
   */
  function visit(node: ts.Node, parentScope: ts.Node | null = null): boolean {
    // 将字符位置转换为行号
    const startLine = ast.getLineAndCharacterOfPosition(node.getStart()).line;
    const endLine = ast.getLineAndCharacterOfPosition(node.getEnd()).line;

    // 检查当前节点是否包含目标行
    if (startLine <= targetLine && endLine >= targetLine) {
      // 当遇到作用域边界节点时更新作用域
      if (ts.isFunctionDeclaration(node) ||
        ts.isBlock(node) ||
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isClassDeclaration(node)) {
        parentScope = node;
      }

      // 继续深入子节点寻找更小的作用域范围
      let foundInChildren = false;
      ts.forEachChild(node, child => {
        if (visit(child, parentScope)) {
          foundInChildren = true;
          return true; // 中断遍历
        }
      });

      // 如果子节点中没有找到，使用当前作用域
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