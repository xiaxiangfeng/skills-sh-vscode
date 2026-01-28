import * as vscode from 'vscode';
import { SkillsViewProvider } from './views/skillsViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SkillsViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SkillsViewProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skillsSh.refresh', () => provider.refresh(true))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('skillsSh.installSkill', async () => {
      const repo = await vscode.window.showInputBox({
        prompt: 'Enter the GitHub repository (owner/repo)',
        placeHolder: 'owner/repo'
      });

      if (!repo) return;

      await provider.installRepo(repo);
    })
  );
}

export function deactivate() {}
