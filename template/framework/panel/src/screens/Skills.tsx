// Third-party skills (D64, docs/third-party-skills.md): find a skill in the project's
// sources or in the public directory, read its SKILL.md, origin and license, install it
// pinned to a commit, and confirm it after OpenMausBot's scan. Only a confirmed skill can
// be switched on, per agent, in the agent's profile. Everything runs through the
// fyso-skills-catalog and fyso-skills-install workflows.
// A SKILL.md is third-party text: it is shown as plain text, never rendered.
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DAGS, type SkillCatalog, type SkillHit, type SkillResult, type ThirdPartySkill } from "../api/types";
import { ActionError } from "../components/Action";
import { IconAlert, IconCheck, IconDownload, IconExternal, IconEye, IconLayers, IconRefresh, IconSearch, IconShieldCheck, IconTerminal, IconTrash, Spinner } from "../components/Icons";
import { CopyLine, Modal } from "../components/ui";
import { href } from "../lib/router";
import { useDaguAction, type Action } from "../lib/useDaguAction";
import { useStore } from "../store";

const short = (commit?: string) => (commit ? commit.slice(0, 12) : "");
const licenseOf = (k: { license?: string | null; licenseTitle?: string | null; licenseFile?: string | null }) =>
  k.license || k.licenseTitle || k.licenseFile || null;

/** What is open in the reader: a skill of a source (to install) or the installed copy (to confirm). */
type Reading = { kind: "source"; hit: SkillHit; update?: boolean } | { kind: "local"; name: string };

function Reader({ reading, onClose }: { reading: Reading; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const titleId = useId();
  const detail = useDaguAction<SkillCatalog>(s.backend, DAGS.skillsCatalog, "catalog");
  const change = useDaguAction<SkillResult>(s.backend, DAGS.skillsInstall, "result");
  const [read, setRead] = useState(false);
  const { start } = detail;
  const [initialReading] = useState(reading);
  // Read once when the reader opens (it is keyed by skill).
  useEffect(() => {
    void start(initialReading.kind === "local" ? { NAME: initialReading.name } : { SRC: initialReading.hit.src, SKILL: initialReading.hit.name, COMMIT: initialReading.hit.commit ?? "" });
  }, [start, initialReading]);
  const local = detail.output?.local, preview = detail.output?.preview;
  const shown = reading.kind === "local" ? local : preview;
  const busy = change.phase === "running";
  const done = change.phase === "ok" ? change.output : undefined;
  const run = async (params: Record<string, string>) => {
    const result = await change.start(params);
    if (result) s.reload();
    return result;
  };
  const warnings = local?.scan?.warnings ?? [];
  const extra = shown ? shown.files.filter((f) => f !== "SKILL.md").length : 0;
  return (
    <Modal open onClose={onClose} labelledBy={titleId}>
      <div className="modal-head">
        <h2 id={titleId}>{reading.kind === "local" ? reading.name : reading.hit.name}</h2>
        <button type="button" className="btn btn-sm btn-soft" onClick={onClose}>{t("common.close")}</button>
      </div>
      <div className="modal-body">
        {detail.phase === "running" && <p className="mute"><Spinner size={14} /> {t("skills.reading")}</p>}
        <ActionError action={detail as Action<unknown>} />
        {shown && (
          <>
            <p>{shown.description}</p>
            <dl className="sk-facts">
              <dt>{t("skills.origin")}</dt><dd className="mono">{shown.src}{shown.path ? ` · ${shown.path}` : ""}</dd>
              <dt>{t("skills.commit")}</dt><dd className="mono">{shown.commit}</dd>
              <dt>{t("skills.license")}</dt><dd>{licenseOf(shown) ?? <span style={{ color: "var(--fy-warn)" }}>{t("skills.noLicense")}</span>}{shown.licenseFile && shown.license ? ` · ${shown.licenseFile}` : ""}</dd>
            </dl>
            {shown?.licenseText && (
              <details><summary className="mute">{t("skills.licenseText")}</summary><pre className="sk-text">{shown.licenseText}</pre></details>
            )}
            {local && (local.state === "modified" ? (
              <div role="alert" className="banner banner-down"><p className="grow">{t("skills.modified")}</p></div>
            ) : !local.scan ? (
              <div role="status" className="banner banner-warn"><p className="grow">{t("skills.scanMissing")}</p>
                <button type="button" className="btn btn-sm btn-soft" disabled={busy} onClick={() => void run({ OP: "scan", NAME: local.name }).then((result) => { if (result) { change.reset(); void detail.start({ NAME: local.name }); } })}>{t("skills.scanRun")}</button>
              </div>
            ) : warnings.length > 0 ? (
              <div role="alert" className="banner banner-down">
                <div className="grow"><strong>{t("skills.scanWarnings")}</strong><ul style={{ margin: "6px 0 0 18px" }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
              </div>
            ) : (
              <p className="ap-tag ok" style={{ alignSelf: "flex-start" }}><IconShieldCheck size={14} />{t("skills.scanClean")}</p>
            ))}
            <p className="label">SKILL.md <span className="mute">· {t("skills.untrusted")}</span></p>
            <pre className="sk-text" tabIndex={0}>{shown.skillMd}</pre>
            {extra > 0 && (
              <details><summary className="mute">{t("skills.extraFiles", { count: extra })}</summary>
                <ul className="mono" style={{ margin: "6px 0 0 18px", fontSize: 12 }}>{shown.files.filter((f) => f !== "SKILL.md").map((f) => <li key={f}>{f}</li>)}</ul>
              </details>
            )}
          </>
        )}
        <ActionError action={change as Action<unknown>} />
        {done?.op === "add" && <output className="block">{t("skills.added", { name: done.name })}</output>}
        {done?.op === "update" && <output className="block">{t("skills.updated", { commit: short(done.to) })}</output>}
        {done?.op === "confirm" && <output className="block">{t("skills.confirmed", { name: done.name })} <a href={href.bots}>{t("skills.goBots")}</a></output>}
      </div>
      <div className="modal-foot">
        {reading.kind === "source" && reading.hit.url && (
          <a className="bd-ib" href={reading.hit.url} target="_blank" rel="noopener noreferrer" aria-label={t("skills.directoryPage")} data-tip={t("skills.directoryPage")}><IconExternal size={16} /></a>
        )}
        <span className="grow" />
        {reading.kind === "source" && preview && !done && (preview.installed && !reading.update ? (
          <span className="ap-tag ok"><IconCheck size={13} />{t("skills.installed")}</span>
        ) : (
          <button type="button" className="btn btn-pri" disabled={busy}
            onClick={() => void run({ OP: reading.update ? "update" : "add", NAME: preview.name, SRC: preview.src, SKILL: preview.name, COMMIT: preview.commit ?? "", SHA256: preview.sha256 })}>
            {busy ? <Spinner size={14} /> : <IconDownload size={16} />}{t(reading.update ? "skills.applyUpdate" : "skills.install")}
          </button>
        ))}
        {local && local.state === "review" && !done && (
          <>
            <label className="sk-read"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />{t("skills.iRead")}</label>
            <button type="button" className="btn btn-pri" disabled={busy || !read}
              onClick={() => void run({ OP: "confirm", NAME: local.name, SHA256: local.sha256 })}>
              {busy ? <Spinner size={14} /> : <IconShieldCheck size={16} />}{t(warnings.length ? "skills.confirmAnyway" : "skills.confirm")}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function InstalledCard({ skill, onRead, onUpdate }: { skill: ThirdPartySkill; onRead: () => void; onUpdate: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const change = useDaguAction<SkillResult>(s.backend, DAGS.skillsInstall, "result");
  const [removing, setRemoving] = useState(false);
  const busy = change.phase === "running";
  const run = async (params: Record<string, string>) => {
    if (await change.start(params)) s.reload();
  };
  const result = change.phase === "ok" ? change.output : undefined;
  const ready = skill.state === "ready";
  return (
    <li className="ap-ext">
      <div className="ap-ext-head">
        <span aria-hidden="true" className="ap-ic"><IconLayers size={22} /></span>
        <div className="grow">
          <h3>{skill.name}</h3>
          <p className="sub mono" data-tip={t("skills.origin")}>{skill.src}</p>
        </div>
        <span className={`ap-tag ${ready ? "ok" : "down"}`} data-tip={t(`skills.stateTip.${skill.state}`)}>
          {ready ? <IconCheck size={13} /> : <IconAlert size={13} />}{t(`skills.state.${skill.state}`)}
        </span>
      </div>
      <p className="sub">{skill.description}</p>
      <ul className="sk-chips">
        <li className="ap-tag mono" data-tip={t("skills.commitTip", { commit: skill.commit })}>{short(skill.commit)}</li>
        <li className="ap-tag" data-tip={t("skills.license")}>{licenseOf(skill) ?? t("skills.noLicense")}</li>
        {skill.bots.length > 0 && <li className="ap-tag acc" data-tip={skill.bots.join(", ")}>{t("skills.onFor", { count: skill.bots.length })}</li>}
      </ul>
      <div className="ap-foot">
        <button type="button" className={`btn btn-sm ${ready ? "btn-soft" : "btn-pri"}`} onClick={onRead}><IconEye size={15} />{t(ready ? "skills.read" : "skills.review")}</button>
        <span className="grow" />
        <button type="button" className="bd-ib" disabled={busy} aria-label={t("skills.update")} data-tip={t("skills.updateTip")} onClick={onUpdate}>
          {busy ? <Spinner size={16} /> : <IconRefresh size={18} />}
        </button>
        {removing ? (
          <button type="button" className="btn btn-sm btn-soft" style={{ color: "var(--fy-down)" }} disabled={busy} onClick={() => void run({ OP: "remove", NAME: skill.name })}>{t("skills.removeConfirm")}</button>
        ) : (
          <button type="button" className="bd-ib" disabled={busy || skill.bots.length > 0} aria-label={t("skills.remove")}
            data-tip={skill.bots.length ? t("skills.removeBlocked") : t("skills.remove")} onClick={() => setRemoving(true)}><IconTrash size={18} /></button>
        )}
      </div>
      {result?.op === "update" && <output className="block">{result.changed ? t("skills.updated", { commit: short(result.to) }) : t("skills.current")}</output>}
      <ActionError action={change as Action<unknown>} />
    </li>
  );
}

export function SkillsTab() {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const catalog = useDaguAction<SkillCatalog>(s.backend, DAGS.skillsCatalog, "catalog");
  const [query, setQuery] = useState("");
  const [reading, setReading] = useState<Reading | null>(null);
  const list = s.skills.data ?? [];
  const data = catalog.output?.skills ? catalog.output : undefined;
  const searching = catalog.phase === "running";
  const num = new Intl.NumberFormat(i18n.language);
  return (
    <div role="tabpanel" id="apps-panel-skills" aria-labelledby="apps-tab-skills">
      <section aria-label={t("skills.installedTitle")}>
        <h2 className="ap-cap">{t("skills.installedTitle")} {s.skills.status === "ok" && <span className="n">{list.length}</span>}</h2>
        {s.skills.status === "error" ? (
          <div role="alert" className="banner banner-down">
            <p className="grow"><strong style={{ color: "var(--fy-down)" }}>{t("common.loadError", { what: "skills.json" })}</strong> {s.skills.error}</p>
          </div>
        ) : list.length > 0 ? (
          <ul className="ap-grid wide">{list.map((k) => <InstalledCard key={k.name} skill={k} onRead={() => setReading({ kind: "local", name: k.name })} onUpdate={() => setReading({ kind: "source", update: true, hit: { name: k.name, src: k.src, origin: "source", installed: true } })} />)}</ul>
        ) : (
          <p className="ap-empty"><strong>{t("skills.emptyTitle")}</strong> <span className="mute">{t("skills.emptyHint")}</span></p>
        )}
      </section>

      <section aria-label={t("skills.findTitle")}>
        <form className="ap-cat-head" onSubmit={(e) => { e.preventDefault(); void catalog.start({ QUERY: query.trim() }); }}>
          <h2 className="ap-cap">{t("skills.findTitle")} {data && <span className="n">{data.skills?.length}</span>}</h2>
          <span className="grow" />
          <label className="ap-search">
            <IconSearch size={16} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("skills.search")} aria-label={t("skills.searchLabel")} />
          </label>
          <button type="submit" className="btn btn-sm btn-soft" disabled={searching}>{searching ? <Spinner size={14} /> : <IconSearch size={15} />}{t("skills.searchRun")}</button>
        </form>
        <p className="hint">{t("skills.searchHint")}</p>
        <ActionError action={catalog as Action<unknown>} />
        {data?.sources?.filter((c) => c.error).map((c) => (
          <div key={c.source} role="alert" className="banner banner-down"><p className="grow">{t("skills.sourceError", { name: c.source, error: c.error })}</p></div>
        ))}
        {!data ? null : data.skills?.length === 0 ? (
          <p className="ap-empty mute">{t("skills.noMatch")}</p>
        ) : (
          <ul className="ap-grid wide">
            {data.skills?.map((hit) => (
              <li key={`${hit.src}/${hit.name}`} className="ap-ext">
                <div className="ap-ext-head">
                  <span aria-hidden="true" className="ap-ic"><IconLayers size={22} /></span>
                  <div className="grow">
                    <h3>{hit.name}</h3>
                    <p className="sub mono">{hit.src}</p>
                  </div>
                  {hit.installed && <span className="ap-tag ok"><IconCheck size={13} />{t(hit.update ? "skills.updateAvailable" : "skills.installed")}</span>}
                </div>
                {hit.description && <p className="sub">{hit.description}</p>}
                <div className="ap-foot">
                  <span className="ap-tag" data-tip={t(`skills.originTip.${hit.origin}`)}>{t(`skills.originTag.${hit.origin}`)}</span>
                  {licenseOf(hit) && <span className="ap-tag" data-tip={t("skills.license")}>{licenseOf(hit)}</span>}
                  {hit.installs !== undefined && <span className="ap-tag" data-tip={t("skills.installsTip")}>{num.format(hit.installs)}</span>}
                  <span className="grow" />
                  <button type="button" className="btn btn-sm btn-soft" onClick={() => setReading({ kind: "source", hit })}><IconEye size={15} />{t("skills.read")}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="ap-term">
        <summary><IconTerminal size={16} />{t("market.terminal")}</summary>
        <div className="ap-term-body">
          <CopyLine text="mise run skills:search pdf" />
          <CopyLine text="mise run skills:add anthropics/skills brand-guidelines" />
          <CopyLine text="mise run skills:list" />
          <p className="mute">{t("skills.terminalNote")}</p>
        </div>
      </details>

      {reading && <Reader key={reading.kind === "local" ? reading.name : `${reading.hit.src}/${reading.hit.name}`} reading={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
