import * as vscode from "vscode";

/**
 * 装饰器管理器 - 负责在代码编辑器中添加行号提示装饰
 */

// 创建装饰器类型
export const variableHintDecorationType = vscode.window.createTextEditorDecorationType({
	before: {
		contentText: "",
		color: new vscode.ThemeColor("editorSuggestWidget.foreground"),  // 使用主题感知的颜色
		fontWeight: "bold",
		fontStyle: "italic",
		margin: "0 10px 0 0",
	},
	rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
	overviewRulerLane: vscode.OverviewRulerLane.Right,
});

/**
 * 生成装饰器数据 - 在每5行添加行号提示
 * @param lineCount 文档总行数
 * @returns 装饰器选项数组
 */
export function generateDisplayData(lineCount: number): vscode.DecorationOptions[] {
	const decorations: vscode.DecorationOptions[] = [];

	// 在每5的倍数行添加提示
	for (let line = 0; line < lineCount; line++) {
		if ((line + 1) % 5 === 0) {
			const range = new vscode.Range(
				new vscode.Position(line, 0),  // 行首位置
				new vscode.Position(line, 0)
			);

			decorations.push({
				range,
				renderOptions: {
					before: {
						contentText: `Line ${line + 1}`,  // 显示实际行号
						color: "#0088cc",
					},
				},
			});
		}
	}

	return decorations;
}

/**
 * 更新编辑器视觉提示 - 只在js/ts文件生效
 * @param editor 文本编辑器对象
 */
export function updateVisualHints(editor: vscode.TextEditor | undefined) {
	if (!editor) {
		return;
	}

	// 只在js/ts文件添加装饰
	const languageId = editor.document.languageId;
	if (languageId !== 'javascript' && languageId !== 'typescript') {
		return;
	}

	const document = editor.document;
	const decorations = generateDisplayData(document.lineCount);

	editor.setDecorations(variableHintDecorationType, decorations);
}