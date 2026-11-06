// Bots: the list over team.yaml (draft vs file on disk) and the review/apply dialog.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Engine } from "../api/types";
import { IconBot, IconPlus } from "../components/Icons";
import { unappliedCount } from "../components/Layout";
import { Avatar, External, Modal } from "../components/ui";
import { go, href } from "../lib/router";
import type { BotState } from "../lib/team";
import { useStore } from "../store";
import { Preview } from "./Preview";
import { useEngineName } from "./Setup";


export function useEngineLabel() {
  const { t } = useTranslation();
  const { checkData } = useStore();
  return {
    engines: checkData?.engines ?? [],
    find: (id: string): Engine | undefined => checkData?.engines.find((e) => e.id === id),
    kind: (id: string) => {
      const e = checkData?.engines.find((x) => x.id === id);
      return e ? t(`bots.kind.${e.kind}`) : id || "—";
    },
  };
}

export function BotStatePill({ state }: { state: BotState }) {
  const { t } = useTranslation();
  if (state === "applied")
    return (
      <span className="dot-label">
        <span aria-hidden="true" className="dot" />
        {t("bots.state.applied")}
      </span>
    );
  const [cls, glyph] = state === "pending" ? ["pill-warn", "!"] : state === "new" ? ["pill-accent", "+"] : ["pill-down", "−"];
  return (
    <span className={`pill ${cls}`}>
      <span aria-hidden="true" className="glyph">{glyph}</span>
      {t(`bots.state.${state}`)}
    </span>
  );
}

export function Bots({ review }: { review: boolean }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const eng = useEngineLabel();
  const runtime = s.runtimeBots.data ?? null;
  const runtimeError = s.runtimeBots.status === "error";
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const unapplied = unappliedCount(s);
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const engineName = useEngineName();
  const available = eng.engines.filter((e) => e.ok).map(engineName);

  return (
    <main className="page" style={{ maxWidth: 880, gap: 16 }}>
      <div className="page-head">
        <div style={{ flex: "1 1 320px" }}>
          <h1>{t("bots.title")}</h1>
          <p>{t("bots.subtitle")}</p>
        </div>
        {s.rows.length > 0 && (
          <a href={href.newBot} className="btn btn-md btn-raised">
            <IconPlus size={14} />
            {t("bots.add")}
          </a>
        )}
      </div>

      {s.workingBots.some(bot => bot.name === "Bot Architect") && s.project.data && (
        <div className="card" style={{padding:16, display:"flex", gap:12, alignItems:"center", flexWrap:"wrap"}}>
          <p className="grow">{t("bots.architectHint")}</p>
          <External href={s.project.data.urls.omb} className="btn btn-md btn-pri">{t("bots.architectOpen")}</External>
        </div>
      )}

      {!s.mock && <section aria-label={t("bots.runtimeTitle")} style={{display:"grid", gap:12}}>
        <h2>{t("bots.runtimeTitle")}</h2>
        <p className="mute">{t("bots.runtimeHint")}</p>
        {runtimeError && <p role="alert" className="banner banner-down">{t("bots.runtimeError")}</p>}
        {runtime === null && !runtimeError && <p role="status">{t("bots.runtimeLoading")}</p>}
        {runtime?.length === 0 && <p>{t("bots.runtimeEmpty")}</p>}
        {runtime && runtime.length > 0 && <ul className="card list">{runtime.map(bot => <li key={bot.id}>
          <div className="row bot-row">
            <Avatar name={bot.name} />
            <div className="grow"><p style={{fontWeight:700}}>{bot.name}</p><p className="mute">{bot.title || "—"}</p></div>
            <span className="bot-model ellipsis">{bot.modelSelection?.model || "—"}</span>
            {s.project.data && <External href={s.project.data.urls.omb} className="btn btn-ghost">{t("bots.runtimeOpen")}</External>}
          </div>
        </li>)}</ul>}
      </section>}
      <h2>{t("bots.configurationTitle")}</h2>

      {s.team.status === "error" && (
        <div role="alert" className="banner banner-down">
          <p className="grow"><strong style={{ color: "var(--down)" }}>{t("common.loadError", { what: "team.yaml" })}</strong> {s.team.error}</p>
          <button type="button" className="btn btn-ghost" onClick={s.reload}>{t("common.retry")}</button>
        </div>
      )}

      {unapplied > 0 && (
        <div role="status" className="banner banner-warn">
          <span aria-hidden="true" className="glyph" style={{ color: "var(--warn)" }}>!</span>
          <p style={{ flex: "1 1 260px" }}>
            <strong style={{ color: "var(--warn)" }}>{t("bots.banner", { count: unapplied })}</strong> {t("bots.bannerBody")}
          </p>
          {s.draft && (
            <button type="button" className="link-btn" style={{ color: "var(--warn)" }} onClick={() => setConfirmDiscard(true)}>
              {t("bots.discard")}
            </button>
          )}
          <a href={href.review} className="btn btn-pri" style={{ height: 34, padding: "0 16px" }}>{t("bots.review")}</a>
        </div>
      )}

      {s.team.status === "loading" ? (
        <ul className="card list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="row fy-sk" aria-hidden="true">
              <span className="skel" style={{ width: 36, height: 36, borderRadius: 999 }} />
              <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="skel" style={{ width: "30%", height: 10 }} />
                <span className="skel" style={{ width: "50%", height: 8 }} />
              </span>
            </li>
          ))}
        </ul>
      ) : s.rows.length === 0 ? (
        <div className="card empty">
          <span aria-hidden="true" className="empty-icon"><IconBot size={22} /></span>
          <p style={{ fontWeight: 700, fontSize: 16 }}>{t("bots.emptyTitle")}</p>
          <p className="mute" style={{ maxWidth: 360 }}>{t("bots.emptyBody")}</p>
          <a href={href.newBot} className="btn btn-lg btn-pri" style={{ marginTop: 4 }}>+ {t("bots.add")}</a>
        </div>
      ) : (
        <ul className="card list">
          {s.rows.map(({ bot, state }) => {
            const inner = (
              <>
                <Avatar name={bot.name} />
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <p style={{ fontWeight: 700 }} className="ellipsis">{bot.name}</p>
                  <p className="mute ellipsis" style={{ fontSize: 13 }}>{bot.title || "—"}</p>
                </div>
                <span className="bot-engine"><span className="pill pill-outline">{eng.kind(bot.engine)}</span></span>
                <span className="bot-model ellipsis" title={bot.model}>{bot.modelId}</span>
                <span className="bot-state"><BotStatePill state={state} /></span>
                <span aria-hidden="true" className="chev" style={{ visibility: state === "deleted" ? "hidden" : undefined }}>›</span>
              </>
            );
            return (
              <li key={`${state}-${bot.index}-${bot.name}`}>
                {state === "deleted" ? (
                  <div className="row bot-row is-deleted">{inner}</div>
                ) : (
                  <a className="row bot-row" href={href.bot(bot.index)} aria-label={t("bots.edit", { name: bot.name })}>{inner}</a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="note">
        {available.length > 0 ? t("bots.enginesAvailable", { list: list.format(available) }) : t("bots.enginesUnknown")}{" "}
        <a href={href.setup}>{t("bots.enginesReview")}</a>
      </p>

      <Preview open={review} onClose={() => go(href.bots)} />

      <Modal open={confirmDiscard} onClose={() => setConfirmDiscard(false)} labelledBy="discard-t" className="small" role="alertdialog">
        <div className="modal-head"><h2 id="discard-t">{t("bots.discardTitle")}</h2></div>
        <div className="modal-body"><p className="mute">{t("bots.discardBody")}</p></div>
        <div className="modal-foot" style={{ justifyContent: "flex-end", borderTop: 0, paddingTop: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-danger" onClick={() => { s.setDraft(null); setConfirmDiscard(false); }}>{t("bots.discard")}</button>
        </div>
      </Modal>
    </main>
  );
}
