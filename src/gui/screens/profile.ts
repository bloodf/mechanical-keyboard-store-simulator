/** Your name and your workshop's name (printed on the desk mat). */
import { cleanName, NAME_MAX, STORE_NAME_MAX } from "../../data/names";
import { t } from "../../i18n";
import { C, S, T } from "../theme";
import type { Ui } from "../ui";
import { button, H_CENTER, label, stack, textInput, V_BOTTOM } from "../widgets";

export interface ProfileResult {
  name: string;
  storeName: string;
}

export function showProfileForm(ui: Ui, o: { first: boolean; name: string; storeName: string; onStoreName?: (n: string) => void; onDone: (p: ProfileResult) => void; onCancel?: () => void }) {
  let name = o.name;
  let store = o.storeName;
  return ui.modal({ w: 520, h: 470, name: "profile", dismissable: !o.first, onClose: o.onCancel }, (p, close) => {
    const col = stack({ w: "86%", y: S.xl, ha: H_CENTER, spacing: S.sm });
    col.addControl(label(o.first ? t("profile.createTitle") : t("profile.editTitle"), { size: T.h2, weight: 700, align: H_CENTER }));
    col.addControl(label(t("profile.name"), { size: T.small, weight: 700, color: C.inkSoft, h: 22 }));
    col.addControl(textInput(name, { maxLength: NAME_MAX, placeholder: t("profile.namePlaceholder"), testId: "input-name", onChange: (v) => (name = v) }));
    col.addControl(label(t("profile.store"), { size: T.small, weight: 700, color: C.inkSoft, h: 22 }));
    col.addControl(
      textInput(store, {
        maxLength: STORE_NAME_MAX,
        placeholder: t("profile.storePlaceholder"),
        testId: "input-store",
        onChange: (v) => {
          store = v;
          o.onStoreName?.(cleanName(v, STORE_NAME_MAX) || t("profile.defaultStore"));
        },
      }),
    );
    col.addControl(label(t("profile.storeHint"), { size: T.small, color: C.inkFaint, h: 22 }));
    p.addControl(col);
    p.addControl(
      button(o.first ? t("profile.start") : t("profile.done"), {
        w: 280,
        size: "lg",
        variant: "primary",
        y: -S.xl,
        ha: H_CENTER,
        va: V_BOTTOM,
        testId: "profile-done",
        onClick: () => {
          close();
          o.onDone({ name: cleanName(name, NAME_MAX) || t("profile.defaultName"), storeName: cleanName(store, STORE_NAME_MAX) || t("profile.defaultStore") });
        },
      }),
    );
  });
}
