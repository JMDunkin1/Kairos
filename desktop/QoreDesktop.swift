import AppKit
import WebKit

final class QoreDesktop: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var service: Process?
    var origin: URL?
    var readyBuffer = Data()
    var readyPipe: Pipe?
    var stopping = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Kairos", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Kairos", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); menu.addItem(editItem); editItem.title = "Edit"
        let edit = NSMenu(title: "Edit"); editItem.submenu = edit
        for (title, action, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let viewItem = NSMenuItem(); menu.addItem(viewItem); viewItem.title = "View"
        let viewMenu = NSMenu(title: "View"); viewItem.submenu = viewMenu
        let reload = viewMenu.addItem(withTitle: "Reload workspace", action: #selector(reloadWorkspace), keyEquivalent: "r"); reload.target = self
        let home = viewMenu.addItem(withTitle: "All strategies", action: #selector(showStrategies), keyEquivalent: "1"); home.target = self
        NSApp.mainMenu = menu
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: configuration); web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Kairos"; window.minSize = NSSize(width: 720, height: 540); window.contentView = web
        window.center(); window.setFrameAutosaveName("QORE"); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        showStatus("Starting your strategy workspace…")
        launchService()
    }

    func launchService() {
        guard let resources = Bundle.main.resourceURL,
              let repository = Bundle.main.object(forInfoDictionaryKey: "QORERepositoryPath") as? String else { showStatus("App resources are missing."); return }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("runtime/node")
        process.arguments = [resources.appendingPathComponent("hub/scripts/qore-hub-service.mjs").path]
        process.currentDirectoryURL = resources.appendingPathComponent("hub")
        // No broker credentials, .env files or shell configuration are inherited.
        // The telemetry child may use the existing read-only SSH identity in HOME.
        process.environment = ["PATH": "/usr/bin:/bin", "HOME": FileManager.default.homeDirectoryForCurrentUser.path,
            "QORE_HUB_LEDGER_ROOT": URL(fileURLWithPath: repository).appendingPathComponent("research/experiment-log").path,
            "QORE_HUB_PORTFOLIO_ROOT": URL(fileURLWithPath: repository).appendingPathComponent(".local/qore/portfolio-control").path,
            "QORE_HUB_ENABLE_TELEMETRY": "1", "QORE_HUB_PARENT_PID": String(ProcessInfo.processInfo.processIdentifier)]
        let pipe = Pipe(); readyPipe = pipe; process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            DispatchQueue.main.async {
                guard let self = self, self.origin == nil, !data.isEmpty else { return }
                self.readyBuffer.append(data)
                guard self.readyBuffer.count <= 4096,
                      let text = String(data: self.readyBuffer, encoding: .utf8), let line = text.split(separator: "\n").first,
                      let url = URL(string: String(line)), url.scheme == "http", url.host == "127.0.0.1", url.port != nil else { return }
                self.origin = url; pipe.fileHandleForReading.readabilityHandler = nil; self.web.load(URLRequest(url: url))
            }
        }
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { if let self = self, !self.stopping { self.showStatus("The local service stopped. Quit and reopen Kairos.") } }
        }
        service = process
        do { try process.run() } catch { showStatus("The bundled service could not start.") }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self = self, self.origin == nil, !self.stopping else { return }
            self.showStatus("The local service did not become ready. Quit and reopen Kairos.")
        }
    }

    @objc func reloadWorkspace() { if origin != nil { web.reload() } }
    @objc func showStrategies() { if let url = origin { web.load(URLRequest(url: url)) } }
    func showStatus(_ detail: String) {
        web.loadHTMLString("<html><body style='font:15px -apple-system;background:#f6f7f9;color:#202a35;padding:80px'><h1>Kairos</h1><p>\(detail)</p></body></html>", baseURL: nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        stopping = true; readyPipe?.fileHandleForReading.readabilityHandler = nil
        if service?.isRunning == true { service?.terminate(); service?.waitUntilExit() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" || (url.scheme == origin?.scheme && url.host == origin?.host && url.port == origin?.port) { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showStatus("The local interface could not load. Quit and reopen Kairos.") }
    }
}
let app = NSApplication.shared
let delegate = QoreDesktop()
app.delegate = delegate; app.setActivationPolicy(.regular); app.run()
