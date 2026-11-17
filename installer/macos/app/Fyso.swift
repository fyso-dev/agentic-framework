// Fyso.app (D85, docs/adr/0003-menu-bar-app.md): the menu bar app and the `fyso` CLI in one
// native binary. Without arguments it is the menu bar app (SwiftUI MenuBarExtra, no window,
// no Dock icon); with arguments it is the CLI. Both call the same functions below.
//
// It orchestrates what already exists: the installer's registry (projects.tsv) is the list of
// instances, each stack's process-compose socket gives its state, the project's own
// `mise run up/down` starts and stops it, and the bundled installer script creates one.
// Built with `swiftc` by installer/macos/build.sh (no Xcode project).
import AppKit
import CryptoKit
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
let appVersion = info["CFBundleShortVersionString"] as? String ?? "0"
/// Fyso Biz origin; FYSO_BIZ_URL points at a local Biz (http only on loopback, as the extension).
let defaultBizOrigin = "https://fyso.biz"
let bizOrigin = env["FYSO_BIZ_URL"] ?? defaultBizOrigin
let bizDir = fysoHome + "/biz"
/// The session the app received, in the Biz extension's own oauth.json format (D86 hand-off).
let bizGrantFile = bizDir + "/oauth.json"
let bizAccountFile = bizDir + "/account.json"
/// GitHub Releases of this public repository (D86); FYSO_UPDATE_URL overrides it (tests).
let releasesURL = env["FYSO_UPDATE_URL"] ?? "https://api.github.com/repos/fyso-dev/agentic-framework/releases?per_page=30"

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
    let folder = URL(fileURLWithPath: raw).resolvingSymlinksInPath().standardizedFileURL.path
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
    guard let item = instance(folder: folder, port: nil) else { return (nil, false) }
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
    let folder = URL(fileURLWithPath: (q as NSString).expandingTildeInPath).resolvingSymlinksInPath().standardizedFileURL.path
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

/// Stacks running on this Mac that are not in the registry (e.g. started from a clone): each
/// owns /tmp/fyso-<slug>-<port>.sock and its process-compose runs in the project folder, so the
/// folder is the socket owner's cwd (the way the SwiftBar plugin, D34, found them).
/// Socket → owner folder, kept while the socket file is unchanged (lsof is slow; the menu refreshes every 5 s).
var socketOwners: [String: (Date, String?)] = [:]

func socketOwner(_ socket: String) -> String? {
    let changed = (try? FileManager.default.attributesOfItem(atPath: socket))?[.modificationDate] as? Date ?? .distantPast
    if let (date, folder) = socketOwners[socket], date == changed { return folder }
    var found: String?
    let (_, pids) = run("/usr/sbin/lsof", ["-t", socket], timeout: 3)
    for pid in pids.split(separator: "\n") {
        let (_, cwd) = run("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], timeout: 3)
        if let line = cwd.split(separator: "\n").first(where: { $0.hasPrefix("n") }) { found = String(line.dropFirst()); break }
    }
    socketOwners[socket] = (changed, found)  // a stale socket (no owner) is not asked again either
    return found
}

func unregisteredRunning(_ list: [Instance]) -> [Instance] {
    var seen = Set(list.map(\.folder)), out: [Instance] = []
    let known = Set(list.map(\.socket))
    let names = (try? FileManager.default.contentsOfDirectory(atPath: "/tmp")) ?? []
    for name in names.sorted() where name.hasPrefix("fyso-") && name.hasSuffix(".sock") && !known.contains("/tmp/" + name) {
        let socket = "/tmp/" + name
        guard let folder = socketOwner(socket), let item = instance(folder: folder, port: nil),
              item.socket == socket, !seen.contains(item.folder) else { continue }
        seen.insert(item.folder); out.append(item)
    }
    return out
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
func runTask(_ item: Instance, _ task: String, echo: Bool = false) -> Int32 { runMise(item, ["run", task], label: task, echo: echo) }

/// Any `mise -C <folder> …` command with the login PATH, logged like runTask.
func runMise(_ item: Instance, _ args: [String], label: String, echo: Bool = false) -> Int32 {
    guard let mise = mise() else { return 127 }
    try? FileManager.default.createDirectory(atPath: item.folder + "/.data/logs", withIntermediateDirectories: true)
    if !FileManager.default.fileExists(atPath: item.log) { FileManager.default.createFile(atPath: item.log, contents: nil) }
    guard let log = FileHandle(forWritingAtPath: item.log) else { return 1 }
    log.seekToEndOfFile()
    let stamp = ISO8601DateFormatter().string(from: Date())
    log.write("\n[\(stamp)] $ mise \(args.joined(separator: " "))\n".data(using: .utf8)!)
    let p = Process(); p.executableURL = URL(fileURLWithPath: mise); p.arguments = ["-C", item.folder] + args
    p.currentDirectoryURL = URL(fileURLWithPath: item.folder)
    var e = env; e["PATH"] = loginPath; p.environment = e
    p.standardInput = FileHandle.nullDevice
    if echo { p.standardOutput = FileHandle.standardOutput; p.standardError = FileHandle.standardError }
    else { p.standardOutput = log; p.standardError = log }
    do { try p.run() } catch { return 1 }
    p.waitUntilExit()
    log.write("[\(ISO8601DateFormatter().string(from: Date()))] \(label): exit \(p.terminationStatus)\n".data(using: .utf8)!)
    log.closeFile()
    return p.terminationStatus
}

func openURL(_ url: String) { _ = run("/usr/bin/open", [url]) }

/// The browser, or (FYSO_TEST=1) a line on stdout that a test follows.
func showAuthorization(_ url: String) {
    if testMode { print("authorize: " + url); fflush(stdout) } else { openURL(url) }
}

/// What `create` did; the Biz steps are nil in the core edition.
struct Created { let item: Instance; var bizSession: Bool? = nil; var bizExtension: Bool? = nil }

/// The bundled installer (D35) creates the instance: the same form, workflow and registry write.
/// Blocks until it exits; a new registry entry becomes the current instance. The Biz edition then
/// hands its Fyso Biz session to the new project and installs the Biz extension there (D86).
func createInstance() -> Created? {
    // Biz: a session must be ready before the form, so the new project starts connected.
    if edition == "biz" && !bizSessionReady() { _ = try? bizLogin(open: showAuthorization) }
    if edition == "biz" && !bizSessionReady() { return nil }
    guard let item = runInstaller() else { return nil }
    guard edition == "biz" else { return Created(item: item) }
    var result = Created(item: item)
    result.bizSession = handOffBizSession(to: item)
    result.bizExtension = installBizExtension(item) == 0
    return result
}

func runInstaller() -> Instance? {
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

// MARK: - HTTP (URLSession, no redirects: every endpoint must answer itself)

final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
let httpSession = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)

func formEncode(_ values: [String: String]) -> String {
    var allowed = CharacterSet.alphanumerics; allowed.insert(charactersIn: "-._~")
    return values.sorted { $0.key < $1.key }
        .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }.joined(separator: "&")
}

/// Blocking request; returns the status (0 when unreachable) and the parsed JSON body.
func http(_ url: String, method: String = "GET", form: [String: String]? = nil, json: [String: Any]? = nil,
          bearer: String? = nil) -> (Int, Any?) {
    guard let u = URL(string: url) else { return (0, nil) }
    var req = URLRequest(url: u, timeoutInterval: 15)
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    req.setValue("Fyso/\(appVersion)", forHTTPHeaderField: "User-Agent")
    if let bearer { req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
    if let form { req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type"); req.httpBody = formEncode(form).data(using: .utf8) }
    if let json { req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.httpBody = try? JSONSerialization.data(withJSONObject: json) }
    let done = DispatchSemaphore(value: 0)
    var result: (Int, Any?) = (0, nil)
    httpSession.dataTask(with: req) { data, response, _ in
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        result = (status, data.flatMap { try? JSONSerialization.jsonObject(with: $0) })
        done.signal()
    }.resume()
    done.wait()
    return result
}

func readJSON(_ path: String) -> [String: Any]? {
    FileManager.default.contents(atPath: path).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
}

/// Owner-only file in an owner-only folder, written atomically (tokens never leave such files).
func writePrivate(_ path: String, _ value: [String: Any]) -> Bool {
    let fm = FileManager.default, dir = (path as NSString).deletingLastPathComponent
    guard (try? fm.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])) != nil,
          let data = try? JSONSerialization.data(withJSONObject: value) else { return false }
    let tmp = path + ".\(getpid()).tmp"
    guard fm.createFile(atPath: tmp, contents: data, attributes: [.posixPermissions: 0o600]) else { return false }
    return rename(tmp, path) == 0
}

// MARK: - Fyso Biz sign-in (D86): OAuth 2.1 for native apps, the mechanism Biz already offers
//
// Biz's authorization server (Cloudflare workers-oauth-provider) supports dynamic client
// registration, PKCE S256 and RFC 8252 loopback redirects (any port on 127.0.0.1). The app
// registers one public client per origin, opens the browser at Biz's authorize page and receives
// the code on a one-shot listener on 127.0.0.1. The grant is stored in the extension's own format.

enum BizError: String, Error { case connection_failed, oauth_not_supported, registration_failed, timeout, access_denied, invalid_callback }

func bizOriginValid(_ origin: String) -> Bool {
    guard let u = URLComponents(string: origin), let host = u.host, u.user == nil, u.query == nil, (u.path.isEmpty || u.path == "/") else { return false }
    return u.scheme == "https" || (u.scheme == "http" && ["localhost", "127.0.0.1"].contains(host))
}

func bizMetadata() throws -> [String: Any] {
    guard bizOriginValid(bizOrigin) else { throw BizError.oauth_not_supported }
    let (code, body) = http(bizOrigin + "/.well-known/oauth-authorization-server")
    guard code != 0 else { throw BizError.connection_failed }
    guard let meta = body as? [String: Any],
          ((meta["code_challenge_methods_supported"] as? [String]) ?? []).contains("S256") else { throw BizError.oauth_not_supported }
    for key in ["authorization_endpoint", "token_endpoint", "registration_endpoint"] {
        guard let v = meta[key] as? String, let u = URL(string: v), "\(u.scheme ?? "")://\(u.host ?? "")\(u.port.map { ":\($0)" } ?? "")" == bizOrigin
        else { throw BizError.oauth_not_supported }
    }
    return meta
}

let bizRedirect = "http://127.0.0.1/callback"  // registered without a port; RFC 8252 allows any at runtime

func bizClient(_ meta: [String: Any]) throws -> String {
    let file = bizDir + "/client.json"
    if let saved = readJSON(file), saved["origin"] as? String == bizOrigin, let id = saved["clientId"] as? String { return id }
    let (code, body) = http(meta["registration_endpoint"] as! String, method: "POST", json: [
        "client_name": edition == "biz" ? "Fyso Biz for Mac" : "Fyso for Mac", "redirect_uris": [bizRedirect],
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "token_endpoint_auth_method": "none"])
    guard code != 0 else { throw BizError.connection_failed }
    guard let id = (body as? [String: Any])?["client_id"] as? String else { throw BizError.registration_failed }
    _ = writePrivate(file, ["origin": bizOrigin, "clientId": id])
    return id
}

func base64url(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}
func randomToken(_ bytes: Int) -> String {
    var buf = [UInt8](repeating: 0, count: bytes)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes, &buf)
    return base64url(Data(buf))
}

/// One-shot HTTP listener on 127.0.0.1 (ephemeral port). Answers /callback with a short page.
final class Loopback {
    let fd: Int32, port: Int
    init?() {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var addr = sockaddr_in(); addr.sin_family = sa_family_t(AF_INET); addr.sin_port = 0
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        let ok = withUnsafeMutablePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, len) == 0 && listen(fd, 4) == 0 && getsockname(fd, $0, &len) == 0 }
        }
        guard ok else { close(fd); return nil }
        self.fd = fd
        port = Int(UInt16(bigEndian: addr.sin_port))
    }
    deinit { close(fd) }

    /// Query items of the first GET /callback, or nil on timeout.
    func wait(timeout: TimeInterval, page: String) -> [String: String]? {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            var p = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
            guard poll(&p, 1, 500) > 0 else { continue }
            let c = accept(fd, nil, nil); guard c >= 0 else { continue }
            var tv = timeval(tv_sec: 5, tv_usec: 0)
            setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
            var buf = [UInt8](repeating: 0, count: 8192)
            let n = recv(c, &buf, buf.count, 0)
            let head = n > 0 ? String(decoding: buf[0..<n], as: UTF8.self) : ""
            let target = head.split(separator: "\r\n").first?.split(separator: " ").dropFirst().first.map(String.init) ?? ""
            let comps = URLComponents(string: target)
            let isCallback = head.hasPrefix("GET ") && comps?.path == "/callback"
            let body = isCallback ? page : "Not found"
            let reply = "HTTP/1.1 \(isCallback ? "200 OK" : "404 Not Found")\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n\(body)"
            _ = reply.withCString { send(c, $0, strlen($0), 0) }
            close(c)
            if isCallback {
                var out: [String: String] = [:]
                for item in comps?.queryItems ?? [] { out[item.name] = item.value ?? "" }
                return out
            }
        }
        return nil
    }
}

struct BizAccount { let name: String; let email: String }

func bizAccount() -> BizAccount? {
    guard let a = readJSON(bizAccountFile), a["origin"] as? String == bizOrigin else { return nil }
    return BizAccount(name: a["name"] as? String ?? "", email: a["email"] as? String ?? "")
}
/// A session that is waiting to be handed to the next instance.
func bizSessionReady() -> Bool { readJSON(bizGrantFile)?["origin"] as? String == bizOrigin }

/// Sign in through the browser and keep the grant for the next instance. `open` shows the
/// authorization page (the browser; tests print it). Blocks until the callback or the timeout.
func bizLogin(open: (String) -> Void, timeout: TimeInterval = 300) throws -> BizAccount? {
    let meta = try bizMetadata(), clientId = try bizClient(meta)
    guard let loop = Loopback() else { throw BizError.connection_failed }
    let redirect = "http://127.0.0.1:\(loop.port)/callback"
    let verifier = randomToken(32), state = randomToken(24)
    let challenge = base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    var url = URLComponents(string: meta["authorization_endpoint"] as! String)!
    url.queryItems = [URLQueryItem(name: "response_type", value: "code"), URLQueryItem(name: "client_id", value: clientId),
                      URLQueryItem(name: "redirect_uri", value: redirect), URLQueryItem(name: "scope", value: "mcp perfil"),
                      URLQueryItem(name: "state", value: state), URLQueryItem(name: "code_challenge", value: challenge),
                      URLQueryItem(name: "code_challenge_method", value: "S256")]
    open(url.url!.absoluteString)
    let page = "<!doctype html><meta charset=utf-8><title>Fyso</title><body style=\"font:16px -apple-system,sans-serif;margin:4em;text-align:center\"><p>\(t("biz.page_done"))</p></body>"
    guard let q = loop.wait(timeout: timeout, page: page) else { throw BizError.timeout }
    guard q["state"] == state else { throw BizError.invalid_callback }
    if q["error"] != nil { throw BizError.access_denied }
    guard let code = q["code"], !code.isEmpty, code.count < 2000 else { throw BizError.invalid_callback }
    let (status, body) = http(meta["token_endpoint"] as! String, method: "POST", form: [
        "grant_type": "authorization_code", "code": code, "redirect_uri": redirect, "client_id": clientId, "code_verifier": verifier])
    guard let tok = body as? [String: Any], let access = tok["access_token"] as? String,
          (tok["token_type"] as? String)?.lowercased() == "bearer" else { throw status == 0 ? BizError.connection_failed : BizError.access_denied }
    let now = Date()
    let expires = max(60, (tok["expires_in"] as? Double) ?? 3600)
    var grant: [String: Any] = ["origin": bizOrigin, "clientId": clientId, "accessToken": access,
                                "expiresAt": Int((now.timeIntervalSince1970 + expires) * 1000),
                                "connectedAt": ISO8601DateFormatter().string(from: now)]
    grant["refreshToken"] = tok["refresh_token"] as? String ?? NSNull()
    guard writePrivate(bizGrantFile, grant) else { throw BizError.connection_failed }
    // Who signed in, for the menu (scope perfil). Optional: Biz may not answer it.
    var account: [String: Any] = ["origin": bizOrigin, "name": "", "email": ""]
    if let ui = meta["userinfo_endpoint"] as? String, let info = http(ui, bearer: access).1 as? [String: Any] {
        account["name"] = (info["name"] as? String) ?? (info["nombre"] as? String) ?? ""
        account["email"] = info["email"] as? String ?? ""
    }
    _ = writePrivate(bizAccountFile, account)
    return bizAccount()
}

func bizLogout() {
    try? FileManager.default.removeItem(atPath: bizGrantFile)
    try? FileManager.default.removeItem(atPath: bizAccountFile)
}

/// Move the app's session into the new project (`.data/ext/biz/oauth.json`, read by the Biz
/// extension). Biz rotates refresh tokens, so one grant cannot serve two holders: the app gives
/// it away and signs in again before the next instance.
func handOffBizSession(to item: Instance) -> Bool {
    guard bizSessionReady(), let grant = readJSON(bizGrantFile) else { return false }
    guard writePrivate(item.folder + "/.data/ext/biz/oauth.json", grant) else { return false }
    try? FileManager.default.removeItem(atPath: bizGrantFile)
    return true
}

/// Install fyso-ext-biz (public catalog id `biz`) in the project. The production origin uses the
/// panel's own install path (one commit, services reloaded); another origin passes biz_url.
func installBizExtension(_ item: Instance) -> Int32 {
    let answers = item.folder + "/.copier-answers.ext-biz.yml"
    if FileManager.default.fileExists(atPath: answers) { return 0 }
    let code = bizOrigin == defaultBizOrigin
        ? runMise(item, ["exec", "--", "framework/scripts/ext.sh", "apply", "add", "biz"], label: "ext add biz")
        : runMise(item, ["run", "ext:add", "biz", "--", "--defaults", "-d", "biz_url=\(bizOrigin)"], label: "ext add biz")
    guard code != 0, FileManager.default.fileExists(atPath: answers) else { return code }
    // Installed, but its connection hook failed: on a stack that has just started (and reloads
    // its gateway during the install) the first Bot Architect call can lose its answer. Its hook
    // is idempotent; run it once more.
    return runMise(item, ["exec", "--", "framework/scripts/connect-extensions.sh"], label: "connect extensions")
}

// MARK: - Updates (D86): the newest `macos-v<version>` release of this repository

struct Update { let version: String; let download: String; let page: String }

func newer(_ a: String, than b: String) -> Bool {
    let x = a.split(separator: ".").map { Int($0) ?? 0 }, y = b.split(separator: ".").map { Int($0) ?? 0 }
    for i in 0..<max(x.count, y.count) {
        let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
        if l != r { return l > r }
    }
    return false
}

/// nil when up to date or unreachable. The dmg is opened in the browser: its download carries the
/// quarantine flag, so Gatekeeper checks the notarized signature before anything runs.
func checkUpdate() -> Update? { (try? findUpdate()) ?? nil }  // the menu stays quiet when offline

struct Unreachable: Error {}
func findUpdate() throws -> Update? {
    guard let releases = http(releasesURL).1 as? [[String: Any]] else { throw Unreachable() }
    let dmg = edition == "biz" ? "Fyso-Biz.dmg" : "Fyso.dmg"
    var best: Update?
    for r in releases where r["draft"] as? Bool != true && r["prerelease"] as? Bool != true {
        guard let tag = r["tag_name"] as? String, tag.hasPrefix("macos-v") else { continue }
        let version = String(tag.dropFirst(7))
        guard newer(version, than: best?.version ?? appVersion),
              let asset = (r["assets"] as? [[String: Any]])?.first(where: { $0["name"] as? String == dmg }),
              let url = asset["browser_download_url"] as? String else { continue }
        best = Update(version: version, download: url, page: r["html_url"] as? String ?? url)
    }
    return best
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
        let others = unregisteredRunning(list)
        if rest.contains("--json") {
            func row(_ i: Instance, _ registered: Bool) -> [String: Any] {
                ["name": i.name, "slug": i.slug, "folder": i.folder, "port": i.port, "panel": i.panelURL,
                 "state": state(i).rawValue, "current": i.folder == current, "registered": registered]
            }
            let rows = list.map { row($0, true) } + others.map { row($0, false) }
            let data = try! JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys])
            say(String(data: data, encoding: .utf8)!); return 0
        }
        if list.isEmpty && others.isEmpty { say(t("cli.no_instances")); return 0 }
        let head = t("cli.header").split(separator: "|").map(String.init)
        let width = max(head[0].count - 3, (list + others).map(\.name.count).max() ?? 0)
        func pad(_ s: String, _ n: Int) -> String { s + String(repeating: " ", count: max(0, n - s.count)) }
        say(pad(head[0], width + 3) + "  " + pad(head[1], 14) + pad(head[2], 7) + head[3])
        for item in list {
            let mark = item.folder == current ? " * " : "   "
            say(mark + pad(item.name, width) + "  " + pad(t("state." + state(item).rawValue), 14) + pad(item.port, 7) + item.panelURL)
        }
        for item in others {
            say(" + " + pad(item.name, width) + "  " + pad(t("state." + state(item).rawValue), 14) + pad(item.port, 7) + item.panelURL)
        }
        if !others.isEmpty { say("\n" + t("cli.unregistered_hint", ["command": "fyso add \"\(others[0].folder)\""])) }
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
        if edition == "biz" && !bizSessionReady() { say(t("cli.biz_login_first")) }
        guard let created = createInstance() else {
            return fail(edition == "biz" && !bizSessionReady() ? t("cli.biz_login_needed") : t("cli.create_failed", ["log": installerLog]))
        }
        say(t("cli.created", ["name": created.item.name]))
        if created.bizSession == false { return fail(t("cli.biz_handoff_failed")) }
        if created.bizExtension == false { return fail(t("cli.biz_ext_failed", ["log": created.item.log])) }
        if created.bizExtension == true { say(t("cli.biz_ready", ["name": created.item.name])) }
        return 0
    case "add":
        let folder = rest.first ?? FileManager.default.currentDirectoryPath
        let (item, added) = register(folder: folder)
        guard let item else { return fail(t("cli.not_project", ["folder": folder])) }
        say(t(added ? "cli.added" : "cli.already", ["name": item.name, "port": item.port])); return 0
    case "biz-login", "login":
        say(t("cli.biz_waiting"))
        do {
            let account = try bizLogin(open: showAuthorization)
            say(t("cli.biz_signed_in", ["account": account.map { $0.email.isEmpty ? $0.name : $0.email } ?? bizOrigin])); return 0
        } catch let e as BizError { return fail(t("biz.error." + e.rawValue)) } catch { return fail(t("biz.error.connection_failed")) }
    case "biz-logout", "logout":
        bizLogout(); say(t("cli.biz_signed_out")); return 0
    case "biz-status":
        guard let a = bizAccount() else { say(t("cli.biz_none")); return 3 }
        say(t("cli.biz_signed_in", ["account": a.email.isEmpty ? a.name : a.email]))
        say(t(bizSessionReady() ? "biz.session_ready" : "biz.session_used")); return 0
    case "update":
        let found: Update?
        do { found = try findUpdate() } catch { return fail(t("cli.update_unreachable")) }
        guard let u = found else { say(t("cli.up_to_date", ["version": appVersion])); return 0 }
        say(t("update.available", ["version": u.version]) + " — " + u.page)
        if !rest.contains("--check") { openURL(u.download) }
        return 0
    case "version", "--version":
        say("\(info["CFBundleName"] as? String ?? "Fyso") \(appVersion)"); return 0
    default:
        _ = fail(t("cli.unknown", ["name": command])); say(t("cli.usage")); return 2
    }
}

// MARK: - Menu bar app

/// First launch of the Biz edition: sign in at once (set before the model exists).
var bizOnboarding = false

final class Model: ObservableObject {
    struct Row: Identifiable { let item: Instance; let state: State; var id: String { item.id } }
    @Published var rows: [Row] = []
    @Published var others: [Row] = []  // running, not in the registry
    @Published var account: BizAccount?
    @Published var sessionReady = false
    @Published var signingIn = false
    @Published var update: Update?
    @Published var current: String?
    @Published var busy: [String: String] = [:]  // folder → "starting" | "stopping"
    @Published var creating = false
    @Published var loginItem = SMAppService.mainApp.status == .enabled
    private var timer: Timer?
    private let queue = DispatchQueue(label: "fyso.refresh")
    /// First launch of the core edition with no instance: open the create form (onboarding).
    private var onboarding = !testMode && edition != "biz" && !UserDefaults.standard.bool(forKey: "createOffered")

    private var updateTimer: Timer?

    init() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
        // Updates: at launch and once a day (D86). Tests check only with FYSO_UPDATE_URL.
        if !testMode || env["FYSO_UPDATE_URL"] != nil {
            checkForUpdate()
            updateTimer = Timer.scheduledTimer(withTimeInterval: 86_400, repeats: true) { [weak self] _ in self?.checkForUpdate() }
        }
    }

    func checkForUpdate() {
        DispatchQueue.global().async {
            let u = checkUpdate()
            DispatchQueue.main.async { self.update = u }
        }
    }

    func signIn(then next: (() -> Void)? = nil) {
        guard !signingIn else { return }
        signingIn = true
        DispatchQueue.global().async {
            var message: String
            do {
                let a = try bizLogin(open: showAuthorization)
                message = t("notify.signed_in", ["account": a.map { $0.email.isEmpty ? $0.name : $0.email } ?? bizOrigin])
            } catch let e as BizError { message = t("biz.error." + e.rawValue) } catch { message = t("biz.error.connection_failed") }
            notify(message)
            DispatchQueue.main.async { self.signingIn = false; self.refresh(); if bizSessionReady() { next?() } }
        }
    }

    func signOut() { bizLogout(); refresh() }

    func add(_ item: Instance) { register(folder: item.folder); refresh() }

    func refresh() {
        queue.async {
            let list = loadInstances()
            let rows = list.map { Row(item: $0, state: state($0)) }
            let others = unregisteredRunning(list).map { Row(item: $0, state: state($0)) }
            let current = currentFolder(list)
            let account = bizAccount(), ready = bizSessionReady()
            DispatchQueue.main.async {
                self.rows = rows; self.others = others; self.current = current
                self.account = account; self.sessionReady = ready
                self.loginItem = SMAppService.mainApp.status == .enabled
                if bizOnboarding {
                    bizOnboarding = false
                    if account == nil { self.signIn() }
                }
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
        // Biz: sign in first (browser), then the form opens by itself.
        if edition == "biz" && !bizSessionReady() { signIn { self.create() }; return }
        creating = true
        DispatchQueue.global().async {
            let created = createInstance()
            if let created {
                if created.bizExtension == false || created.bizSession == false { notify(t("notify.biz_failed", ["name": created.item.name])) }
                else { notify(t(created.bizExtension == true ? "notify.created_biz" : "notify.created", ["name": created.item.name])) }
            }
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
        if let u = model.update {
            Button(t("update.available", ["version": u.version])) { openURL(u.download) }
            Divider()
        }
        if edition == "biz" {
            if let a = model.account {
                Text(t("biz.signed_in", ["account": a.email.isEmpty ? a.name : a.email]))
                if !model.sessionReady { Button(model.signingIn ? t("biz.signing_in") : t("biz.login_again")) { model.signIn() }.disabled(model.signingIn) }
                Button(t("biz.logout")) { model.signOut() }
            } else {
                Button(model.signingIn ? t("biz.signing_in") : t("biz.login")) { model.signIn() }.disabled(model.signingIn)
                Text(t("biz.hint"))
            }
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
        if !model.others.isEmpty {
            Divider()
            Text(t("menu.unregistered"))
            ForEach(model.others) { row in
                Menu("\(row.item.name)  ·  \(t("state." + row.state.rawValue))") {
                    Button(t("inst.add")) { model.add(row.item) }
                    Button(t("inst.open")) { openURL(row.item.panelURL) }
                    Button(t("inst.folder")) { openURL(row.item.folder) }
                }
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
            if edition == "biz" { bizOnboarding = true }
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
