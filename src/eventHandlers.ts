import * as vscode from "vscode";
import { triggerVariableUpdate } from "./variableDecorator";

/**
 * 事件处理器 - 负责管理编辑器事件监听和自动触发装饰更新
 * 现在同时支持行号装饰和变量使用提示装饰
 */

/**
 * 自动插入处理函数 - 根据配置决定是否更新装饰
 * @param editor 文本编辑器对象
 */
export async function autoInsertHandler(editor: vscode.TextEditor) {
	// 获取配置
	const config = vscode.workspace.getConfiguration('vardec');
	const autoInsertEnabled = config.get<boolean>('autoInsert', true);

	if (autoInsertEnabled) {
		triggerVariableUpdate(editor); // 更新变量提示装饰
	}
}

/**
 * 注册事件监听器 - 处理编辑器切换、文档打开等事件
 * @param context 扩展上下文
 */
export function registerEventHandlers(context: vscode.ExtensionContext) {
	// 编辑器切换事件
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(async editor => {
			if (editor && ['javascript', 'typescript'].includes(editor.document.languageId)) {
				await autoInsertHandler(editor);
			}
		})
	);

	// 文档打开事件
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async document => {
			if (['javascript', 'typescript'].includes(document.languageId)) {
				const editor = vscode.window.visibleTextEditors.find(
					e => e.document === document
				);
				if (editor) {
					await autoInsertHandler(editor);
				}
			}
		})
	);

	// 文档修改事件 - 同时更新两种装饰
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			console.log("document changed");
			const editor = vscode.window.activeTextEditor;
			if (editor?.document === event.document) {
				triggerVariableUpdate(editor); // 更新变量提示装饰（带防抖）
			}
		})
	);

	// 编辑器激活事件 - 同时更新两种装饰
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			console.log("editor changed");
			if (editor && ['javascript', 'typescript'].includes(editor.document.languageId)) {
				triggerVariableUpdate(editor); // 更新变量提示装饰（带防抖）
			}
		})
	);
}