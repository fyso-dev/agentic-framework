# Final integrated retry: browser evidence

In the isolated final test, a fresh browser profile logged into a disposable gateway and submitted `aprobado` for the fictional request `gate-final-retry-007` while the test OpenMausBot was stopped. Login and completion returned HTTP 200, the page confirmed that the response was saved, and the browser reported no console errors. The panel page used SDK mock mode; the gateway, authentication and Dagu API were real isolated services.

The original fictional before/after captures are not included in this documentation draft.

The screenshot confirms submission, not delivery or completion of agent work. The separately coordinated return-gate test reports two successful retries, one saved response and one recorded effect. The gateway and authentication processes created for this browser test were stopped after that test, and their ports were verified closed. No real extension installation was requested.
