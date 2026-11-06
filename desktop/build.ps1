$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$build = Join-Path $PSScriptRoot 'build'
$dist = Join-Path $project 'dist'
$webViewVersion = '1.0.3856.49'
$package = Join-Path $build 'webview2.nupkg'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'

& npm.cmd --prefix $project run build
if ($LASTEXITCODE -ne 0) { throw 'The frontend build failed.' }

New-Item -ItemType Directory -Path $build -Force | Out-Null
if (-not (Test-Path -LiteralPath $package)) {
    $base = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2'
    Invoke-WebRequest -Uri "$base/$webViewVersion/microsoft.web.webview2.$webViewVersion.nupkg" -OutFile $package
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($package)
try {
    $files = @(
        'lib/net462/Microsoft.Web.WebView2.Core.dll'
        'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
        'runtimes/win-x64/native/WebView2Loader.dll'
        'LICENSE.txt'
    )
    foreach ($file in $files) {
        $destination = Join-Path $build ([IO.Path]::GetFileName($file))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry($file), $destination, $true)
    }
} finally {
    $zip.Dispose()
}

$icon = Join-Path $build 'sat-archive.ico'
$png = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'icon.png'))
$writer = [IO.BinaryWriter]::new([IO.File]::Create($icon))
try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]1)
    $writer.Write([UInt32]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$png.Length)
    $writer.Write([UInt32]22)
    $writer.Write($png)
} finally {
    $writer.Dispose()
}

$core = Join-Path $build 'Microsoft.Web.WebView2.Core.dll'
$forms = Join-Path $build 'Microsoft.Web.WebView2.WinForms.dll'
$loader = Join-Path $build 'WebView2Loader.dll'
$license = Join-Path $build 'LICENSE.txt'
$output = Join-Path $build 'SAT Archive.exe'
$rendererResources = @("/resource:$(Join-Path $dist 'index.html'),Renderer.index.html")
$rendererResources += Get-ChildItem -LiteralPath (Join-Path $dist 'assets') -File | ForEach-Object {
    "/resource:$($_.FullName),Renderer.$($_.Name)"
}

& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$output" "/win32icon:$icon" `
    "/reference:$core" "/reference:$forms" "/resource:$core,Microsoft.Web.WebView2.Core.dll" `
    "/resource:$forms,Microsoft.Web.WebView2.WinForms.dll" "/resource:$loader,WebView2Loader.dll" `
    "/resource:$license,WebView2.LICENSE.txt" @rendererResources (Join-Path $PSScriptRoot 'Archive.cs')
if ($LASTEXITCODE -ne 0) { throw 'The Windows desktop build failed.' }

Write-Output $output
