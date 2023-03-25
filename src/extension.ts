import * as vscode from 'vscode';


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
	'rs': 'Rust',
	'scala': 'Scala',
	'css': 'CSS'
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
	if (language === 'Python') {
		return getTopCommentRangeForPythonStyle(doc);
	}
	// CSS doesn't support single line comment (//). However no need to handle that case.
	else if (['C', 'C++', 'C#', 'CSS', 'Go', 'Java', 'JavaScript', 'Kotlin',
		'Rust', 'Scala', 'TypeScript'].includes(language)) {
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
}

export function deactivate() { }
