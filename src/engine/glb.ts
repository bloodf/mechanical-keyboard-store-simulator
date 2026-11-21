/**
 * Minimal glTF 2.0 binary (.glb) reader for our own Blender exports: meshes (positions, normals, uv0,
 * indices), node transforms and metallic-roughness materials with an optional base color texture.
 * Babylon's official loader package lags behind the core version we use, and our files only need this.
 *
 * Coordinates are converted to the game's convention (Babylon, left-handed): glTF (x, y, z) → (−x, y, z).
 * The mirror flips the winding, which is exactly what Babylon's left-handed front faces expect.
 */
import { Color3, Matrix, Mesh, PBRMaterial, Quaternion, Texture, Vector3, VertexData, type Scene } from "@babylonjs/core";

interface GltfJson {
  nodes?: { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number; baseColorTexture?: { index: number } }; alphaMode?: string }[];
  textures?: { source?: number; extensions?: { EXT_texture_webp?: { source: number } } }[];
  images?: { bufferView: number; mimeType: string }[];
  scenes?: { nodes: number[] }[];
}

export interface GlbPrimitive {
  node: string;
  mesh: string;
  data: VertexData;
  material: number | undefined;
}

export interface GlbMaterialDef {
  name: string;
  color: [number, number, number, number];
  metallic: number;
  roughness: number;
  image: Blob | null;
}

export interface GlbFile {
  primitives: GlbPrimitive[];
  materials: GlbMaterialDef[];
}

const COMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export async function loadGlb(url: string, scaleToMm = 1): Promise<GlbFile> {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`not a glb: ${url}`);
  let off = 12;
  let json: GltfJson | null = null;
  let bin: ArrayBuffer | null = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const chunk = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(`bad glb: ${url}`);
  const g = json;
  const B = bin;

  const read = (ai: number): Float32Array | Uint32Array => {
    const a = g.accessors[ai];
    const bv = g.bufferViews[a.bufferView];
    const n = a.count * COMP[a.type];
    const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (bv.byteStride && bv.byteStride !== COMP[a.type] * 4) throw new Error("strided accessors are not supported");
    switch (a.componentType) {
      case 5126:
        return new Float32Array(B.slice(start, start + n * 4));
      case 5125:
        return new Uint32Array(B.slice(start, start + n * 4));
      case 5123:
        return Uint32Array.from(new Uint16Array(B.slice(start, start + n * 2)));
      case 5121:
        return Uint32Array.from(new Uint8Array(B.slice(start, start + n)));
      default:
        throw new Error(`component type ${a.componentType}`);
    }
  };

  const primitives: GlbPrimitive[] = [];
  const visit = (ni: number, parent: Matrix) => {
    const node = g.nodes![ni];
    let local: Matrix;
    if (node.matrix) local = Matrix.FromArray(node.matrix);
    else {
      const t = node.translation ?? [0, 0, 0];
      const r = node.rotation ?? [0, 0, 0, 1];
      const s = node.scale ?? [1, 1, 1];
      local = Matrix.Compose(new Vector3(s[0], s[1], s[2]), new Quaternion(r[0], r[1], r[2], r[3]), new Vector3(t[0], t[1], t[2]));
    }
    const world = local.multiply(parent);
    if (node.mesh !== undefined) {
      const mesh = g.meshes![node.mesh];
      for (const p of mesh.primitives) {
        const pos = read(p.attributes.POSITION) as Float32Array;
        const nrm = p.attributes.NORMAL !== undefined ? (read(p.attributes.NORMAL) as Float32Array) : null;
        const uv = p.attributes.TEXCOORD_0 !== undefined ? (read(p.attributes.TEXCOORD_0) as Float32Array) : null;
        const idx = p.indices !== undefined ? (read(p.indices) as Uint32Array) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        const vd = new VertexData();
        vd.positions = pos;
        vd.normals = nrm;
        vd.uvs = uv;
        vd.indices = idx;
        if (!world.isIdentity()) vd.transform(world);
        // glTF (right-handed) → Babylon (left-handed): mirror x, scale to the wanted unit
        const P = vd.positions as Float32Array;
        for (let i = 0; i < P.length; i += 3) {
          P[i] = -P[i] * scaleToMm;
          P[i + 1] *= scaleToMm;
          P[i + 2] *= scaleToMm;
        }
        if (vd.normals) {
          const N = vd.normals as Float32Array;
          for (let i = 0; i < N.length; i += 3) N[i] = -N[i];
        }
        primitives.push({ node: node.name ?? `node${ni}`, mesh: mesh.name ?? "", data: vd, material: p.material });
      }
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  const roots = g.scenes?.[0]?.nodes ?? g.nodes!.map((_, i) => i);
  for (const r of roots) visit(r, Matrix.Identity());

  const materials: GlbMaterialDef[] = (g.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    let image: Blob | null = null;
    if (pbr.baseColorTexture !== undefined && g.textures && g.images) {
      const tx = g.textures[pbr.baseColorTexture.index];
      const src = tx.source ?? tx.extensions?.EXT_texture_webp?.source;
      const img = src !== undefined ? g.images[src] : undefined;
      if (img) {
        const bv = g.bufferViews[img.bufferView];
        image = new Blob([B.slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)], { type: img.mimeType });
      }
    }
    const c = pbr.baseColorFactor ?? [1, 1, 1, 1];
    return { name: m.name ?? "", color: [c[0], c[1], c[2], c[3]], metallic: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1, image };
  });
  return { primitives, materials };
}

/** Babylon PBR material from a glb material definition (textures become object URLs). */
export function pbrFromGlb(def: GlbMaterialDef, scene: Scene): PBRMaterial {
  const m = new PBRMaterial(def.name, scene);
  m.albedoColor = new Color3(def.color[0], def.color[1], def.color[2]); // glTF factors are linear, like Babylon PBR
  m.metallic = def.metallic;
  m.roughness = def.roughness;
  if (def.image) {
    const url = URL.createObjectURL(def.image);
    const t = new Texture(url, scene, false, false);
    t.onLoadObservable.addOnce(() => URL.revokeObjectURL(url));
    m.albedoTexture = t;
    m.albedoColor = Color3.White();
  }
  return m;
}

/** Create meshes for every primitive (with materials). */
export function instantiateGlb(file: GlbFile, scene: Scene, name: string): Mesh[] {
  const mats = file.materials.map((d) => pbrFromGlb(d, scene));
  return file.primitives.map((p, i) => {
    const m = new Mesh(`${name}-${p.node}-${i}`, scene);
    p.data.applyToMesh(m);
    if (p.material !== undefined) m.material = mats[p.material];
    return m;
  });
}
