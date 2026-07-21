$gamesDir = Join-Path $PSScriptRoot "giochi"
$outFile = Join-Path (Join-Path $PSScriptRoot "js") "games-data.js"
$entries = @()

Get-ChildItem -Directory $gamesDir | Sort-Object Name | ForEach-Object {
    $id = $_.Name
    $htmlFile = Join-Path $_.FullName "${id}.html"
    if (Test-Path $htmlFile) {
        $html = Get-Content $htmlFile -Raw -Encoding UTF8
        $title = $id
        $desc = ""
        if ($html -match '<title>\s*(.*?)\s*</title>') {
            $title = $matches[1]
        }
        if ($html -match '<meta\s+name="description"\s+content="(.*?)"') {
            $desc = $matches[1]
        }
        $title = $title.Replace('\', '\\').Replace('"', '\"').Replace("`n", ' ').Replace("`r", ' ')
        $desc = $desc.Replace('\', '\\').Replace('"', '\"').Replace("`n", ' ').Replace("`r", ' ')
        $entries += "{ id: `"$id`", title: `"$title`", desc: `"$desc`" }"
    }
}

$js = @"
// Generato automaticamente -- esegui aggiorna.bat dopo aver aggiunto un gioco
var GIOCHI = [
  $($entries -join ",`n  ")
];
"@
Set-Content $outFile $js -Encoding UTF8
Write-Host "OK - Trovati $($entries.Count) giochi. Aggiornato js/games-data.js"
