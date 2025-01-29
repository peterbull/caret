import * as vscode from "vscode";
import ollama from "ollama";

function getWebviewContent() {
  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { 
                font-family: sans-serif; 
                margin: 1rem; 
            }
            #chat-container {
                max-width: 800px;
                margin: 0 auto;
            }
            #messages {
                height: 300px;
                border: 1px solid #ccc;
                overflow-y: auto;
                margin-bottom: 1rem;
                padding: 1rem;
            }
            #input-container {
                display: flex;
                gap: 0.5rem;
            }
            #message-input {
                flex: 1;
                padding: 0.5rem;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
            button {
                padding: 0.5rem 1rem;
                background: #007acc;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background: #005999;
            }
            .message {
                margin-bottom: 0.5rem;
                padding: 0.5rem;
                border-radius: 4px;
            }
            .user-message {
                background: #e9ecef;
                margin-left: 20%;
            }
            .assistant-message {
                background: #007acc22;
                margin-right: 20%;
            }
        </style>
    </head>
    <body>
        <div id="chat-container">
            <h2>Caret Chat</h2>
            <div id="messages"></div>
            <div id="input-container">
                <input type="text" id="message-input" placeholder="Type your message...">
                <button id="send-button">Send</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const messagesContainer = document.getElementById('messages');
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');

            function addMessage(content, isUser = true) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (isUser ? 'user-message' : 'assistant-message');
                messageDiv.textContent = content;
                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

			function sendMessage() {
				const message = messageInput.value.trim();
				if (message) {
					addMessage(message, true);
					vscode.postMessage({ type: 'chat', text: message });
					messageInput.value = '';
					currentResponseDiv = null; 
				}
			}


			window.addEventListener('message', event => {
				const message = event.data;
				switch (message.command) {
					case 'chatResponse':
						if (!currentResponseDiv) {
							currentResponseDiv = document.createElement('div');
							currentResponseDiv.className = 'message assistant-message';
							messagesContainer.appendChild(currentResponseDiv);
						}
						currentResponseDiv.textContent = message.text;
						messagesContainer.scrollTop = messagesContainer.scrollHeight;
						break;
    }
});

            sendButton.addEventListener('click', sendMessage);
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        </script>
    </body>
    </html>
  `;
}

class CaretChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = getWebviewContent();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "chat") {
        const ctx = `Here is the current file that is open in my browser: ${getEditorText()}.\n Here is my question or directive:\n\n`;
        const userPrompt = message.text;
        let responseText = "";
        try {
          const streamResponse = await ollama.chat({
            model: "deepseek-r1:7b",
            messages: [{ role: "user", content: ctx + userPrompt }],
            stream: true,
          });

          for await (const part of streamResponse) {
            responseText += part.message?.content || "";
            webviewView.webview.postMessage({
              command: "chatResponse",
              text: responseText,
            });
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Error: ${error}`);
        }
      }
    });
  }
}

function getEditorText(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "";
  }

  const selection = editor.selection;
  if (!selection.isEmpty) {
    return editor.document.getText(selection);
  }

  return editor.document.getText();
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new CaretChatViewProvider(context.extensionUri);
  console.log('Congratulations, your extension "caret" is now active!');

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("caret.chatView", provider)
  );

  const disposable = vscode.commands.registerCommand("caret.start", () => {
    vscode.commands.executeCommand("workbench.view.extension.caret-chat");
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
