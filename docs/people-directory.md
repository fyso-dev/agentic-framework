# People directory

The human-requests extension's **People** page keeps a lightweight directory for a project using shared access. It creates, lists, renames and removes names; it does not create login accounts, passwords, application grants or a verified identity. Everyone with panel access can view and edit this directory under the existing trusted-operator boundary (D40).

Each person has a randomly generated stable UUID and a name. The panel stores one versioned JSON object as a Dagu wiki page at `project/wiki/fyso-people/<uuid>.md`, using the existing authenticated Dagu gateway and native wiki API. These are project-owned files, not extension files. The project's existing snapshot policy includes the wiki; an edit does not itself guarantee an immediate Git commit or push. Do not store secrets or unnecessary personal data here.

The panel reads the current page before editing or removing it and reports a conflict if its content has changed. Dagu 2.24's wiki update API does not expose an atomic compare-and-swap: simultaneous changes to the *same* person can still race and the last write may win. Separate pages prevent unrelated people from overwriting one another. Removing or renaming a person does not modify past requests or their labels.

The directory is descriptive; it is not an authorization system or private inbox. Shared credentials cannot establish which person answered. Access control, invitations and per-person identity remain separate work.

The page belongs to the extension (D76); the core panel has no people screen. The Pending page resolves recipient IDs using this directory, and lets the person choose who they are from it: that choice is kept in the browser, labels their answers and narrows the list to their requests. Existing free-text labels and `team` remain valid. A deleted or unavailable person falls back to the stored label; requests are never rewritten. This does not verify the responder or make a request private.
