import { BUSES, getAudioSettings, play, setAudioSettings, type Bus } from "../audio/engine";
import { SFX, SFX_CATEGORIES, SFX_IDS, type SfxId } from "../audio/library";
import { KEY_PRESETS } from "../audio/keyPress";
import { randomVoiceParams, type VoiceParams } from "../audio/voice";
import { formatNumber, t, type MessageKey } from "../i18n";
import { h } from "./dom";

const BUS_SAMPLE: Record<Bus, SfxId> = {
  ui: "ui.click",
  world: "shop.doorBell",
  voice: "voice.talk",
  keyboard: "kb.thock",
};

function modal(id: string, title: string, body: HTMLElement[], onClose: () => void, closeLabel: string) {
  document.getElementById(id)?.remove();
  play("ui.open");
  const close = () => {
    play("ui.close");
    el.remove();
    onClose();
  };
  const el = h(
    "div",
    { class: "modal-backdrop", id, onclick: (e: Event) => e.target === el && close() },
    h(
      "div",
      { class: "modal modal-wide", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("h2", {}, title),
      ...body,
      h("div", { class: "row" }, h("button", { class: "btn btn-primary", id: `${id}-close`, onclick: close }, closeLabel)),
    ),
  );
  document.body.append(el);
  return el;
}

export function openSettings(onClose: () => void = () => {}) {
  const s = getAudioSettings();
  let sampleTimer = 0;
  const slider = (label: string, value: number, onInput: (v: number) => void, id: string) =>
    h(
      "label",
      { class: "slider" },
      h("span", {}, label),
      h("input", {
        type: "range",
        min: 0,
        max: 100,
        value: Math.round(value * 100),
        id,
        oninput: (e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100),
      }),
    );
  const sample = (id: SfxId) => {
    clearTimeout(sampleTimer);
    sampleTimer = window.setTimeout(() => play(id), 120);
  };
  modal(
    "settings",
    t("settings.title"),
    [
      h("h3", {}, t("settings.audio")),
      slider(t("settings.master"), s.master, (v) => (setAudioSettings({ master: v }), sample("ui.confirm")), "vol-master"),
      ...BUSES.map((b) =>
        slider(t(`settings.bus.${b}` as MessageKey), s[b], (v) => (setAudioSettings({ [b]: v }), sample(BUS_SAMPLE[b])), `vol-${b}`),
      ),
      h(
        "label",
        { class: "check" },
        h("input", {
          type: "checkbox",
          id: "vol-mute",
          checked: s.muted,
          onchange: (e: Event) => {
            setAudioSettings({ muted: (e.target as HTMLInputElement).checked });
            play("ui.toggle");
          },
        }),
        h("span", {}, t("settings.mute")),
      ),
    ],
    onClose,
    t("settings.close"),
  );
}

/** Dev tool: play every sound, hear the variations, try customer voices and key sounds. */
export function openSoundBoard() {
  let voice: VoiceParams = randomVoiceParams(Math.random);
  const info = h("p", { class: "muted" });
  const showVoice = () =>
    (info.textContent = t("soundBoard.voiceInfo", {
      pitch: Math.round(voice.pitch),
      formant: formatNumber(voice.formant, 2),
      speed: formatNumber(voice.speed, 2),
    }));
  showVoice();

  const sections = SFX_CATEGORIES.map((cat) =>
    h(
      "section",
      { class: "sb-section" },
      h("h3", {}, t(`sfx.cat.${cat}` as MessageKey)),
      cat === "customer" &&
        h("div", {}, h("button", { class: "btn btn-small", onclick: () => ((voice = randomVoiceParams(Math.random)), showVoice(), play("voice.talk", { params: { voice } })) }, t("soundBoard.newVoice")), info),
      h(
        "div",
        { class: "sb-grid" },
        ...SFX_IDS.filter((id) => SFX[id].category === cat).map((id) =>
          h(
            "button",
            {
              class: "btn btn-small sb-btn",
              "data-sfx": id,
              onclick: () => play(id, { params: cat === "customer" ? { voice } : {} }),
            },
            t(`sfx.${id}` as MessageKey),
          ),
        ),
      ),
    ),
  );

  // Typing test: every real key press plays the selected keyboard preset.
  let preset: keyof typeof KEY_PRESETS = "thock";
  const presetSel = h(
    "select",
    { class: "sb-select", onchange: (e: Event) => (preset = (e.target as HTMLSelectElement).value as typeof preset) },
    ...(Object.keys(KEY_PRESETS) as (keyof typeof KEY_PRESETS)[]).map((k) => h("option", { value: k }, t(`sfx.kb.${k}` as MessageKey))),
  );
  const typeBox = h("input", {
    class: "sb-type",
    placeholder: t("soundBoard.typeTest"),
    onkeydown: (e: KeyboardEvent) => {
      if (e.repeat) return;
      const big = e.key === " " || e.key === "Enter" || e.key === "Shift" || e.key === "Backspace";
      play(big ? "kb.spacebar" : `kb.${preset}`, { params: big ? { profile: KEY_PRESETS[preset] } : {} });
    },
  });

  modal(
    "sound-board",
    t("soundBoard.title"),
    [h("p", { class: "muted" }, t("soundBoard.hint")), h("div", { class: "sb-type-row" }, presetSel, typeBox), h("div", { class: "sb-scroll" }, ...sections)],
    () => {},
    t("soundBoard.close"),
  );
}
