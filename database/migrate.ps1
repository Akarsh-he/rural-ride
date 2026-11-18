$ErrorActionPreference = 'Stop'

if (-not $env:DATABASE_URL) {
  throw 'Set DATABASE_URL to a PostGIS-enabled PostgreSQL database before running migrations.'
}

$migrationFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'migrations') -Filter '*.sql' -File |
  Sort-Object Name

foreach ($migration in $migrationFiles) {
  Write-Host "Applying $($migration.Name)..."
  & psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $migration.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Migration failed: $($migration.Name)"
  }
}

Write-Host "Applied $($migrationFiles.Count) migrations."

$seedFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'seeds') -Filter '*.sql' -File |
  Sort-Object Name

foreach ($seed in $seedFiles) {
  Write-Host "Applying seed $($seed.Name)..."
  & psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $seed.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Seed failed or already seeded: $($seed.Name)"
  }
}
Write-Host "Database migration & seeds complete."
