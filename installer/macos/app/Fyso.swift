// Fyso.app (D85, docs/adr/0003-menu-bar-app.md): the menu bar app and the `fyso` CLI in one
// native binary. Without arguments it is the menu bar app (SwiftUI MenuBarExtra, no window,
// no Dock icon); with arguments it is the CLI. Both call the same functions below.
//
// It orchestrates what already exists: the installer's registry (projects.tsv) is the list of
// instances, each stack's process-compose socket gives its state, the project's own
// `mise run up/down` starts and stops it, and the bundled installer script creates one.
// Built with `swiftc` by installer/macos/build.sh (no Xcode project).
import AppKit
import Foundation
import ServiceManagement
import SwiftUI

// MARK: - Bundle, paths and texts

/// Contents/ of the app bundle, also when the CLI runs through the ~/.local/bin/fyso link.
let contents: URL = {
    if let dir = ProcessInfo.processInfo.environment["FYSO_APP_CONTENTS"] { return URL(fileURLWithPath: dir) }
    var size: UInt32 = 4096
    var buf = [CChar](repeating: 0, count: Int(size))
    _ = _NSGetExecutablePath(&buf, &size)
    let exe = URL(fileURLWithPath: String(cString: buf)).resolvingSymlinksInPath()
    return exe.deletingLastPathComponent().deletingLastPathComponent()
}()
let resources = contents.appendingPathComponent("Resources")
let env = ProcessInfo.processInfo.environment
let home = FileManager.default.homeDirectoryForCurrentUser.path
/// Support folder shared with the installer; FYSO_HOME overrides it (tests).
let fysoHome = env["FYSO_HOME"] ?? home + "/Library/Application Support/Fyso"
let registryFile = fysoHome + "/projects.tsv"
let currentFile = fysoHome + "/current"
let installerLog = fysoHome + "/installer/installer.log"
/// FYSO_TEST=1: no login item, no ~/.local/bin link, no SwiftBar cleanup, no first-run actions.
let testMode = env["FYSO_TEST"] == "1"
let info = NSDictionary(contentsOf: contents.appendingPathComponent("Info.plist")) as? [String: Any] ?? [:]
let edition = env["FYSO_EDITION"] ?? (info["FysoEdition"] as? String) ?? "core"
let bizLoginURL = env["FYSO_BIZ_LOGIN_URL"] ?? "https://fyso.biz/login"

let texts: [String: String] = {
    func load(_ lang: String) -> [String: String] {
        let url = resources.appendingPathComponent("locales/\(lang).json")
        guard let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: String] ?? [:]
    }
    // FYSO_LANG, else the first macOS preferred language: English when it starts with en, else Spanish.
    let first = (env["FYSO_LANG"] ?? Locale.preferredLanguages.first ?? "es").lowercased()
    var all = load("es")  // missing keys fall back to Spanish, the default
    if first.hasPrefix("en") { all.merge(load("en")) { $1 } }
    return all
}()

/// Translated text; {{name}} placeholders as in i18next.
func t(_ key: String, _ values: [String: String] = [:]) -> String {
    var text = texts[key] ?? key
    for (k, v) in values { text = text.replacingOccurrences(of: "{{\(k)}}", with: v) }
    return text
}

// MARK: - Instances (the installer's registry)

struct Instance: Identifiable {
    let folder: String
    let port: String
    let name: String
    let slug: String
    let panelURL: String
    var id: String { folder }
    var socket: String { "/tmp/fyso-\(slug)-\(port).sock" }
    var log: String { folder + "/.data/logs/tray.log" }
}

enum State: String { case running, degraded, stopped, noAnswer = "no_answer" }

func readFile(_ path: String) -> String? { try? String(contentsOfFile: path, encoding: .utf8) }

/// `key: value` lines of the project's .copier-answers.yml (flat keys only).
func answers(_ folder: String) -> [String: String]? {
    guard let text = readFile(folder + "/.copier-answers.yml") else { return nil }
    var out: [String: String] = [:]
    for line in text.split(separator: "\n") where !line.hasPrefix("#") && !line.hasPrefix(" ") {
        guard let colon = line.firstIndex(of: ":") else { continue }
        let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        out[String(line[..<colon])] = value.trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
    }
    return out
}

func instance(folder raw: String, port registered: String?) -> Instance? {
    let folder = URL(fileURLWithPath: raw).standardizedFileURL.path
    guard let a = answers(folder) else { return nil }
    let slug = a["project_slug"] ?? URL(fileURLWithPath: folder).lastPathComponent
    let port = a["port_base"].flatMap { $0.isEmpty ? nil : $0 } ?? registered ?? ""
    var name = a["project_name"] ?? slug
    // Same default as mise.toml: FYSO_WEB_DOMAIN = <slug>-<port>.localhost unless web_domain is set.
    let domain = (a["web_domain"].flatMap { $0.isEmpty || $0 == "null" ? nil : $0 }) ?? "\(slug)-\(port).localhost"
    var panel = "http://panel.\(domain):\(port)"
    if let data = FileManager.default.contents(atPath: folder + "/.data/panel/project.json"),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
        if let n = json["name"] as? String, !n.isEmpty { name = n }
        if let u = (json["urls"] as? [String: Any])?["panel"] as? String, !u.isEmpty { panel = u }
    }
    return Instance(folder: folder, port: port, name: name, slug: slug, panelURL: panel)
}

/// Registry lines are `port<TAB>folder`; folders that are not Fyso projects any more are skipped.
func loadInstances() -> [Instance] {
    var seen = Set<String>(), list: [Instance] = []
    for line in (readFile(registryFile) ?? "").split(separator: "\n") {
        let parts = line.split(separator: "\t", maxSplits: 1).map(String.init)
        guard parts.count == 2, let item = instance(folder: parts[1], port: parts[0]), !seen.contains(item.folder) else { continue }
        seen.insert(item.folder)
        list.append(item)
    }
    return list
}

func currentFolder(_ list: [Instance]) -> String? {
    let saved = readFile(currentFile)?.trimmingCharacters(in: .whitespacesAndNewlines)
    return list.first(where: { $0.folder == saved })?.folder ?? list.first?.folder
}

func setCurrent(_ item: Instance) {
    try? FileManager.default.createDirectory(atPath: fysoHome, withIntermediateDirectories: true)
    try? (item.folder + "\n").write(toFile: currentFile, atomically: true, encoding: .utf8)
}

/// Add a project created by hand (or by `mise run tray:install`) to the registry.
@discardableResult
func register(folder: String) -> (Instance?, Bool) {
    let path = URL(fileURLWithPath: folder).standardizedFileURL.path
    guard let item = instance(folder: path, port: nil) else { return (nil, false) }
    if loadInstances().contains(where: { $0.folder == item.folder }) { return (item, false) }
    try? FileManager.default.createDirectory(atPath: fysoHome, withIntermediateDirectories: true)
    let line = "\(item.port)\t\(item.folder)\n"
    if let handle = FileHandle(forWritingAtPath: registryFile) {
        handle.seekToEndOfFile(); handle.write(line.data(using: .utf8)!); handle.closeFile()
    } else {
        try? line.write(toFile: registryFile, atomically: true, encoding: .utf8)
    }
    return (item, true)
}

/// An instance named by its name, slug or folder (case-insensitive name/slug).
func find(_ query: String?, in list: [Instance]) -> Instance? {
    guard let q = query, !q.isEmpty else { return list.first { $0.folder == currentFolder(list) } }
    let folder = URL(fileURLWithPath: (q as NSString).expandingTildeInPath).standardizedFileURL.path
    return list.first { $0.folder == folder || $0.slug == q.lowercased() || $0.name.lowercased() == q.lowercased() }
}

// MARK: - State, from the stack's own process-compose socket

func run(_ path: String, _ args: [String], timeout: TimeInterval = 5) -> (Int32, String) {
    let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = args
    let out = Pipe(); p.standardOutput = out; p.standardError = FileHandle.nullDevice
    p.standardInput = FileHandle.nullDevice
    do { try p.run() } catch { return (-1, "") }
    let deadline = Date().addingTimeInterval(timeout)
    let data = out.fileHandleForReading.readDataToEndOfFile()
    while p.isRunning && Date() < deadline { usleep(20_000) }
    if p.isRunning { p.terminate() }
    p.waitUntilExit()
    return (p.terminationStatus, String(data: data, encoding: .utf8) ?? "")
}

func state(_ item: Instance) -> State {
    guard FileManager.default.fileExists(atPath: item.socket) else { return .stopped }
    let (code, body) = run("/usr/bin/curl", ["-s", "-m", "2", "--unix-socket", item.socket, "http://localhost/processes"])
    guard code == 0, let data = body.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return code == 7 ? .stopped : .noAnswer  // 7: nobody listens (a crashed stack left its socket)
    }
    let procs = json["data"] as? [[String: Any]] ?? []
    func ok(_ p: [String: Any]) -> Bool {
        let status = p["status"] as? String ?? ""
        if status == "Running" {
            let ready = p["is_ready"] as? String == "Ready"
            return ready || !((p["has_ready_probe"] as? Bool) ?? ready)
        }
        return status == "Disabled" || (status == "Completed" && (p["exit_code"] as? Int ?? 0) == 0)
    }
    return !procs.isEmpty && procs.allSatisfy(ok) ? .running : .degraded
}

// MARK: - Actions shared by the menu and the CLI

/// The person's login-shell PATH: apps start with a minimal one that lacks mise and the engine CLIs.
let loginPath: String = {
    let shell = env["SHELL"] ?? "/bin/zsh"
    let (_, out) = run(shell, ["-lc", "printf %s \"$PATH\""], timeout: 10)
    let path = out.trimmingCharacters(in: .whitespacesAndNewlines)
    return home + "/.local/bin:" + (path.isEmpty ? (env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin") : path)
}()

func mise() -> String? {
    for dir in (loginPath + ":" + (env["PATH"] ?? "")).split(separator: ":") {
        let path = "\(dir)/mise"
        if FileManager.default.isExecutableFile(atPath: path) { return path }
    }
    return nil
}

/// `mise run up|down` in the project, output appended to .data/logs/tray.log. Blocks; returns the exit code.
func runTask(_ item: Instance, _ task: String, echo: Bool = false) -> Int32 {
    guard let mise = mise() else { return 127 }
    try? FileManager.default.createDirectory(atPath: item.folder + "/.data/logs", withIntermediateDirectories: true)
    if !FileManager.default.fileExists(atPath: item.log) { FileManager.default.createFile(atPath: item.log, contents: nil) }
    guard let log = FileHandle(forWritingAtPath: item.log) else { return 1 }
    log.seekToEndOfFile()
    let stamp = ISO8601DateFormatter().string(from: Date())
    log.write("\n[\(stamp)] $ mise run \(task)\n".data(using: .utf8)!)
    let p = Process(); p.executableURL = URL(fileURLWithPath: mise); p.arguments = ["-C", item.folder, "run", task]
    p.currentDirectoryURL = URL(fileURLWithPath: item.folder)
    var e = env; e["PATH"] = loginPath; p.environment = e
    p.standardInput = FileHandle.nullDevice
    if echo { p.standardOutput = FileHandle.standardOutput; p.standardError = FileHandle.standardError }
    else { p.standardOutput = log; p.standardError = log }
    do { try p.run() } catch { return 1 }
    p.waitUntilExit()
    log.write("[\(ISO8601DateFormatter().string(from: Date()))] \(task): exit \(p.terminationStatus)\n".data(using: .utf8)!)
    log.closeFile()
    return p.terminationStatus
}

func openURL(_ url: String) { _ = run("/usr/bin/open", [url]) }

/// The bundled installer (D35) creates the instance: the same form, workflow and registry write.
/// Blocks until it exits; a new registry entry becomes the current instance.
func createInstance() -> Instance? {
    let before = Set(loadInstances().map(\.folder))
    let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/bash")
    p.arguments = [resources.appendingPathComponent("fyso-installer.sh").path]
    var e = env; e["FYSO_EDITION"] = edition; p.environment = e
    do { try p.run() } catch { return nil }
    p.waitUntilExit()
    guard let created = loadInstances().last(where: { !before.contains($0.folder) }) else { return nil }
    setCurrent(created)
    return created
}

func notify(_ text: String) {
    _ = run("/usr/bin/osascript", ["-e", "on run argv", "-e", "display notification (item 1 of argv) with title \"Fyso\"", "-e", "end run", text])
}

// MARK: - First launch: CLI link, login item, migration from the SwiftBar plugin (D34)

func firstRunSetup() {
    guard !testMode else { return }
    let fm = FileManager.default
    // ~/.local/bin/fyso → this binary (the installer puts mise in the same folder).
    let bin = home + "/.local/bin", link = bin + "/fyso"
    let target = contents.appendingPathComponent("MacOS/fyso").path
    let existing = try? fm.destinationOfSymbolicLink(atPath: link)
    if existing != target && (existing != nil || !fm.fileExists(atPath: link)) {
        try? fm.createDirectory(atPath: bin, withIntermediateDirectories: true)
        try? fm.removeItem(atPath: link)
        try? fm.createSymbolicLink(atPath: link, withDestinationPath: target)
    }
    // Projects the SwiftBar plugin remembered join the registry.
    if let data = fm.contents(atPath: home + "/Library/Caches/fyso-tray/projects.json"),
       let cache = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
        for folder in cache.keys { register(folder: folder) }
    }
    // Remove SwiftBar's link to our old plugin, only when it is that link (SwiftBar stays installed).
    if let dir = UserDefaults(suiteName: "com.ameba.SwiftBar")?.string(forKey: "PluginDirectory") {
        let plugin = dir + "/fyso.10s.py"
        if let dest = try? fm.destinationOfSymbolicLink(atPath: plugin), dest.hasSuffix("framework/tray/fyso.10s.py") {
            try? fm.removeItem(atPath: plugin)
        }
    }
    let defaults = UserDefaults.standard
    if !defaults.bool(forKey: "loginItemOffered") {
        defaults.set(true, forKey: "loginItemOffered")
        try? SMAppService.mainApp.register()
    }
}

// MARK: - CLI

func cli(_ args: [String]) -> Int32 {
    func say(_ s: String) { print(s) }
    func fail(_ s: String) -> Int32 { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); return 1 }
    let command = args[0], rest = Array(args.dropFirst())
    let list = loadInstances()
    func target() -> Instance? { find(rest.first, in: list) }
    switch command {
    case "help", "-h", "--help":
        say(t("cli.usage")); return 0
    case "list", "ls":
        let current = currentFolder(list)
        if rest.contains("--json") {
            let rows: [[String: Any]] = list.map { ["name": $0.name, "slug": $0.slug, "folder": $0.folder, "port": $0.port,
                                                     "panel": $0.panelURL, "state": state($0).rawValue, "current": $0.folder == current] }
            let data = try! JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys])
            say(String(data: data, encoding: .utf8)!); return 0
        }
        if list.isEmpty { say(t("cli.no_instances")); return 0 }
        let head = t("cli.header").split(separator: "|").map(String.init)
        let width = max(head[0].count - 3, list.map(\.name.count).max() ?? 0)
        func pad(_ s: String, _ n: Int) -> String { s + String(repeating: " ", count: max(0, n - s.count)) }
        say(pad(head[0], width + 3) + "  " + pad(head[1], 14) + pad(head[2], 7) + head[3])
        for item in list {
            let mark = item.folder == current ? " * " : "   "
            say(mark + pad(item.name, width) + "  " + pad(t("state." + state(item).rawValue), 14) + pad(item.port, 7) + item.panelURL)
        }
        return 0
    case "status", "open", "start", "stop", "switch":
        if list.isEmpty { return fail(t("cli.no_instances")) }
        guard let item = target() else { return fail(t("cli.not_found", ["name": rest.first ?? ""])) }
        switch command {
        case "status": say(t("cli.task_ok", ["name": item.name, "state": t("state." + state(item).rawValue)])); return state(item) == .running ? 0 : 3
        case "open": say(t("cli.opening", ["url": item.panelURL])); openURL(item.panelURL); return 0
        case "switch": setCurrent(item); say(t("cli.switched", ["name": item.name])); return 0
        default:
            guard mise() != nil else { return fail(t("cli.no_mise")) }
            let task = command == "start" ? "up" : "down"
            say(t("cli.running_task", ["name": item.name, "task": "mise run \(task)", "log": item.log]))
            let code = runTask(item, task)
            if code != 0 { return fail(t("cli.task_failed", ["name": item.name, "code": "\(code)", "log": item.log])) }
            say(t("cli.task_ok", ["name": item.name, "state": t("state." + state(item).rawValue)])); return 0
        }
    case "create", "new":
        say(t("cli.creating"))
        guard let created = createInstance() else { return fail(t("cli.create_failed", ["log": installerLog])) }
        say(t("cli.created", ["name": created.name])); return 0
    case "add":
        let folder = rest.first ?? FileManager.default.currentDirectoryPath
        let (item, added) = register(folder: folder)
        guard let item else { return fail(t("cli.not_project", ["folder": folder])) }
        say(t(added ? "cli.added" : "cli.already", ["name": item.name, "port": item.port])); return 0
    case "biz-login":
        say(t("cli.opening", ["url": bizLoginURL])); openURL(bizLoginURL); return 0
    default:
        _ = fail(t("cli.unknown", ["name": command])); say(t("cli.usage")); return 2
    }
}

// MARK: - Menu bar app

final class Model: ObservableObject {
    struct Row: Identifiable { let item: Instance; let state: State; var id: String { item.id } }
    @Published var rows: [Row] = []
    @Published var current: String?
    @Published var busy: [String: String] = [:]  // folder → "starting" | "stopping"
    @Published var creating = false
    @Published var loginItem = SMAppService.mainApp.status == .enabled
    private var timer: Timer?
    private let queue = DispatchQueue(label: "fyso.refresh")
    /// First launch of the core edition with no instance: open the create form (onboarding).
    private var onboarding = !testMode && edition != "biz" && !UserDefaults.standard.bool(forKey: "createOffered")

    init() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
    }

    func refresh() {
        queue.async {
            let list = loadInstances()
            let rows = list.map { Row(item: $0, state: state($0)) }
            let current = currentFolder(list)
            DispatchQueue.main.async {
                self.rows = rows; self.current = current
                self.loginItem = SMAppService.mainApp.status == .enabled
                if self.onboarding {
                    self.onboarding = false
                    UserDefaults.standard.set(true, forKey: "createOffered")
                    if rows.isEmpty { self.create() }
                }
            }
        }
    }

    var currentRow: Row? { rows.first { $0.item.folder == current } }

    func label(_ row: Row) -> String {
        let s = busy[row.item.folder].map { t("state." + $0) } ?? t("state." + row.state.rawValue)
        return "\(row.item.folder == current ? "✓ " : "")\(row.item.name)  ·  \(s)"
    }

    func perform(_ item: Instance, task: String) {
        busy[item.folder] = task == "up" ? "starting" : "stopping"
        DispatchQueue.global().async {
            let code = runTask(item, task)
            notify(code != 0 ? t("notify.failed", ["name": item.name]) : t(task == "up" ? "notify.started" : "notify.stopped", ["name": item.name]))
            DispatchQueue.main.async { self.busy[item.folder] = nil; self.refresh() }
        }
    }

    func create() {
        guard !creating else { return }
        creating = true
        DispatchQueue.global().async {
            let created = createInstance()
            if let created { notify(t("notify.created", ["name": created.name])) }
            DispatchQueue.main.async { self.creating = false; self.refresh() }
        }
    }

    func makeCurrent(_ item: Instance) { setCurrent(item); refresh() }

    func toggleLoginItem() {
        if SMAppService.mainApp.status == .enabled { try? SMAppService.mainApp.unregister() }
        else { try? SMAppService.mainApp.register() }
        refresh()
    }
}

struct MenuContent: View {
    @ObservedObject var model: Model
    var body: some View {
        if edition == "biz" {
            Button(t("biz.login")) { openURL(bizLoginURL) }
            Text(t("biz.hint"))
            Divider()
        }
        if let row = model.currentRow {
            Text(t("menu.current", ["name": row.item.name, "state": t("state." + (model.busy[row.item.folder] ?? row.state.rawValue))]))
            Divider()
        }
        Text(t("menu.instances"))
        if model.rows.isEmpty { Text(t("menu.none")) }
        ForEach(model.rows) { row in
            Menu(model.label(row)) {
                Button(t("inst.open")) { openURL(row.item.panelURL) }
                if row.item.folder != model.current { Button(t("inst.make_current")) { model.makeCurrent(row.item) } }
                Divider()
                if model.busy[row.item.folder] == nil {
                    if row.state == .stopped { Button(t("inst.start")) { model.perform(row.item, task: "up") } }
                    else { Button(t("inst.stop")) { model.perform(row.item, task: "down") } }
                }
                Button(t("inst.folder")) { openURL(row.item.folder) }
                if FileManager.default.fileExists(atPath: row.item.log) { Button(t("inst.log")) { openURL(row.item.log) } }
            }
        }
        Divider()
        Button(model.creating ? t("menu.creating") : t("menu.create")) { model.create() }.disabled(model.creating)
        Toggle(t("menu.login_item"), isOn: Binding(get: { model.loginItem }, set: { _ in model.toggleLoginItem() }))
        Button(t("menu.refresh")) { model.refresh() }
        Divider()
        Button(t("menu.quit")) { NSApplication.shared.terminate(nil) }.keyboardShortcut("q")
    }
}

struct FysoMenuApp: App {
    @StateObject private var model = Model()
    init() {
        firstRunSetup()
        let defaults = UserDefaults.standard
        // First launch: the Biz edition starts at the fyso.biz login; the core one opens the
        // create form when there is no instance yet (Tailscale-like onboarding).
        if !testMode && !defaults.bool(forKey: "onboarded") {
            defaults.set(true, forKey: "onboarded")
            if edition == "biz" { openURL(bizLoginURL) }
        }
    }
    var body: some Scene {
        MenuBarExtra {
            MenuContent(model: model)
                .onAppear { model.refresh() }
        } label: {
            let up = model.currentRow?.state == .running
            Image(systemName: up ? "square.stack.3d.up.fill" : "square.stack.3d.up")
        }
        .menuBarExtraStyle(.menu)
    }
}

// MARK: - Entry point

let arguments = Array(CommandLine.arguments.dropFirst()).filter { !$0.hasPrefix("-psn_") }
if arguments.isEmpty {
    FysoMenuApp.main()
} else {
    exit(cli(arguments))
}
