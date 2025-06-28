import * as vscode from "vscode";
import * as tsParser from "./languages/typescript";
import * as goParser from "./languages/go";

/**
 * 变量装饰器 - 负责在空白行显示后续使用的变量提示
 */

// 创建变量提示装饰器类型
export const variableHintDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    contentText: "",
    color: "#444444",
    fontWeight: "100",
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
/**
 * 更新变量提示装饰器
 * @param editor 文本编辑器对象
 */
export function updateVariableDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor) { return; }

  const document = editor.document;
  const decorations: vscode.DecorationOptions[] = [];

  // 支持的语言列表
  const supportedLanguages = ['javascript', 'typescript', 'go'];
  if (!supportedLanguages.includes(document.languageId)) {
    editor.setDecorations(variableHintDecorationType, []);
    return;
  }


  try {
    let variableData: Record<string, { declaredAt: number; usedAt: number[] }> = {};
    let ast: any = null;

    if (document.languageId === 'go') {
      ast = goParser.getAst(document);
      if (!ast) { return; }
      variableData = goParser.collectVariableUsage(ast);
    } else {
      ast = tsParser.getAst(document);
      if (!ast) { return; }
      variableData = tsParser.collectVariableUsage(ast);
    }

    console.log("variableData", variableData);

    // 分析空白行
    for (let line = 0; line < document.lineCount - 1; line++) {
      const textLine = document.lineAt(line);
      const nextTextLine = document.lineAt(line + 1);
      if (textLine.isEmptyOrWhitespace && !nextTextLine.isEmptyOrWhitespace) {
        const variablesToShow: string[] = [];

        // const indentChars = nextTextLine.firstNonWhitespaceCharacterIndex;
        const tabSize = editor.options.tabSize as number || 4;
        const lineText = nextTextLine.text;
        let indent = 0;

        for (let i = 0; i < lineText.length; i++) {
          const char = lineText[i];
          if (char === ' ') { indent += 1; }
          else if (char === '\t') { indent += tabSize; }
          else { break; }
        }

        let scopeRange: { startLine: number; endLine: number } | null = null;

        if (document.languageId === 'go') {
          scopeRange = goParser.getScopeRangeForLine(ast, line);
        } else {
          scopeRange = tsParser.getScopeRangeForLine(ast, line);
        }

        if (scopeRange === null) { continue; }

        for (const varName in variableData) {
          const varInfo = variableData[varName];
          // 检查变量是否在当前行之后被使用
          if (varInfo.usedAt.some(useLine => useLine >= scopeRange!.startLine && useLine <= line) &&
            varInfo.usedAt.some(useLine => useLine > line && useLine <= scopeRange!.endLine)) {
            variablesToShow.push(varName);
          }
        }

        if (variablesToShow.length > 0) {
          const range = new vscode.Range(
            new vscode.Position(line, 0),
            new vscode.Position(line, 0)
          );
          decorations.push({
            range,
            renderOptions: {
              after: {
                contentText: `-${variablesToShow.length} ↓ ${variablesToShow.join(', ')} -`,
                margin: `0px 0px 0px ${indent}ch`,
              }
            }
          });
        }
      }
    }
  } catch (e) {
    console.error("解析错误:", e);
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

