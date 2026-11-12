param([string]$Python = "python", [string]$OutputDirectory = "")
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoRoot ".local/weekly-comparer-release-v3.1" }
$buildDirectory = Join-Path $repoRoot ".local/weekly-comparer-build"
$arguments = @(
    "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--windowed", "--noupx",
    "--name", "DIAM-Weekly-Comparer",
    "--exclude-module", "numpy", "--exclude-module", "lxml", "--exclude-module", "PIL",
    "--exclude-module", "pandas", "--exclude-module", "matplotlib", "--exclude-module", "scipy",
    "--icon", (Join-Path $repoRoot "DIAM Logos/DIAM triangle (1).png"),
    "--paths", (Join-Path $repoRoot "lib"),
    "--add-data", ((Join-Path $repoRoot "locales/en.json") + ";locales"),
    "--add-data", ((Join-Path $repoRoot "locales/zh-CN.json") + ";locales"),
    "--add-data", ((Join-Path $repoRoot "DIAM Logos/DIAM triangle (1).png") + ";DIAM Logos"),
    "--add-data", ((Join-Path $PSScriptRoot "report.html") + ";templates"),
    "--add-data", ((Join-Path $PSScriptRoot "continuity-report.html") + ";templates"),
    "--distpath", $OutputDirectory, "--workpath", $buildDirectory,
    "--specpath", $buildDirectory,
    (Join-Path $PSScriptRoot "app.py")
)
& $Python @arguments
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed ($LASTEXITCODE). Install requirements-build.txt first." }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README-zh-CN.txt") -Destination $OutputDirectory
Write-Output (Join-Path $OutputDirectory "DIAM-Weekly-Comparer.exe")
