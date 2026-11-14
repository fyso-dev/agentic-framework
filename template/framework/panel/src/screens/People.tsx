import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

type Person = { id: string; name: string; content: string };
const prefix = "fyso-people/";
const idPattern = /^fyso-people\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pageUrl = (id: string) => `/api/dagu/wiki/page?path=${encodeURIComponent(id)}`;

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {credentials: "same-origin", cache: "no-store", ...init});
  if (response.status === 401) window.dispatchEvent(new Event("fyso-session-expired"));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}
async function readPerson(id: string): Promise<Person> {
  const data = await (await request(pageUrl(id))).json() as { content?: unknown };
  if (typeof data.content !== "string") throw new Error("Invalid person");
  const record = JSON.parse(data.content) as { version?: unknown; name?: unknown };
  if (record.version !== 1 || typeof record.name !== "string" || !record.name.trim()) throw new Error("Invalid person");
  return {id, name: record.name, content: data.content};
}
async function listPeople(): Promise<Person[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({flat: "true", prefix: prefix.slice(0, -1), page: String(page), perPage: "100"});
    const data = await (await request(`/api/dagu/wiki?${query}`)).json() as {items?: {id?: string}[]; pagination?: {hasNextPage?: boolean}};
    if (!Array.isArray(data.items) || typeof data.pagination?.hasNextPage !== "boolean") throw new Error("Invalid directory");
    ids.push(...data.items.map(item => item.id).filter((id): id is string => typeof id === "string" && idPattern.test(id)));
    if (!data.pagination.hasNextPage) return (await Promise.all(ids.map(readPerson))).sort((a,b) => a.name.localeCompare(b.name));
  }
  throw new Error("Directory exceeds page limit");
}
function content(name: string) { return JSON.stringify({version: 1, name}) + "\n"; }
const jsonHeaders = {"Content-Type": "application/json"};

export function People() {
  const {t} = useTranslation();
  const [people, setPeople] = useState<Person[] | null>(null), [error, setError] = useState("");
  const [editing, setEditing] = useState<Person | "new" | null>(null), [name, setName] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {let active = true;setPeople(null);listPeople().then(data => {if (active) setPeople(data);}).catch(() => {if (active) setError("error");});return () => {active = false;};}, [generation]);
  async function unchanged(person: Person) {
    try { return (await readPerson(person.id)).content === person.content; } catch { return false; }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); const value = name.trim(); if (!value || value.length > 80 || !editing || busy) return;
    setBusy(true);setError("");setNotice(false);
    try {
      if (editing === "new") {
        const id = prefix + crypto.randomUUID();
        await request("/api/dagu/wiki", {method:"POST", headers:jsonHeaders, body:JSON.stringify({id, content:content(value)})});
      } else {
        if (!await unchanged(editing)) {setError("changed");return;}
        await request(pageUrl(editing.id), {method:"PATCH", headers:jsonHeaders, body:JSON.stringify({content:content(value)})});
      }
      setEditing(null);setNotice(true);setGeneration(v => v + 1);
    } catch {setError("error");} finally {setBusy(false);}
  }
  async function remove(person: Person) {
    if (busy || !window.confirm(t("people.removeConfirm", {name: person.name}))) return;
    setBusy(true);setError("");setNotice(false);
    try {
      if (!await unchanged(person)) {setError("changed");return;}
      await request(pageUrl(person.id), {method:"DELETE"});setNotice(true);setGeneration(v => v + 1);
    } catch {setError("error");} finally {setBusy(false);}
  }
  return <main className="page page-wide people-page">
    <header className="page-head"><div><h1>{t("people.title")}</h1><p>{t("people.intro")}</p></div></header>
    <p className="mute">{t("people.shared")}</p>
    {error && <p role="alert" className="action-error">{t(`people.${error}`)} <button className="btn btn-sm btn-ghost" type="button" onClick={() => {setError("");setEditing(null);setGeneration(v => v + 1);}}>{t("common.retry")}</button></p>}
    {notice && <p role="status">{t("people.saved")}</p>}
    {!people ? (!error && <p role="status">{t("people.loading")}</p>) : <>
      {!people.length ? <p>{t("people.empty")}</p> : <ul className="people-list">{people.map(person => <li className="card people-row" key={person.id}>
        <span><strong>{person.name}</strong><small className="mute">{t("people.id")}: {person.id.slice(prefix.length)}</small></span>
        <span className="people-actions"><button className="btn btn-sm btn-ghost" type="button" disabled={busy} onClick={() => {setEditing(person);setName(person.name);setNotice(false);}}>{t("people.edit")}</button><button className="btn btn-sm btn-ghost" type="button" disabled={busy} onClick={() => void remove(person)}>{t("people.remove")}</button></span>
      </li>)}</ul>}
      {!editing && <button type="button" className="btn btn-pri" disabled={busy} onClick={() => {setEditing("new");setName("");setNotice(false);}}>{t("people.add")}</button>}
      {editing && <form className="card people-editor" onSubmit={save}>
        <h2>{t(editing === "new" ? "people.add" : "people.edit")}</h2>
        <label htmlFor="people-name">{t("people.name")}</label><input id="people-name" className="input" value={name} maxLength={80} required onChange={e => setName(e.target.value)} />
        <div className="people-actions"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => setEditing(null)}>{t("people.cancel")}</button><button type="submit" className="btn btn-pri" disabled={busy || !name.trim()}>{t("people.save")}</button></div>
      </form>}
    </>}
  </main>;
}
