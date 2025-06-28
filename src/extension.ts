// VSCode扩展主入口文件
import * as vscode from "vscode";
import { registerEventHandlers } from "./eventHandlers";
import { triggerVariableUpdate } from "./variableDecorator";

/**
 * 扩展激活函数 - 在扩展启动时调用
 * @param context 扩展上下文对象
 */
export function activate(context: vscode.ExtensionContext) {
	// 注册所有事件监听器
	// vscode.window.showInformationMessage("Vardec activated!");
	registerEventHandlers(context);

	// 注册命令：手动触发装饰更新
	const disposable = vscode.commands.registerCommand('vardec.decoration',
		() => {
			vscode.window.showInformationMessage("刷新装饰222");
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				triggerVariableUpdate(editor); // 更新变量提示装饰
			}
		}
	);
	context.subscriptions.push(disposable);

	// 扩展激活日志
	console.log('扩展 "vardec" 已激活');


	// 处理扩展激活时已打开的文件
	vscode.window.visibleTextEditors.forEach(editor => {

	  if (editor && ['javascript', 'typescript', 'go'].includes(editor.document.languageId)) {

	    triggerVariableUpdate(editor); // 初始化变量提示装饰
	  }
	});
}

/**
 * 扩展停用函数 - 在扩展关闭时调用
 */
export function deactivate() {
	console.log('扩展 "vardec" 已停用');
}
