import * as vscode from "vscode";
import * as ts from "typescript";

/**
 * 变量装饰器 - 负责在空白行显示后续使用的变量提示
 */

// 创建变量提示装饰器类型
export const variableHintDecorationType = vscode.window.createTextEditorDecorationType({
    before: {
        contentText: "",
        color: "#999999",
        fontWeight: "normal",
        fontStyle: "italic",
        margin: "0 10px 0 0",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen
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
 * 收集变量使用信息
 * @param ast AST源文件对象
 * @returns 变量使用数据
 */
function collectVariableUsage(ast: ts.SourceFile) {
    const variableData: Record<string, { declaredAt: number; usedAfter: number[] }> = {};

    const visit = (node: ts.Node) => {
        // 收集变量声明
        if (ts.isVariableDeclaration(node)) {
            const varName = node.name.getText();
            const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

            if (!variableData[varName]) {
                variableData[varName] = {
                    declaredAt: line,
                    usedAfter: []
                };
            }
        }

        // 收集变量使用
        if (ts.isIdentifier(node) &&
            !ts.isPropertyAccessExpression(node.parent) &&
            !ts.isShorthandPropertyAssignment(node.parent)) {

            const varName = node.getText();
            const line = ast.getLineAndCharacterOfPosition(node.getStart()).line;

            if (variableData[varName] && variableData[varName].declaredAt < line) {
                variableData[varName].usedAfter.push(line);
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
    if (!editor) {return;}

    const document = editor.document;
    const decorations: vscode.DecorationOptions[] = [];

    // 只处理JavaScript和TypeScript文件
    if (!['javascript', 'typescript'].includes(document.languageId)) {
        editor.setDecorations(variableHintDecorationType, []);
        return;
    }

    try {
        const ast = getAst(document);
        if (!ast) {return;}

        const variableData = collectVariableUsage(ast);

        // 分析空白行
        for (let line = 0; line < document.lineCount; line++) {
            const textLine = document.lineAt(line);

            if (textLine.isEmptyOrWhitespace) {
                const variablesToShow: string[] = [];

                for (const varName in variableData) {
                    const varInfo = variableData[varName];

                    // 检查变量是否在当前行之后被使用
                    if (varInfo.declaredAt < line &&
                        varInfo.usedAfter.some(useLine => useLine > line)) {
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
                            before: {
                                contentText: `↳ ${variablesToShow.join(', ')}`,
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