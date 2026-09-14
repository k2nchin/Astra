"""
META GAMA - 3D Text Script for Blender
=======================================
Instrucciones:
1. Abre Blender
2. Ve a la pestaña "Scripting"
3. Crea un nuevo script y pega este código
4. Presiona RUN SCRIPT (Play button)
5. Para cambiar la fuente: Selecciona el texto → Properties → Object Data → Font
6. Para cambiar el texto: Tab → modo edición
7. Activa EEVEE + Bloom para ver el efecto neon

NOTA: Para ver el bloom/glow activa en Render Properties:
  - EEVEE: Post Processing → Bloom (marcar checkbox)
  - Cycles: usa el Compositor con Glare node
"""

import bpy
import math
from mathutils import Vector

# ─────────────────────────────────────────────
# LIMPIAR ESCENA
# ─────────────────────────────────────────────
def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for material in bpy.data.materials:
        bpy.data.materials.remove(material)

clean_scene()

# ─────────────────────────────────────────────
# CONFIGURAR RENDER - EEVEE con Bloom
# ─────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'

if hasattr(scene.eevee, 'use_bloom'):
    scene.eevee.use_bloom = True
    scene.eevee.bloom_intensity = 0.8
    scene.eevee.bloom_threshold = 0.5
    scene.eevee.bloom_radius = 6.0

# ─────────────────────────────────────────────
# FUNCIÓN: Crear Material Metalico Neon
# ─────────────────────────────────────────────
def create_neon_metallic_material(name, base_color, emission_color, emission_strength=3.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (800, 0)

    principled = nodes.new('ShaderNodeBsdfPrincipled')
    principled.location = (200, 100)
    principled.inputs['Base Color'].default_value = (*base_color, 1.0)
    principled.inputs['Metallic'].default_value = 1.0
    principled.inputs['Roughness'].default_value = 0.05
    principled.inputs['Specular IOR Level'].default_value = 1.0

    emission = nodes.new('ShaderNodeEmission')
    emission.location = (200, -150)
    emission.inputs['Color'].default_value = (*emission_color, 1.0)
    emission.inputs['Strength'].default_value = emission_strength

    layer_weight = nodes.new('ShaderNodeLayerWeight')
    layer_weight.location = (-100, 0)
    layer_weight.inputs['Blend'].default_value = 0.3

    mix_edge = nodes.new('ShaderNodeMixShader')
    mix_edge.location = (450, 100)

    fresnel_emission = nodes.new('ShaderNodeEmission')
    fresnel_emission.location = (200, -300)
    fresnel_emission.inputs['Color'].default_value = (*emission_color, 1.0)
    fresnel_emission.inputs['Strength'].default_value = emission_strength * 2.5

    mix_main = nodes.new('ShaderNodeMixShader')
    mix_main.location = (620, 0)
    mix_main.inputs[0].default_value = 0.12

    links.new(layer_weight.outputs['Fresnel'], mix_edge.inputs[0])
    links.new(principled.outputs['BSDF'], mix_edge.inputs[1])
    links.new(fresnel_emission.outputs['Emission'], mix_edge.inputs[2])
    links.new(mix_edge.outputs['Shader'], mix_main.inputs[1])
    links.new(emission.outputs['Emission'], mix_main.inputs[2])
    links.new(mix_main.outputs['Shader'], output.inputs['Surface'])

    return mat

# ─────────────────────────────────────────────
# MATERIALES
# ─────────────────────────────────────────────

# META - Púrpura oscuro con glow magenta/rosa
mat_meta = create_neon_metallic_material(
    name="MAT_Meta_Purple_Neon",
    base_color=(0.15, 0.02, 0.35),
    emission_color=(1.0, 0.0, 0.8),
    emission_strength=4.0
)

# GAMA - Azul-púrpura profundo con glow dorado
mat_gama = create_neon_metallic_material(
    name="MAT_Gama_Blue_Gold",
    base_color=(0.05, 0.02, 0.4),
    emission_color=(1.0, 0.55, 0.0),
    emission_strength=4.5
)

# ─────────────────────────────────────────────
# FUNCIÓN: Crear objeto de texto 3D
# ─────────────────────────────────────────────
def create_3d_text(text, name, location, rotation_euler, material,
                   extrude=0.15, bevel_depth=0.02, bevel_resolution=8, size=1.0):

    bpy.ops.object.text_add(location=location)
    obj = bpy.context.active_object
    obj.name = name

    curve = obj.data
    curve.name = name + "_Curve"
    curve.body = text

    curve.extrude = extrude
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = bevel_resolution
    curve.use_fill_caps = True

    curve.size = size
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'

    obj.rotation_euler = rotation_euler
    obj.data.materials.append(material)

    return obj

# ─────────────────────────────────────────────
# CREAR TEXTOS
# ─────────────────────────────────────────────
meta_obj = create_3d_text(
    text="Meta",
    name="Text_Meta",
    location=(0.0, 0.0, 0.5),
    rotation_euler=(math.radians(-10), math.radians(-5), math.radians(-15)),
    material=mat_meta,
    extrude=0.18,
    bevel_depth=0.025,
    size=1.2
)

gama_obj = create_3d_text(
    text="Gama",
    name="Text_Gama",
    location=(0.3, 0.0, -0.4),
    rotation_euler=(math.radians(5), math.radians(5), math.radians(-10)),
    material=mat_gama,
    extrude=0.20,
    bevel_depth=0.028,
    size=1.3
)

# ─────────────────────────────────────────────
# ILUMINACIÓN DRAMÁTICA
# ─────────────────────────────────────────────
bpy.ops.object.light_add(type='POINT', location=(3, -2, 4))
light1 = bpy.context.active_object
light1.name = "Light_Magenta"
light1.data.energy = 500
light1.data.color = (1.0, 0.0, 0.8)
light1.data.shadow_soft_size = 2.0

bpy.ops.object.light_add(type='POINT', location=(-3, 2, -1))
light2 = bpy.context.active_object
light2.name = "Light_Gold"
light2.data.energy = 400
light2.data.color = (1.0, 0.6, 0.0)
light2.data.shadow_soft_size = 2.5

bpy.ops.object.light_add(type='POINT', location=(0, 4, 0))
light3 = bpy.context.active_object
light3.name = "Light_Blue_Fill"
light3.data.energy = 200
light3.data.color = (0.2, 0.1, 1.0)
light3.data.shadow_soft_size = 3.0

bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
sun = bpy.context.active_object
sun.name = "Sun_Ambient"
sun.data.energy = 0.5
sun.data.color = (0.8, 0.6, 1.0)
sun.rotation_euler = (math.radians(45), 0, math.radians(30))

# ─────────────────────────────────────────────
# CÁMARA
# ─────────────────────────────────────────────
bpy.ops.object.camera_add(location=(0, -6, 1))
cam = bpy.context.active_object
cam.name = "Camera_Main"
cam.rotation_euler = (math.radians(85), 0, 0)
cam.data.lens = 50
scene.camera = cam

# ─────────────────────────────────────────────
# MUNDO - Fondo oscuro
# ─────────────────────────────────────────────
world = scene.world
world.use_nodes = True
world_nodes = world.node_tree.nodes
world_bg = world_nodes.get('Background')
if world_bg:
    world_bg.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
    world_bg.inputs['Strength'].default_value = 0.0

# Seleccionar Meta para empezar
bpy.ops.object.select_all(action='DESELECT')
meta_obj.select_set(True)
bpy.context.view_layer.objects.active = meta_obj

print("=" * 60)
print("✅ META GAMA 3D TEXT CREADO EXITOSAMENTE!")
print("=" * 60)
print()
print("📝 EDITAR TEXTO:")
print("  Selecciona el objeto → TAB → edita")
print()
print("🔤 CAMBIAR FUENTE:")
print("  Properties → Object Data (ícono curva) → Font → carpeta .ttf/.otf")
print()
print("🎨 VER GLOW:")
print("  Render Properties → Post Processing → Bloom ✓")
print()
print("💡 AJUSTAR GROSOR 3D:")
print("  Object Data Properties → Geometry → Extrude / Bevel Depth")
print("=" * 60)
