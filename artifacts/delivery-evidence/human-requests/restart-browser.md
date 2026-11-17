# Browser response after isolated stack restart

The test bot created a fictional approval request and Dagu reached the waiting state. The test gateway and authentication were stopped; the separate return-gate test then stopped and restarted its isolated Dagu and OpenMausBot instances with the same data. The request remained waiting. The gateway and authentication were restarted with their existing configuration and data.

A new browser profile logged in and completed the preserved request. Login and completion returned HTTP 200, the page confirmed the response was saved, and browser console errors numbered zero. The SDK page was opened in mock mode; gateway, authentication and Dagu were real isolated services.

The original fictional before/after captures are not included in this documentation draft.

The separately coordinated return-gate test confirmed that ask, record and deliver succeeded, the response reached the original task, and the fictional effect appeared once. These screenshots show the browser portion; they do not independently establish the agent effect. The gateway and authentication belonging to this fixture were stopped after confirmation. No real installation was requested.
