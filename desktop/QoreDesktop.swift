import AppKit
import WebKit

// A narrow local shell. It launches the bundled simulation service, never the legacy runtime.
final class QoreDesktop: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var service: Process?
    var origin: URL?
    var readyBuffer = Data()
    var readyPipe: Pipe?
    var stopping = false
    #if QORE_QA
    var qaStarted = false
    var qa: QoreNativeQAState?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if !qaStarted && webView.url?.host == origin?.host && origin != nil {
            qaStarted = true
            qa?.markStage("qa-started")
            runNativeQA(self)
        }
    }
    #endif

    func applicationDidFinishLaunching(_ notification: Notification) {
        #if QORE_QA
        let outputArgument = ProcessInfo.processInfo.arguments.first { $0.hasPrefix("--qa-output=") }
        let qaOutput = outputArgument.map { URL(fileURLWithPath: String($0.dropFirst("--qa-output=".count)), isDirectory: true) } ?? Bundle.main.bundleURL.deletingLastPathComponent()
        qa = QoreNativeQAState(output: qaOutput) { NSApp.terminate(nil) }
        qa?.start()
        #endif
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About QORE", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit QORE", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); menu.addItem(editItem); editItem.title = "Edit"
        let edit = NSMenu(title: "Edit"); editItem.submenu = edit
        for (title, action, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let viewItem = NSMenuItem(); menu.addItem(viewItem); viewItem.title = "View"
        let viewMenu = NSMenu(title: "View"); viewItem.submenu = viewMenu
        let reload = viewMenu.addItem(withTitle: "Reload workspace", action: #selector(reloadWorkspace), keyEquivalent: "r"); reload.target = self
        NSApp.mainMenu = menu
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "qoreExport")
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "QORE — Strategy Hub (Local Candidate)"
        window.minSize = NSSize(width: 720, height: 540)
        window.contentView = web
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        showStatus("Starting local research workspace…", detail: "Paper simulation only. Live execution is disabled.")
        #if QORE_QA
        qa?.nativeWindow = window.title
        qa?.markStage("service-starting")
        #endif
        launchService()
    }

    func launchService() {
        guard let resources = Bundle.main.resourceURL else { fail("App resources are missing."); return }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("runtime/node")
        process.arguments = [resources.appendingPathComponent("hub/scripts/qore-hub-service.mjs").path]
        process.currentDirectoryURL = resources.appendingPathComponent("hub")
        // Deliberately do not inherit broker keys, .env, SSH identities, or user shell configuration.
        #if QORE_QA
        let state = qa!.output.appendingPathComponent("hub-state")
        #else
        let state = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("QORE Strategy Hub Candidate", isDirectory: true)
        #endif
        process.environment = ["PATH": "/usr/bin:/bin", "QORE_HUB_STATE": state.path, "QORE_HUB_PARENT_PID": String(ProcessInfo.processInfo.processIdentifier)]
        let pipe = Pipe(); readyPipe = pipe; process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            DispatchQueue.main.async {
                guard let self = self, self.origin == nil, !data.isEmpty else { return }
                self.readyBuffer.append(data)
                guard let text = String(data: self.readyBuffer, encoding: .utf8), let line = text.split(separator: "\n").first,
                      let url = URL(string: String(line)), url.scheme == "http", url.host == "127.0.0.1", url.port != nil else { return }
                self.origin = url
                pipe.fileHandleForReading.readabilityHandler = nil
                #if QORE_QA
                self.qa?.markStage("navigation-loading")
                #endif
                self.web.load(URLRequest(url: url))
            }
        }
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { if let self = self, !self.stopping { self.fail("The local research service stopped. Quit and reopen QORE; recorded runs remain on disk.") } }
        }
        service = process
        do {
            try process.run()
            #if QORE_QA
            qa?.servicePid = process.processIdentifier
            qa?.markStage("service-started")
            #endif
        } catch { fail("The bundled simulation service could not start.") }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self = self, self.origin == nil, !self.stopping else { return }
            self.fail("The local research service did not become ready. Quit and reopen QORE.")
        }
    }

    @objc func reloadWorkspace() { if let url = origin { web.load(URLRequest(url: url)) } }
    func showStatus(_ title: String, detail: String) {
        web.loadHTMLString("<html><body style='font:15px -apple-system;background:#f6f7f9;color:#202a35;padding:80px'><h1>QORE</h1><h2>\(title)</h2><p>\(detail)</p></body></html>", baseURL: nil)
    }
    func fail(_ detail: String) {
        #if QORE_QA
        qa?.finish(detail)
        #else
        showStatus("Workspace unavailable", detail: detail)
        #endif
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        readyPipe?.fileHandleForReading.readabilityHandler = nil
        web.configuration.userContentController.removeScriptMessageHandler(forName: "qoreExport")
        if service?.isRunning == true { service?.terminate(); service?.waitUntilExit() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" || (url.scheme == origin?.scheme && url.host == origin?.host && url.port == origin?.port) { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { fail("The local interface could not load. Quit and reopen QORE.") }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "qoreExport", message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == origin?.host, message.frameInfo.securityOrigin.port == origin?.port,
              let body = message.body as? [String: String], let filename = body["filename"], let content = body["content"],
              filename.range(of: "^run-[a-f0-9-]+(?:-weekly)?\\.(json|csv)$", options: .regularExpression) != nil,
              content.utf8.count <= 20_000_000 else { return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = filename; panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { response in
            if response == .OK, let destination = panel.url {
                do { try content.write(to: destination, atomically: true, encoding: .utf8) }
                catch { let alert = NSAlert(); alert.messageText = "Export could not be saved"; alert.informativeText = "Choose a writable destination and retry."; alert.beginSheetModal(for: self.window) }
            }
        }
    }
}

let app = NSApplication.shared
let delegate = QoreDesktop()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
