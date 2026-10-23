param(
    [string]$Python = "python",
    [string]$OutputDirectory = ""
)
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoRoot ".local/order-matcher-release" }
$buildDirectory = Join-Path $repoRoot ".local/order-matcher-build"
$assetDirectory = Join-Path $repoRoot ".local/order-matcher-assets"
New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot "DIAM Logos/DIAM triangle (1).png") -Destination (Join-Path $assetDirectory "diam.png")
$arguments = @(
    "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--windowed",
    "--name", "DIAM-Order-Matcher", "--noupx",
    "--icon", (Join-Path $assetDirectory "diam.png"),
    "--version-file", (Join-Path $PSScriptRoot "version-info.txt"),
    "--paths", (Join-Path $repoRoot "lib"),
    "--add-data", ((Join-Path $repoRoot "locales/en.json") + ";locales"),
    "--add-data", ((Join-Path $repoRoot "locales/zh-CN.json") + ";locales"),
    "--add-data", ($assetDirectory + ";assets"),
    "--distpath", $OutputDirectory, "--workpath", $buildDirectory,
    "--specpath", $buildDirectory,
    (Join-Path $PSScriptRoot "app.py")
)
& $Python @arguments
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed ($LASTEXITCODE). Install the pinned build dependency first." }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "使用说明.txt") -Destination $OutputDirectory
Write-Output (Join-Path $OutputDirectory "DIAM-Order-Matcher.exe")
