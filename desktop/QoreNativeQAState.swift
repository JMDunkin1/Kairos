import Foundation

// Foundation-only so startup/deadline reporting can be tested without launching AppKit.
final class QoreNativeQAState {
    let output: URL
    let timeout: TimeInterval
    let onFinish: () -> Void
    var nativeWindow = ""
    var servicePid: Int32?
    var checks: [String] = []
    private(set) var stage = "application-launch"
    private(set) var finished = false
    private var deadline: DispatchWorkItem?

    init(output: URL, timeout: TimeInterval = 55, onFinish: @escaping () -> Void) {
        self.output = output; self.timeout = timeout; self.onFinish = onFinish
    }

    func start() {
        markStage("application-launch")
        let work = DispatchWorkItem { [weak self] in self?.finish("Native QA deadline exceeded") }
        deadline = work
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)
    }

    func markStage(_ value: String) {
        guard !finished else { return }
        stage = value
        write("qa-progress.json", status: "running", error: "")
    }

    func finish(_ error: String? = nil) {
        guard !finished else { return }
        finished = true
        deadline?.cancel()
        write("qa-result.json", status: error == nil ? "passed" : "failed", error: error ?? "")
        onFinish()
    }

    private func write(_ filename: String, status: String, error: String) {
        var result: [String: Any] = ["status": status, "stage": stage, "checks": checks,
            "error": error, "nativeWindow": nativeWindow, "appPid": ProcessInfo.processInfo.processIdentifier]
        if let servicePid = servicePid { result["servicePid"] = servicePid }
        do {
            let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: output.appendingPathComponent(filename), options: .atomic)
        } catch {
            FileHandle.standardError.write(Data("Native QA could not write \(filename): \(error.localizedDescription)\n".utf8))
        }
    }
}
