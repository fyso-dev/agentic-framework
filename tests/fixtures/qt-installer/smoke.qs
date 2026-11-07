// Native Qt IFW automation; run in an isolated Linux desktop, not a personal project.
function Controller() {
    installer.autoRejectMessageBoxes();
}
Controller.prototype.IntroductionPageCallback = function() { gui.clickButton(buttons.NextButton); };
Controller.prototype.DynamicProjectCallback = function() {
    var p=gui.pageWidgetByObjectName('DynamicProject');
    if (!p.projectName.text || !p.panelUser.text) throw new Error('Form defaults missing');
    p.projectName.text='Linux installer proof';
    p.projectEngine.currentIndex=1;
    p.portBase.text='8500';
    installer.execute('xwd',['-root','-silent','-out',installer.value('HomeDir')+'/fyso-project-proof.xwd']);
    gui.clickButton(buttons.NextButton);
};
Controller.prototype.ReadyForInstallationPageCallback = function() { gui.clickButton(buttons.CommitButton); };
Controller.prototype.FinishedPageCallback = function() {
    installer.execute('xwd',['-root','-silent','-out',installer.value('HomeDir')+'/fyso-finished-proof.xwd']);
    gui.clickButton(buttons.FinishButton);
};
