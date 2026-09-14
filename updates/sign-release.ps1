param(
  [Parameter(Mandatory = $true)][string]$Artifact,
  [Parameter(Mandatory = $true)][string]$PrivateKey
)

$artifactPath = (Resolve-Path -LiteralPath $Artifact).Path
$keyPath = (Resolve-Path -LiteralPath $PrivateKey).Path
if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) { throw "No existe el artefacto: $artifactPath" }
if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw "No existe la clave privada: $keyPath" }

# La clave solo se usa como entrada del firmador; nunca se copia al proyecto.
npx tauri signer sign $artifactPath --private-key $keyPath
