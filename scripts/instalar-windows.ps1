# Instala e abre o Lumi no Windows.
# Como usar: abra o PowerShell e cole a linha do README (seção "Instalação automática no Windows").
# Pode ser executado de novo sem problema: pula o que já estiver instalado.

# Erros são verificados passo a passo (no Windows PowerShell 5.1, "Stop" interrompe em avisos de programas externos).
$ErrorActionPreference = "Continue"
function Passo($texto) { Write-Host "`n==> $texto" -ForegroundColor Magenta }
function Tem($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function AtualizarPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not (Tem winget)) {
  Write-Host "O 'winget' não foi encontrado. Atualize o 'Instalador de Aplicativo' pela Microsoft Store e rode de novo." -ForegroundColor Red
  exit 1
}

Passo "Verificando programas necessários (Node.js, Git e Docker Desktop)"
if (-not (Tem node)) { winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements }
if (-not (Tem git)) { winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements }
if (-not (Tem docker)) {
  winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  Write-Host "`nO Docker Desktop foi instalado. Talvez o Windows peça para REINICIAR o computador." -ForegroundColor Yellow
  Write-Host "Depois de reiniciar, abra o Docker Desktop uma vez, aceite os termos e rode este script de novo." -ForegroundColor Yellow
  exit 0
}
AtualizarPath
if (-not (Tem pnpm)) { npm install -g pnpm; AtualizarPath }

Passo "Esperando o Docker Desktop ficar pronto"
$dockerOk = $false
for ($i = 0; $i -lt 30; $i++) {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
  if ($i -eq 0) {
    $exe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $exe) { Start-Process $exe }
    Write-Host "Abrindo o Docker Desktop... (pode levar até 1 minuto)"
  }
  Start-Sleep -Seconds 4
}
if (-not $dockerOk) {
  Write-Host "O Docker Desktop não respondeu. Abra-o manualmente, espere ficar verde e rode o script de novo." -ForegroundColor Red
  exit 1
}

Passo "Baixando o projeto"
$pasta = Join-Path $HOME "lumi"
if (-not (Test-Path $pasta)) { git clone https://github.com/lucasbuenomartins/456.git $pasta }
Set-Location $pasta
git fetch origin claude/saas-clinicas-estetica-gtdb2q
git checkout claude/saas-clinicas-estetica-gtdb2q
git pull origin claude/saas-clinicas-estetica-gtdb2q

Passo "Instalando dependências"
pnpm install
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

Passo "Subindo o banco de dados"
docker compose up -d
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T db pg_isready -U postgres *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}
Start-Sleep -Seconds 3

Passo "Preparando o banco"
pnpm db:migrate
pnpm db:seed

Passo "Iniciando o Lumi. Deixe esta janela aberta enquanto usa o sistema."
Write-Host "Clínica: http://localhost:5173  |  ana@bellapele.com.br  /  Senha@123" -ForegroundColor Green
Write-Host "Painel do SaaS: http://localhost:5173/admin  |  admin@plataforma.local  /  Senha@123" -ForegroundColor Green
Start-Job { Start-Sleep -Seconds 8; Start-Process "http://localhost:5173" } | Out-Null
pnpm dev
