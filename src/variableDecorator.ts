import * as vscode from "vscode";
import * as tsParser from "./languages/ts";
import * as goParser from "./languages/go";
import { VariableUsage } from "./languages/type";

/**
 * 变量装饰器 - 负责在空白行显示后续使用的变量提示
 */

// 创建变量提示装饰器类型
const variableHintDecorationType = vscode.window.createTextEditorDecorationType(
  {
    after: {
      contentText: "",
      color: "#444444",
      fontWeight: "100",
      fontStyle: "italic",
      margin: "0px 0px 0px 0px",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  }
);

let updateTimeout: NodeJS.Timeout | null = null;

interface LanguageParser {
  getAst(document: vscode.TextDocument): any;
  collectVariableUsage(ast: any): VariableUsage[];
  getScopeRangeForLine(ast: any, line: number): ScopeRange | null;
}

type ScopeRange = {
  startLine: number;
  endLine: number;
};

/**
 * 更新变量提示装饰器
 * @param editor 文本编辑器对象
 */
export function updateVariableDecorations(
  editor: vscode.TextEditor | undefined
) {
  if (!editor) {
    return;
  }

  const document = editor.document;
  const languageId = document.languageId;
  // vscode.window.showInformationMessage("w")
  // 支持的语言列表
  const supportedLanguages = ["javascript", "typescript", "go"];
  if (!supportedLanguages.includes(languageId)) {
    editor.setDecorations(variableHintDecorationType, []);
    return;
  }

  try {
    const parser: LanguageParser =
      languageId === "go" ? goParser : tsParser;

    // 1. 获取AST和变量数据
    const ast = parser.getAst(document);

    if (!ast) {
      editor.setDecorations(variableHintDecorationType, []);
      return;
    }


    // 2. 生成空白行装饰器
    const decorations = generateBlankLineDecorations(parser, ast, editor);

    // 3. 应用装饰器
    editor.setDecorations(variableHintDecorationType, decorations);
  } catch (e) {
    console.error("解析错误:", e);
    vscode.window.showErrorMessage(
      "变量装饰解析失败，请检查代码格式或扩展兼容性"
    );
    editor.setDecorations(variableHintDecorationType, []);
  }
}

/**
 * 生成空白行装饰器
 *
 * 该函数扫描文档中的空白行（仅包含空格或制表符的行），并在符合条件的空白行上方
 * 创建变量提示装饰器。装饰器会显示当前作用域内可用的变量列表。
 *
 * @param parser 语言解析器实例，提供作用域分析和变量收集功能
 * @param ast 抽象语法树（AST），用于解析代码结构。若为空则跳过变量收集
 * @param editor VS Code 文本编辑器实例，用于获取文档内容和配置信息
 *
 * @returns 空白行装饰器选项数组，用于在编辑器中渲染装饰元素
 */
function generateBlankLineDecorations(
  parser: LanguageParser,
  ast: any,
  editor: vscode.TextEditor
): vscode.DecorationOptions[] {
  // 收集当前文档的变量使用数据（若AST不存在则返回空数组）
  const variableData = ast ? parser.collectVariableUsage(ast) : [];

  console.log("ASTvariableData", variableData);
  const decorations: vscode.DecorationOptions[] = [];
  // 获取编辑器缩进配置（默认4空格）
  const tabSize = (editor.options.tabSize as number) || 4;
  const document = editor.document;

  // 遍历除最后一行外的所有行（需检查下一行状态）
  for (let line = 0; line < document.lineCount - 1; line++) {
    // 仅处理：当前行为空白行且下一行为非空白行的情况
    if (!isBlankLineWithContentBelow(document, line)) {
      continue;
    }
    const nextTextLine = document.lineAt(line + 1);

    // 计算下一行的缩进级别（用于确定装饰器位置）
    const indent = calculateIndent(nextTextLine.text, tabSize);
    // 获取当前行对应的作用域范围
    const scopeRange = parser.getScopeRangeForLine(ast, line) ?? { startLine: 0, endLine: document.lineCount - 1 };

    // 查找当前作用域内可用的变量
    const variablesToShow = findVariablesInScope(
      variableData,
      scopeRange,
      line
    );

    // 当存在有效变量时创建装饰器
    if (variablesToShow.length > 0) {
      decorations.push(
        createDecorationOption(line, variablesToShow, indent, editor)
      );
    }
  }

  return decorations;
}

function isBlankLineWithContentBelow(
  document: vscode.TextDocument,
  line: number
): boolean {
  if (line >= document.lineCount - 1) {
    return false;
  }

  const textLine = document.lineAt(line);
  const nextTextLine = document.lineAt(line + 1);

  return textLine.isEmptyOrWhitespace && !nextTextLine.isEmptyOrWhitespace;
}

/**
 * 计算缩进量
 */
function calculateIndent(lineText: string, tabSize: number): number {
  let indent = 0;
  for (let i = 0; i < lineText.length; i++) {
    const char = lineText[i];
    if (char === " ") {
      indent += 1;
    } else if (char === "\t") {
      indent += tabSize;
    } else {
      break;
    }
  }
  return indent;
}

type variable = {
  name: string;
  usedTime: number;
};

/**
 * 查找作用域内需要显示的变量
 */
function findVariablesInScope(
  variableData: VariableUsage[],
  scopeRange: { startLine: number; endLine: number },
  currentLine: number
): variable[] {
  const variablesToShow: variable[] = [];

  for (const varInfo of variableData) {
    // 检查变量是否在当前作用域内声明
    if (
      varInfo.declaredAt < scopeRange.startLine ||
      varInfo.declaredAt > scopeRange.endLine
    ) {
      continue;
    }

    // 检查变量在当前行之前是否被使用过
    const usedBefore = varInfo.usedAt.some(
      (useLine) =>
        useLine >= scopeRange.startLine && useLine <= currentLine
    );

    var usedTime = 0;
    varInfo.usedAt.forEach((v) => {
      if (v > currentLine && v <= scopeRange.endLine) {
        usedTime++;
      }
    });
    const usedAfter = usedTime > 0;

    if (usedBefore && usedAfter) {
      variablesToShow.push({
        name: varInfo.name,
        usedTime,
      });
    }
  }

  return variablesToShow;
}

/**
 * 创建装饰器选项
 */
function createDecorationOption(
  line: number,
  variablesToShow: variable[],
  indent: number,
  editor: vscode.TextEditor
): vscode.DecorationOptions {
  const stringVarS: string[] = [];
  variablesToShow.forEach((variable) => {
    stringVarS.push(stringVariable(variable));
  });

  const cursorPosition = editor.selection.active;
  const renderOptions = {
    after: {
      contentText: `↓ ${variablesToShow.length} - ${stringVarS.join(
        ", "
      )}`,
      margin: `0px 0px 0px ${indent}ch`,
    },
  };
  var range: vscode.Range;
  if (cursorPosition.line === line) {
    range = new vscode.Range(
      cursorPosition, // 使用光标位置作为起点
      cursorPosition // 起点和终点相同（零长度范围）
    );
  } else {
    range = new vscode.Range(
      new vscode.Position(line, 0),
      new vscode.Position(line, 0)
    );
  }
  return {
    range,
    renderOptions,
  };
}

function stringVariable(v: variable) {
  return `${v.name}:${v.usedTime}`;
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
