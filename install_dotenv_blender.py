"""
PASO 1: Corre este script PRIMERO para instalar dotenv en Blender
Luego corre el MetaGama_3DText.py
"""
import subprocess
import sys

# Ruta al Python interno de Blender
python_exe = sys.executable

# Instalar python-dotenv
subprocess.check_call([python_exe, "-m", "ensurepip"])
subprocess.check_call([python_exe, "-m", "pip", "install", "python-dotenv"])

print("✅ python-dotenv instalado correctamente en Blender")
print(f"   Python path: {python_exe}")
print("\nAhora puedes correr el script MetaGama_3DText.py")
