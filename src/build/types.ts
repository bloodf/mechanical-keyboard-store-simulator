import type { VoiceParams } from "../audio/voice";
import type { LayoutId } from "../data/layouts";
import type { KeycapProfile, SwitchFamily } from "../data/profiles";
import type { CaseMaterial, DampDef, HueName, PcbDef, PlateDef, StabDef, StabMod } from "../data/parts";
import type { ColorFamily, Colorway } from "../data/colorway";

export type SoundWord = "thocky" | "clacky" | "creamy" | "marbly" | "poppy" | "quiet" | "loud" | "clicky" | "deep" | "crisp";
export type FeelReq = "any" | "light" | "heavy" | "linear" | "tactile" | "clicky" | "smooth";
export type LayoutReq =
  | { kind: "exact"; id: LayoutId }
  | { kind: "compact" }
  | { kind: "arrows" }
  | { kind: "frow" }
  | { kind: "numpad" }
  | { kind: "any" };
export type ThemeReq =
  | { kind: "any" }
  | { kind: "family"; family: ColorFamily }
  | { kind: "hue"; hue: HueName }
  | { kind: "both"; family: ColorFamily; hue: HueName };
export type Persona = "gamer" | "programmer" | "writer" | "streamer" | "office" | "student" | "grandparent" | "audiophile" | "collector" | "artist";

export interface Customer {
  name: string;
  persona: Persona;
  voice: VoiceParams;
}

export interface QuoteLine {
  key: string; // i18n key (variant already chosen)
  params: Record<string, string | number>;
}

export interface JobRequest {
  id: string;
  index: number;
  customer: Customer;
  layout: LayoutReq;
  sound: SoundWord[];
  feel: FeelReq;
  theme: ThemeReq;
  budget: number; // cents — what the customer pays
  picky: number; // 0 relaxed … 1 very picky (scales how much misses hurt)
  quote: QuoteLine[];
  /** Explicit part wishes (checked by the "spec" score). */
  wants?: Wants;
}

export interface Wants {
  profile?: KeycapProfile;
  lowProfile?: boolean; // Choc switches + low-profile caps
  hotswap?: boolean;
  caseMaterial?: CaseMaterial;
}

export type OrderKind = "build" | "membrane";

/** A client order in the workshop's inbox. Days are 1-based game days. */
export interface Order extends JobRequest {
  kind: OrderKind;
  received: number; // day it arrived
  expires: number; // last day it can be accepted
  due: number; // delivery deadline (day, end of day)
}

export type StepId =
  | "case"
  | "pcb"
  | "damp"
  | "plate"
  | "stabs"
  | "switches"
  | "lube"
  | "install"
  | "solder"
  | "screws"
  | "keycaps"
  | "test"
  | "sound"
  | "deliver";

export interface FaultyKey {
  key: number; // key id in the layout
  kind: "dead" | "chatter";
  cause: "bentPin" | "coldJoint";
}

/** Everything about the keyboard being built. Plain JSON: saved with the game. */
export interface BuildSession {
  job: Order;
  step: StepId;
  layout: LayoutId | null;
  caseMaterial: CaseMaterial | null;
  caseColor: { id: string; hex: string } | null; // id "custom" = rolled with the 🎲 button
  customColorway: Colorway | null; // for the custom printed keycap set
  pcb: PcbDef["id"] | null;
  damp: DampDef["id"][];
  tapeQuality: number | null; // 0..1 (tape mod minigame)
  plate: PlateDef["id"] | null;
  stabs: StabDef["id"] | null;
  stabMods: StabMod[];
  stabLube: number | null; // 0..1 (wire lubing minigame)
  switchId: string | null;
  lube: { quality: number; over: number; skipped: boolean } | null; // switch lubing minigame
  installed: boolean;
  solderQuality: number | null;
  faults: FaultyKey[]; // hidden until the key test
  fixed: number[]; // key ids repaired during the test
  screws: { quality: number; loose: number; stripped: number } | null;
  keycapsId: string | null;
  tested: boolean;
  soundChecked: boolean;
  /** Stock taken for this build (SKU → count); returned if the build is abandoned. */
  reserved: Record<string, number>;
  /** Switch family, set by the PCB footprint / switch choice. */
  family: SwitchFamily | null;
}
