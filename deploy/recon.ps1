# =====================================================================
#  作品集部署 —— 环境侦察（只读，不修改服务器任何东西）
#
#  用法：在服务器的 PowerShell 里整段粘贴执行，把输出贴回来
# =====================================================================

$ErrorActionPreference = 'SilentlyContinue'

Write-Output '===== 1. 系统 ====='
(Get-CimInstance Win32_OperatingSystem).Caption
"主机名: $env:COMPUTERNAME"
"当前用户: $env:USERNAME"

Write-Output ''
Write-Output '===== 2. Python ====='
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) { "python -> $($py.Source)"; & python -V 2>&1 } else { 'python 不在 PATH 里' }
"pip 包: "
& python -m pip list 2>$null | Select-String -Pattern 'uvicorn|fastapi|starlette|flask|django' | ForEach-Object { "   $_" }

Write-Output ''
Write-Output '===== 3. 18000 以上在监听的端口 ====='
$conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
if ($conns) {
    $conns | Where-Object { $_.LocalPort -ge 18000 } | ForEach-Object {
        $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        "   {0,-8} PID={1,-7} {2}" -f $_.LocalPort, $_.OwningProcess, $p.ProcessName
    } | Sort-Object -Unique
} else {
    netstat -ano | Select-String LISTENING | ForEach-Object { "   $_" }
}

Write-Output ''
Write-Output '===== 4. Python 进程的完整命令行（最关键）====='
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'uvicorn|python' } |
    ForEach-Object { "   PID $($_.ProcessId):"; "   $($_.CommandLine)"; '' }

Write-Output ''
Write-Output '===== 5. 开机自启方式 ====='
"--- 计划任务 ---"
Get-ScheduledTask -ErrorAction SilentlyContinue |
    Where-Object { $_.TaskName -match 'xinyuan|report|picture|guizzhan|uvicorn|app|portfolio' } |
    ForEach-Object { "   $($_.TaskName)  [$($_.State)]" }
"--- 服务 ---"
Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'nssm|xinyuan|report|picture|guizzhan|uvicorn' -or $_.DisplayName -match 'xinyuan|report|picture|guizzhan' } |
    ForEach-Object { "   $($_.Status)  $($_.Name)" }
"--- 启动文件夹 ---"
Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup",
              "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp" -ErrorAction SilentlyContinue |
    ForEach-Object { "   $($_.Name)" }

Write-Output ''
Write-Output '===== 6. 证书文件（从进程命令行推断出的目录）====='
foreach ($d in 'C:\certs', 'C:\cert', 'C:\ssl', 'C:\nginx', 'C:\caddy',
               'C:\ProgramData\win-acme', 'C:\ProgramData\acme.sh', 'C:\win-acme') {
    if (Test-Path $d) {
        "--- $d ---"
        Get-ChildItem $d -Recurse -Include *.pem, *.pfx, *.crt, *.cer, *.key -ErrorAction SilentlyContinue |
            Select-Object -First 10 | ForEach-Object { "   $($_.FullName)   $($_.LastWriteTime)" }
    }
}

Write-Output ''
Write-Output '===== 7. 应用目录候选 ====='
foreach ($d in 'C:\apps', 'C:\app', 'C:\www', 'C:\web', 'C:\projects', 'C:\opt', 'D:\') {
    if (Test-Path $d) {
        "--- $d ---"
        Get-ChildItem $d -Directory -ErrorAction SilentlyContinue |
            Select-Object -First 15 | ForEach-Object { "   $($_.FullName)" }
    }
}

Write-Output ''
Write-Output '===== 8. 防火墙:入站规则(高端口) ====='
Get-NetFirewallRule -Direction Inbound -Enabled True -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match '18\d{3}|portfolio' } |
    ForEach-Object { "   $($_.DisplayName)  [$($_.Action)]" }

Write-Output ''
Write-Output '===== 侦察完毕 ====='
