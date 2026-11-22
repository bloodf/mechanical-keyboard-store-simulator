/** Edge cases: storage failures, damaged save envelopes and shame records, unusual glTF files. */
import { afterEach, describe, expect, it } from "vitest";
import { seal } from "../../src/save/crypto";
import { defaultStorage, KEYS, MemoryKV, SaveManager } from "../../src/save/saveManager";
import { loadGlb } from "../../src/engine/glb";

describe("storage", () => {
  const g = globalThis as unknown as { localStorage?: unknown };
  afterEach(() => delete g.localStorage);
  it("falls back to memory when localStorage is missing or blocked", () => {
    expect(defaultStorage().persistent).toBe(false);
    g.localStorage = { setItem: () => { throw new Error("blocked"); }, removeItem() {}, getItem: () => null };
    expect(defaultStorage().persistent).toBe(false);
    const store = new Map<string, string>();
    g.localStorage = { setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), getItem: (k: string) => store.get(k) ?? null };
    expect(defaultStorage().persistent).toBe(true);
  });
  it("a full disk makes save() report 'failed' and keeps the previous save", () => {
    const kv = new MemoryKV();
    const m = new SaveManager(kv);
    expect(m.hasSave()).toBe(false);
    const s = m.newGame();
    expect(m.hasSave()).toBe(true);
    const full = { getItem: (k: string) => kv.getItem(k), removeItem: (k: string) => kv.removeItem(k), setItem: () => { throw new Error("QuotaExceeded"); } };
    const m2 = new SaveManager(full);
    expect(m2.load().kind).toBe("ok");
    expect(m2.save({ ...s, money: 1 })).toBe("failed");
    expect(new SaveManager(kv).load().kind).toBe("ok");
    // the shame record is best-effort when storage is full
    kv.setItem(KEYS.b, "MKSS1.garbage");
    expect(new SaveManager(full).load().kind).toBe("tampered");
  });
  it("damaged envelopes and shame records count as tampering", () => {
    const env = (o: unknown, slot: string) => seal(JSON.stringify(o), `slot:${slot}`);
    const cases: [string, string][] = [
      ["not json", seal("{nope", "slot:b")],
      ["wrong slot inside", env({ slot: "a", counter: 1, savedAt: 1, state: {} }, "b")],
      ["bad counter", env({ slot: "b", counter: 0, savedAt: 1, state: {} }, "b")],
      ["counter parity", env({ slot: "b", counter: 2, savedAt: 1, state: {} }, "b")],
    ];
    for (const [why, blob] of cases) {
      const kv = new MemoryKV();
      kv.setItem(KEYS.b, blob);
      expect(new SaveManager(kv).load().kind, why).toBe("tampered");
    }
    for (const shame of [seal("{oops", "shame"), seal(JSON.stringify({ count: -1, pending: false }), "shame"), "MKSS1.xx"]) {
      const kv = new MemoryKV();
      kv.setItem(KEYS.shame, shame);
      expect(new SaveManager(kv).load().kind).toBe("tampered");
    }
  });
});

/** Build a small .glb in memory. */
function glb(json: object, bin: Uint8Array): ArrayBuffer {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4;
  const binLen = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(enc, 20);
  for (let i = enc.length; i < jsonLen; i++) out[20 + i] = 0x20;
  dv.setUint32(20 + jsonLen, binLen, true);
  dv.setUint32(24 + jsonLen, 0x004e4942, true);
  out.set(bin, 28 + jsonLen);
  return out.buffer;
}

describe("glb reader", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => (globalThis.fetch = realFetch));
  const serve = (buf: ArrayBuffer) => (globalThis.fetch = (async () => ({ arrayBuffer: async () => buf })) as unknown as typeof fetch);
  const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);

  it("reads 8/16/32-bit indices, node matrices & children, files without scenes/normals/indices", async () => {
    for (const [ct, arr] of [[5121, new Uint8Array([0, 1, 2, 0])], [5123, new Uint16Array([0, 1, 2, 0])], [5125, new Uint32Array([0, 1, 2])]] as const) {
      const idx = new Uint8Array(arr.buffer);
      const bin = new Uint8Array(36 + idx.length);
      bin.set(new Uint8Array(tri.buffer), 0);
      bin.set(idx, 36);
      serve(
        glb(
          {
            nodes: [{ name: "parent", matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0, 0, 1], children: [1] }, { name: "child", mesh: 0 }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
            accessors: [
              { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
              { bufferView: 1, componentType: ct, count: 3, type: "SCALAR" },
            ],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: idx.length }],
          },
          bin,
        ),
      );
      const f = await loadGlb("x.glb");
      expect(f.primitives.length).toBe(1);
      expect(Array.from(f.primitives[0].data.indices!)).toEqual([0, 1, 2]);
      // parent matrix scales ×2 and moves +1 in x; x is mirrored into Babylon space
      expect(f.primitives[0].data.positions![3]).toBeCloseTo(-3);
      expect(f.materials).toEqual([]);
    }
    // no indices, no scenes: every node is a root
    serve(
      glb(
        { nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }], bufferViews: [{ buffer: 0, byteLength: 36 }] },
        new Uint8Array(tri.buffer),
      ),
    );
    expect(Array.from((await loadGlb("y.glb")).primitives[0].data.indices!)).toEqual([0, 1, 2]);
  });
  it("rejects what it can't read", async () => {
    serve(new ArrayBuffer(16));
    await expect(loadGlb("bad.glb")).rejects.toThrow(/not a glb/);
    const noBin = glb({ nodes: [] }, new Uint8Array(0));
    serve(noBin.slice(0, 20 + 12));
    await expect(loadGlb("nobin.glb")).rejects.toThrow();
    const strided = (stride: number, ct = 5126) =>
      glb(
        { nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: ct, count: 3, type: "VEC3" }], bufferViews: [{ buffer: 0, byteLength: 36, byteStride: stride }] },
        new Uint8Array(tri.buffer),
      );
    serve(strided(16));
    await expect(loadGlb("strided.glb")).rejects.toThrow(/strided/);
    serve(strided(12, 5122));
    await expect(loadGlb("short.glb")).rejects.toThrow(/component type/);
  });
});
