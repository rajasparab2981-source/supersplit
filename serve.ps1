param([int]$Port = 5173)
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "SplitPro serving $Root on http://localhost:$Port/"
$mime = @{
  ".html"="text/html; charset=utf-8"
  ".js"="application/javascript; charset=utf-8"
  ".jsx"="application/javascript; charset=utf-8"
  ".css"="text/css; charset=utf-8"
  ".json"="application/json"
  ".png"="image/png"
  ".jpg"="image/jpeg"
  ".jpeg"="image/jpeg"
  ".svg"="image/svg+xml"
  ".ico"="image/x-icon"
  ".md"="text/markdown; charset=utf-8"
  ".toml"="text/plain; charset=utf-8"
}
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel) -or $rel -eq "/") { $rel = "index.html" }
    $path = Join-Path $Root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.Headers.Add("Access-Control-Allow-Origin","*")
      $ctx.Response.Headers.Add("Cache-Control","no-store, must-revalidate")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes("404: $rel")
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
