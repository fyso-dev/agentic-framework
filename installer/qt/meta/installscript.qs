// UI lifecycle, progress and command failures belong to Qt Installer Framework.
// FYSO_COPY is injected from locales/{es,en}.json by the build, not handwritten here.
var windows = false;
var lang = 'es';
var text = FYSO_COPY.es;
var requestPath = '';
function checked(program, args, input) {
    var result = installer.execute(program, args, input || '', 'UTF-8', 'UTF-8');
    if (result.length < 2 || result[1] !== 0) throw new Error(text.prerequisites + '\n' + (result[0] || ''));
    return result[0].trim();
}
function cleanupRequest() {
    if (!requestPath) return;
    if (windows) installer.execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',
        '$p=[Console]::In.ReadToEnd(); if ($p) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }'],
        requestPath, 'UTF-8', 'UTF-8');
    else installer.execute('rm',['-f','--',requestPath]);
    requestPath = '';
}
function Component() {
    if (typeof installer.isInstaller !== 'function' || !installer.isInstaller()) return;
    windows = systemInfo.productType === 'windows';
    lang = (installer.environmentVariable('FYSO_LANG') || installer.environmentVariable('LANG')).indexOf('en') === 0 ? 'en' : 'es';
    text = FYSO_COPY[lang];
    installer.installationFinished.connect(cleanupRequest);
    installer.installationInterrupted.connect(cleanupRequest);
    // Qt owns only a unique helper directory; generated projects are always outside it.
    var home = windows ? installer.environmentVariable('LOCALAPPDATA') : installer.value('HomeDir') + '/.cache';
    installer.setValue('TargetDir', home + '/Fyso/Installer/' + Date.now());
    installer.setDefaultPageVisible(QInstaller.TargetDirectory, false);
    installer.setDefaultPageVisible(QInstaller.ComponentSelection, false);
    component.loaded.connect(this, function() {
        installer.addWizardPage(component, 'Project', QInstaller.ReadyForInstallation);
        var page = component.userInterface('Project');
        gui.pageByObjectName('DynamicProject').title = text.project_title;
        ['name','folder','engine','admin','password','port','distribution'].forEach(function(key) { page[key+'Label'].text = text[key]; });
        page.projectName.text = text.default_name;
        page.projectFolder.text = windows ? '~/Fyso' : installer.value('HomeDir') + '/Fyso';
        page.panelUser.text = 'admin'; page.panelPassword.text = ''; page.distributionName.text = 'Ubuntu';
        page.portBase.placeholderText = text.automatic;
        page.help.text = text.help;
        page.distributionName.visible = windows; page.distributionLabel.visible = windows;
        page.prerequisite.visible = windows; page.prerequisite.text = text.wsl_install;
        page.prerequisite.clicked.connect(function() {
            // Windows shows UAC; the user initiates this separately and restarts if required.
            checked('powershell.exe', ['-NoProfile','-Command',
                "Start-Process wsl.exe -Verb RunAs -Wait -ArgumentList '--install --distribution Ubuntu --no-launch'"]);
            QMessageBox.information('wsl', 'Fyso', text.wsl_restart);
        });
    });
}
Component.prototype.createOperations = function() {
    component.createOperations(); // native extraction and safe maintenance ownership
    if (!installer.isInstaller()) return;
    var page = component.userInterface('Project');
    var request = {name:page.projectName.text, folder:page.projectFolder.text, engine:page.projectEngine.currentIndex === 2 ? 'pi' : (page.projectEngine.currentIndex === 1 ? 'codex':'claude'),
        admin:page.panelUser.text, password:page.panelPassword.text, port:page.portBase.text, lang:lang};
    if (!request.name.trim() || !request.password || request.password.length < 12 ||
        !/^[a-zA-Z][a-zA-Z0-9_.-]{1,63}$/.test(request.admin) ||
        (request.port && !/^[0-9]+0$/.test(request.port))) throw new Error(text.invalid);
    // UI-only configuration supports test sources without persisting credentials.
    request.source = installer.environmentVariable('FYSO_SOURCE') || 'gh:fyso-dev/agentic-framework';
    request.ref = installer.environmentVariable('FYSO_REF') || 'main';
    if (windows) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(page.distributionName.text)) throw new Error(text.invalid);
        var kernel = checked('wsl.exe',['--distribution',page.distributionName.text,'--exec','uname','-r']);
        if (kernel.toLowerCase().indexOf('wsl2') < 0) throw new Error(text.wsl_missing);
        var script = "$d=Join-Path $env:TEMP ('fyso-request-'+[guid]::NewGuid());" +
            "$null=New-Item -ItemType Directory -Path $d;" +
            "$acl=New-Object System.Security.AccessControl.DirectorySecurity;" +
            "$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;" +
            "$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');" +
            "$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule($rule);Set-Acl -LiteralPath $d -AclObject $acl;" +
            "$p=Join-Path $d 'request.json';[IO.File]::WriteAllText($p,[Console]::In.ReadToEnd(),(New-Object Text.UTF8Encoding($false)));Write-Output $p";
        requestPath = checked('powershell.exe',['-NoProfile','-NonInteractive','-Command',script], JSON.stringify(request));
        component.addOperation('Execute', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
            '@TargetDir@/windows.ps1', '-Mode','Install','-Distribution',page.distributionName.text,
            '-Language',lang,'-RequestFile',requestPath);
    } else {
        requestPath = checked('bash', ['-c', 'umask 077; d=$(mktemp -d -t fyso-request-XXXXXXXX); cat > "$d/request.json"; printf %s "$d/request.json"'], JSON.stringify(request));
        component.addOperation('Execute','python3','@TargetDir@/install.py','--request-file',requestPath);
    }
    page.panelPassword.text = ''; // no password in installer values, logs or operation arguments
};
