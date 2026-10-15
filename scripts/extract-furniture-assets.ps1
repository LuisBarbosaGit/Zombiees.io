Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot '..\public\assets\original\tilesheet.png'
$output = Join-Path $PSScriptRoot '..\public\assets\furniture'
New-Item -ItemType Directory -Force -Path $output | Out-Null

# Pixel-exact alpha bounds measured from the original sheet. The source image is never modified.
$assets = @(
  @{ Name = 'sofa-green'; X = 904; Y = 1026; Width = 176; Height = 59 },
  @{ Name = 'sofa-orange'; X = 898; Y = 1090; Width = 188; Height = 60 },
  @{ Name = 'sofa-gray'; X = 902; Y = 1163; Width = 180; Height = 43 },
  @{ Name = 'chair-green'; X = 1092; Y = 1031; Width = 55; Height = 50 },
  @{ Name = 'chair-orange'; X = 1092; Y = 1094; Width = 56; Height = 52 },
  @{ Name = 'chair-blue'; X = 1160; Y = 1034; Width = 48; Height = 43 },
  @{ Name = 'stool-wood'; X = 1222; Y = 1040; Width = 50; Height = 32 },
  @{ Name = 'round-table'; X = 1218; Y = 1154; Width = 60; Height = 60 },
  @{ Name = 'crate-large'; X = 1281; Y = 321; Width = 62; Height = 62 },
  @{ Name = 'crate-small'; X = 1356; Y = 332; Width = 41; Height = 41 },
  @{ Name = 'cabinet-01'; X = 1282; Y = 1026; Width = 188; Height = 60 },
  @{ Name = 'cabinet-02'; X = 1282; Y = 1090; Width = 188; Height = 60 },
  @{ Name = 'cabinet-03'; X = 1282; Y = 1164; Width = 188; Height = 40 },
  @{ Name = 'counter-large'; X = 1538; Y = 770; Width = 188; Height = 188 },
  @{ Name = 'counter-wide'; X = 1538; Y = 962; Width = 188; Height = 60 },
  @{ Name = 'appliance-01'; X = 1664; Y = 539; Width = 64; Height = 37 },
  @{ Name = 'appliance-02'; X = 1664; Y = 603; Width = 64; Height = 37 },
  @{ Name = 'appliance-03'; X = 1536; Y = 1099; Width = 64; Height = 43 },
  @{ Name = 'appliance-04'; X = 1536; Y = 1163; Width = 64; Height = 43 },
  @{ Name = 'sink-or-cooker-01'; X = 1538; Y = 1218; Width = 60; Height = 60 },
  @{ Name = 'storage-01'; X = 1474; Y = 1026; Width = 60; Height = 60 },
  @{ Name = 'storage-02'; X = 1474; Y = 1090; Width = 60; Height = 60 },
  @{ Name = 'storage-03'; X = 1474; Y = 1164; Width = 60; Height = 40 }
)

$sheet = [System.Drawing.Bitmap]::new($source)
try {
  foreach ($asset in $assets) {
    $bounds = [System.Drawing.Rectangle]::new($asset.X, $asset.Y, $asset.Width, $asset.Height)
    $crop = $sheet.Clone($bounds, $sheet.PixelFormat)
    try { $crop.Save((Join-Path $output "$($asset.Name).png"), [System.Drawing.Imaging.ImageFormat]::Png) }
    finally { $crop.Dispose() }
  }
  $assets | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding utf8
}
finally { $sheet.Dispose() }
