"""
Shared helpers for the procedural art pipeline (run with Blender's Python: bpy).
Assets are *modeled* here with real modeling tools (bmesh topology, subdivision, bevels,
weighted normals, PBR materials) and exported to glTF for the game.
Units: Blender meters. Keyboard parts are specified in millimeters via mm().
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "art", "build")
PUBLIC = os.path.join(ROOT, "public", "assets")
os.makedirs(BUILD, exist_ok=True)
os.makedirs(PUBLIC, exist_ok=True)


def mm(v):
    return v / 1000.0


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_from_bmesh(name, bm, smooth=True, smooth_angle=35.0):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        set_smooth_by_angle(ob, smooth_angle)
    return ob


def set_smooth_by_angle(ob, angle_deg=35.0):
    """Smooth shading but keep hard edges above the angle (like 'Auto Smooth')."""
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    except Exception:
        bpy.ops.object.shade_smooth()


def add_modifier(ob, kind, **props):
    m = ob.modifiers.new(kind.lower(), kind)
    for k, v in props.items():
        setattr(m, k, v)
    return m


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


# ---------------------------------------------------------------- materials
def srgb(hex_color):
    h = hex_color.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (lin[0], lin[1], lin[2], 1.0)


def principled(name, color="#ffffff", roughness=0.5, metallic=0.0, transmission=0.0, coat=0.0, ior=1.45, alpha=1.0, grain=0.0, grain_scale=400.0, brushed=0.0, emission=None, emission_strength=0.0):
    """PBR material. grain = micro-surface bump (PBT texture, bead blasting); brushed = anisotropic streaks."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    b.inputs["IOR"].default_value = ior
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    if emission:
        b.inputs["Emission Color"].default_value = srgb(emission)
        b.inputs["Emission Strength"].default_value = emission_strength
    if grain or brushed:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = grain_scale
        noise.inputs["Detail"].default_value = 8
        if brushed:
            mp = nt.nodes.new("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (1.0, 60.0, 1.0)
            nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], noise.inputs["Vector"])
        else:
            nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain or brushed
        bump.inputs["Distance"].default_value = 0.00002
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def image_material(name, image_path, roughness=0.6, metallic=0.0, grain=0.0):
    m = principled(name, "#ffffff", roughness=roughness, metallic=metallic, grain=grain)
    nt = m.node_tree
    img = bpy.data.images.load(image_path, check_existing=True)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


# ---------------------------------------------------------------- scene / render
def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def camera(location, target, lens=50.0):
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.001
    ob = bpy.data.objects.new("cam", cam)
    link(ob)
    ob.location = location
    look_at(ob, target)
    bpy.context.scene.camera = ob
    return ob


def area_light(location, target, energy, size=1.0, color="#ffffff"):
    l = bpy.data.lights.new("area", "AREA")
    l.energy = energy
    l.size = size
    l.color = srgb(color)[:3]
    ob = bpy.data.objects.new("area", l)
    link(ob)
    ob.location = location
    look_at(ob, target)
    return ob


def world_sky(strength=0.6):
    w = bpy.data.worlds.new("world")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "MULTIPLE_SCATTERING"
    except Exception:
        pass
    sky.sun_elevation = math.radians(35)
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    return w


def world_studio(color="#d9dde3", strength=0.8):
    """Soft, neutral studio environment (even light from all around)."""
    w = bpy.data.worlds.new("studio")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = srgb(color)
    bg.inputs["Strength"].default_value = strength
    return w


def render(path, w=1600, h=900, samples=96):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def export_glb(path, objects=None, **kw):
    if objects is not None:
        for o in bpy.context.scene.objects:
            o.select_set(False)
        for o in objects:
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=objects is not None, export_apply=True, export_yup=True, **kw)
