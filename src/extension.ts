import * as vscode from 'vscode';
import * as path from 'path';


const LANGUAGES: { [key: string]: string } = {
	'js': 'JavaScript',
	'ts': 'TypeScript',
	'py': 'Python',
	'c': 'C',
	'h': 'C',
	'cpp': 'C++',
	'cc': 'C++',
	'cxx': 'C++',
	'hpp': 'C++',
	'hh': 'C++',
	'java': 'Java',
	'go': 'Go',
	'cs': 'C#',
	'kt': 'Kotlin',
	'rb': 'Ruby',
	'rs': 'Rust',
	'scala': 'Scala',
	'css': 'CSS',
	'jsx': 'JSX',
	'tsx': 'TSX'
};

const LANGUAGES_STR = [...new Set(Object.values(LANGUAGES))].join(',');

let visitedFiles: { [file: string]: boolean } = {};

function getLanguageFromFileExt(ext: string): string {
	return LANGUAGES[ext] || 'UNKNOWN';
}

function getFileExt(fileName: string): string {
	return fileName.substring(fileName.lastIndexOf(".") + 1);
}

function isFoldingEnabled(fileName: string) {
	let config = vscode.workspace.getConfiguration('hide-top-comment');

	let languages: string[] = config.get('languages', LANGUAGES_STR).split(',').map(item => item.trim());

	let fileLanguage = getLanguageFromFileExt(getFileExt(fileName)).toUpperCase();

	if (fileLanguage !== 'UNKNOWN') {
		return languages.map(item => item.toUpperCase()).includes(fileLanguage);
	}
	return false;
}

function getTopCommentRangeForPythonStyle(doc: vscode.TextDocument): vscode.Range | null {
	let startLine = null;
	let endLine = null;
	for (let i = 0; i < doc.lineCount; i++) {
		const line = doc.lineAt(i).text.trimStart();
		if (line.startsWith("#")) {
			startLine = startLine === null ? i : startLine;
			endLine = i;
		}
		else {
			break;
		}
	}
	if (startLine !== null && endLine !== null) {
		var textRange = new vscode.Range(doc.lineAt(startLine).range.start, doc.lineAt(endLine).range.end);
		return new vscode.Range(textRange.start, textRange.end);
	}
	return null;
}


function getTopCommentRangeForCStyle(doc: vscode.TextDocument): vscode.Range | null {
	let startLine = null;
	let endLine = null;
	let inComment = false;

	for (let i = 0; i < doc.lineCount; i++) {
		const line = doc.lineAt(i).text.trim();
		if (!inComment) {
			if (line.startsWith("//")) {
				startLine = startLine === null ? i : startLine;
				endLine = i;
			}
			else if (line.startsWith("/*")) {
				startLine = startLine === null ? i : startLine;
				inComment = true;
				if (line.endsWith("*/")) {
					inComment = false;
					endLine = i;
				}
			}
			else {
				break;
			}
		}
		else {
			if (line.includes("*/")) {
				inComment = false;
				endLine = i;
			}
		}
	}

	if (startLine !== null && endLine !== null) {
		var textRange = new vscode.Range(doc.lineAt(startLine).range.start,
			doc.lineAt(endLine).range.end);
		return new vscode.Range(textRange.start, textRange.end);
	}
	return null;
}

function getTopCommentsRange(doc: vscode.TextDocument): vscode.Range | null {
	let language = getLanguageFromFileExt(getFileExt(doc.fileName));
	if (['Python', 'Ruby'].includes(language)) {
		return getTopCommentRangeForPythonStyle(doc);
	}
	// CSS doesn't support single line comment (//). However no need to handle that case.
	else if (['C', 'C++', 'C#', 'CSS', 'Go', 'Java', 'JavaScript', 'JSX', 'Kotlin',
		'Rust', 'Scala', 'TypeScript', 'TSX'].includes(language)) {
		return getTopCommentRangeForCStyle(doc);
	}
	return null;
}

async function hideTopComments(editor: vscode.TextEditor) {
	let doc = editor.document;
	const range = getTopCommentsRange(doc);
	if (range) {
		// if cursor is within comment block and comment is not very short, we like to fold 
		const fold = (editor.selection.start.line <= range.end.line) && 
					(range.end.line - range.start.line >= 4); 
		if (fold) {
			editor.selection = new vscode.Selection(range.start, range.end);
			await vscode.commands.executeCommand('editor.createFoldingRangeFromSelection');
		}
	}
}

export function activate(context: vscode.ExtensionContext) {

	let delay: number = vscode.workspace.getConfiguration('hide-top-comment').get('delay', 100);
	delay = (delay > 1000)? 1000 : ((delay < 0)? 0 : delay);
	if (vscode.window.activeTextEditor) {
		if (isFoldingEnabled(vscode.window.activeTextEditor.document.fileName)) {
			hideTopComments(vscode.window.activeTextEditor);
		}
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			if ((isFoldingEnabled(editor.document.fileName) && 
				!(editor.document.fileName in visitedFiles))) {
				setTimeout(() => { 
					hideTopComments(editor); 
					visitedFiles[editor.document.fileName] = true;
				}, delay);
			}
		}
	});

	vscode.workspace.onDidCloseTextDocument(doc => {
		if (doc && (doc.fileName in visitedFiles)) {
			delete visitedFiles[doc.fileName];
		};
	});

	// The onDidCloseTextDocument event doesn't always fire when a file is closed,
	// so we also listen for tab closure events and clear the visitedFiles accordingly.
	vscode.window.tabGroups.onDidChangeTabs((changedEvent) => {
		if (changedEvent?.closed) {
			for (const tab of changedEvent.closed) {
				const filename = tab.label;
				for (let filepath in visitedFiles) {
					if (filename === path.basename(filepath)) {
						delete visitedFiles[filepath];
					}
				}	
			}
		}
    });
}

export function deactivate() { }
