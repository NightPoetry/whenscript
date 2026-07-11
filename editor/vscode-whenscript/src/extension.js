// WhenScript VS Code extension — plain CommonJS, no TypeScript build step.
//
// Two independent layers:
//   1. Syntax highlighting + snippets — wired declaratively in package.json (grammars/snippets),
//      always available the moment the extension activates. Nothing in this file is needed for it.
//   2. Diagnostics via the whenscript LSP — this file's job. It shells out to the `whenscript`
//      binary (`whenscript.lspPath` setting) with `lsp` as the subcommand, over stdio. If the
//      binary isn't built/found, we degrade gracefully: warn once, keep highlighting working,
//      never throw past activate() (a crashed activate() would take the grammar down with it).
"use strict";

const vscode = require("vscode");

/** @type {import("vscode-languageclient/node").LanguageClient | undefined} */
let client;

function activate(context) {
  try {
    startLanguageClient(context);
  } catch (err) {
    // Defensive: activate() must never throw, or VS Code disables the whole extension
    // (including the grammar contribution that needs no LSP at all).
    reportLspUnavailable(err);
  }
}

function startLanguageClient(context) {
  // Deferred require: if vscode-languageclient isn't installed (e.g. a dev checkout that
  // skipped `npm install`), this throws here — caught by activate()'s try/catch — rather than
  // at extension load time.
  const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

  const config = vscode.workspace.getConfiguration("whenscript");
  const lspPath = config.get("lspPath", "whenscript");

  const serverExecutable = {
    command: lspPath,
    args: ["lsp"],
    transport: TransportKind.stdio,
  };

  /** @type {import("vscode-languageclient/node").ServerOptions} */
  const serverOptions = {
    run: serverExecutable,
    debug: serverExecutable,
  };

  /** @type {import("vscode-languageclient/node").LanguageClientOptions} */
  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "whenscript" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.when"),
    },
  };

  client = new LanguageClient(
    "whenscript",
    "WhenScript Language Server",
    serverOptions,
    clientOptions
  );

  // client.start() spawns the child process and awaits the initialize handshake; it rejects
  // (rather than throwing synchronously) when the binary is missing or misbehaves — e.g. a
  // plain ENOENT from a bad whenscript.lspPath. Catch it so a missing binary degrades to
  // "highlighting only" instead of a scary unhandled-rejection / repeated error popups.
  client.start().then(
    () => {
      // LSP connected — diagnostics are live.
    },
    (err) => {
      client = undefined;
      reportLspUnavailable(err);
    }
  );

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        return client.stop();
      }
    },
  });
}

let warnedOnce = false;

function reportLspUnavailable(err) {
  if (warnedOnce) return; // don't spam the user on repeated activation-path failures
  warnedOnce = true;
  const detail = err && err.message ? ` (${err.message})` : "";
  vscode.window.showWarningMessage(
    "WhenScript: 语法高亮仍可用，诊断需构建 whenscript 二进制" + detail +
      "。设置 whenscript.lspPath 指向构建产物，详见扩展 README。"
  );
}

function deactivate() {
  if (!client) {
    return undefined;
  }
  const toStop = client;
  client = undefined;
  return toStop.stop();
}

module.exports = { activate, deactivate };
