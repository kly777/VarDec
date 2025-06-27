// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			console.log("editor changed");
			updateVisualHints(editor);
		}),

		vscode.workspace.onDidChangeTextDocument((event) => {
			console.log("document changed");
			if (vscode.window.activeTextEditor?.document === event.document) {
				updateVisualHints(vscode.window.activeTextEditor);
			}
		})
	);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vardec" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand(
	// 	"vardec.helloWorld",
	// 	() => {
	// 		// The code you place here will be executed every time your command is executed
	// 		// Display a message box to the user
	// 		vscode.window.showInformationMessage("Hello VSCode from VarDec!");
	// 	}
	// );

	// 修改后的命令处理函数示例
	vscode.commands.registerCommand("vardec.insertText", async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("请先打开一个文件");
			return;
		}
		updateVisualHints(editor);

		const document = editor.document;
		const insertLine = 5; // 目标行号（从0开始计数）
		const insertText = "// 这是插入的注释\n";

		await editor.edit((editBuilder) => {
			const position = new vscode.Position(insertLine, 0);
			editBuilder.insert(position, insertText);
		});
	});

	// context.subscriptions.push(disposable);


	async function autoInsertHandler(editor: vscode.TextEditor) {
		// 获取配置
		const config = vscode.workspace.getConfiguration('vardec');
		const autoInsertEnabled = config.get<boolean>('autoInsert', true);

		if (autoInsertEnabled) {
			await updateVisualHints(editor);
		}
	}

	// 注册命令
	const disposable = vscode.commands.registerCommand('vardec.insertText',
		() => updateVisualHints(vscode.window.activeTextEditor)
	);

	// 监听文档打开事件
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(async editor => {
			if (editor && ['javascript', 'typescript'].includes(editor.document.languageId)) {
				await autoInsertHandler(editor);
			}
		}),

		// 监听语言切换事件
		vscode.workspace.onDidOpenTextDocument(async document => {
			if (['javascript', 'typescript'].includes(document.languageId)) {
				const editor = vscode.window.visibleTextEditors.find(
					e => e.document === document
				);
				if (editor) { await autoInsertHandler(editor); }
			}
		})
	);
	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }

const variableHintDecorationType = vscode.window.createTextEditorDecorationType(
	{
		before: {
			contentText: "",
			color: "#999999",
			fontWeight: "normal",
			fontStyle: "italic",
			margin: "0 10px 0 0",
		},
		rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
	}
);
function generateDisplayData(lineCount: number): vscode.DecorationOptions[] {
	const decorations: vscode.DecorationOptions[] = [];

	// 示例：在每5的倍数行添加提示
	for (let line = 0; line < lineCount; line++) {
		if ((line + 1) % 5 === 0) {
			const range = new vscode.Range(
				new vscode.Position(line, 2),
				new vscode.Position(line, 2)
			);

			decorations.push({
				range,
				renderOptions: {
					before: {
						contentText: `5倍行`,
						color: "#0088cc",
					},
				},
			});
		}
	}

	return decorations;
}
function updateVisualHints(editor: vscode.TextEditor | undefined) {
	if (!editor) {
		return;
	}

	const document = editor.document;
	const decorations = generateDisplayData(document.lineCount);

	editor.setDecorations(variableHintDecorationType, decorations);
}
