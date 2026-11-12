# Siapkan file statis untuk Next.js standalone
Write-Host "Menyiapkan file static & public ke dalam standalone..."
$standaloneDir = ".next\standalone"

if (!(Test-Path "$standaloneDir\public")) {
    Copy-Item -Path "public" -Destination "$standaloneDir\public" -Recurse -Force
}

$staticTarget = "$standaloneDir\.next\static"
if (!(Test-Path $staticTarget)) {
    New-Item -ItemType Directory -Path $staticTarget -Force | Out-Null
}
Copy-Item -Path ".next\static\*" -Destination $staticTarget -Recurse -Force

# Pastikan Prisma Query Engine ada di standalone node_modules
$prismaEngineSrc = "node_modules\.prisma\client\query_engine-windows.dll.node"
$prismaEngineDst = "$standaloneDir\node_modules\.prisma\client"
if (Test-Path $prismaEngineSrc) {
    if (!(Test-Path $prismaEngineDst)) {
        New-Item -ItemType Directory -Path $prismaEngineDst -Force | Out-Null
    }
    Copy-Item -Path $prismaEngineSrc -Destination $prismaEngineDst -Force
}

Write-Host "Persiapan Next.js standalone selesai!"
