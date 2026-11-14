# Normal generated-project lifecycle smoke

On 2026-11-14 UTC, a fresh project was generated from integrated commit `d6d1053` using Copier 9.19.1, with `engine=codex` and the bundled human-requests extension. Its actual `mise run setup` and `mise run up` both exited 0. The project had its own ports, age identity, encrypted secrets, data and XDG configuration/state. No explicit trust command or trust-path override was used. Tinyauth was pre-seeded from a previously built local test binary; this does not test a fresh download/build or installer.

The first doctor failed because the fixture's deliberately minimal PATH omitted the host's Claude and Codex executables. After adding the directories of those actual installed executables, the unchanged `mise run doctor` exited 0 with **All checks passed**, without warnings or skipped checks. Both real engine login-status checks passed; this establishes local authentication status, not a successful model request. The earlier provider HTTP 401 remains a separate limitation.

The running-stack checks confirmed Dagu, the project's own OpenMausBot environment ID, web login, gateway denial of unauthenticated access, session boundaries, connector setup and the declared bot configuration. Process-compose reported all six services running and ready, including remote MCP. No personal Dagu or OpenMausBot instance was used.

After startup and doctor, metadata inspection found zero global mise trust or tracking entries targeting this fixture. This narrow check does not prove the absence of all possible host cache or indirect effects. The fixture used normal native services, not the earlier experimental OS sandbox. Its XDG state remained project-specific, and the fixed remote-MCP launcher preserved its explicit decryption context.

This smoke verifies setup, startup and doctor. It does not establish a model-backed bot → browser → same-conversation interaction, which must be evaluated separately, nor does it authorize publication or production use.
