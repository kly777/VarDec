import * as vscode from "vscode";
import * as tsParser from "./languages/typescript";
import * as goParser from "./languages/go";

/**
 * 变量装饰器 - 负责在空白行显示后续使用的变量提示
 */

// 创建变量提示装饰器类型
const variableHintDecorationType = vscode.window.createTextEditorDecorationType({
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

interface LanguageParser {
  getAst(document: vscode.TextDocument): any;
  collectVariableUsage(ast: any): Record<string, { declaredAt: number; usedAt: number[]; }>;
  getScopeRangeForLine(ast: any, line: number): { startLine: number; endLine: number } | null;
}


/**
 * 更新变量提示装饰器
 * @param editor 文本编辑器对象
 */
export function updateVariableDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor) { return; }

  const document = editor.document;
  const languageId = document.languageId;

  // 支持的语言列表
  const supportedLanguages = ['javascript', 'typescript', 'go'];
  if (!supportedLanguages.includes(languageId)) {
    editor.setDecorations(variableHintDecorationType, []);
    return;
  }

  try {
    const tabSize = (editor.options.tabSize as number) || 4;
    const parser: LanguageParser = languageId === 'go' ? goParser : tsParser;

    // 1. 获取AST和变量数据
    const { ast, variableData } = getAstAndVariableData(document, parser);
    if (!ast) {
      editor.setDecorations(variableHintDecorationType, []);
      return;
    }

    console.log("variableData", variableData);

    // 2. 生成空白行装饰器
    const decorations = generateBlankLineDecorations(
      document,
      variableData,
      parser,
      tabSize,
      ast
    );

    // 3. 应用装饰器
    editor.setDecorations(variableHintDecorationType, decorations);
  } catch (e) {
    console.error("解析错误:", e);
    vscode.window.showErrorMessage('变量装饰解析失败，请检查代码格式或扩展兼容性');
    editor.setDecorations(variableHintDecorationType, []);
  }
}

/**
 * 获取AST和变量使用数据
 */
function getAstAndVariableData(
  document: vscode.TextDocument,
  parser: LanguageParser
): { ast: any; variableData: Record<string, { declaredAt: number; usedAt: number[] }> } {
  const ast = parser.getAst(document);
  const variableData = ast ? parser.collectVariableUsage(ast) : {};
  return { ast, variableData };
}

/**
 * 生成空白行装饰器
 */
function generateBlankLineDecorations(
  document: vscode.TextDocument,
  variableData: Record<string, { declaredAt: number; usedAt: number[] }>,
  parser: LanguageParser,
  tabSize: number,
  ast: any
): vscode.DecorationOptions[] {
  const decorations: vscode.DecorationOptions[] = [];

  for (let line = 0; line < document.lineCount - 1; line++) {
    const textLine = document.lineAt(line);
    const nextTextLine = document.lineAt(line + 1);

    if (textLine.isEmptyOrWhitespace && !nextTextLine.isEmptyOrWhitespace) {
      const indent = calculateIndent(nextTextLine.text, tabSize);
      const scopeRange = parser.getScopeRangeForLine(ast, line);

      if (!scopeRange) { continue; }

      const variablesToShow = findVariablesInScope(
        variableData,
        scopeRange,
        line
      );

      if (variablesToShow.length > 0) {
        decorations.push(createDecorationOption(line, variablesToShow, indent));
      }
    }
  }

  return decorations;
}

/**
 * 计算缩进量
 */
function calculateIndent(lineText: string, tabSize: number): number {
  let indent = 0;
  for (let i = 0; i < lineText.length; i++) {
    const char = lineText[i];
    if (char === ' ') { indent += 1; }
    else if (char === '\t') { indent += tabSize; }
    else { break; }
  }
  return indent;
}

/**
 * 查找作用域内需要显示的变量
 */
function findVariablesInScope(
  variableData: Record<string, { declaredAt: number; usedAt: number[] }>,
  scopeRange: { startLine: number; endLine: number },
  currentLine: number
): string[] {
  const variablesToShow: string[] = [];

  for (const varName in variableData) {
    const varInfo = variableData[varName];
    if (
      varInfo.usedAt.some(
        (useLine) => useLine >= scopeRange.startLine && useLine <= currentLine
      ) &&
      varInfo.usedAt.some(
        (useLine) => useLine > currentLine && useLine <= scopeRange.endLine
      )
    ) {
      variablesToShow.push(varName);
    }
  }

  return variablesToShow;
}

/**
 * 创建装饰器选项
 */
function createDecorationOption(
  line: number,
  variablesToShow: string[],
  indent: number
): vscode.DecorationOptions {
  return {
    range: new vscode.Range(
      new vscode.Position(line, 0),
      new vscode.Position(line, 0)
    ),
    renderOptions: {
      after: {
        contentText: `↓ ${variablesToShow.length} - ${variablesToShow.join(', ')}`,
        margin: `0px 0px 0px ${indent}ch`,
      },
    },
  };
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

