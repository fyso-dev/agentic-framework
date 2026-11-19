# Login branding

`background.webp` is the background of the Tinyauth login page (issue #83). It is
public: anyone who can reach the login page can download it, so it must never hold
anything private. `framework/scripts/web-auth-config.cjs` embeds it in the runtime
configuration as a `data:` URL, so Tinyauth's resources server stays disabled.

The image is the Fyso mark on the fyso.biz palette (`#0E0E12` background, `#6E1FFF`
/ `#8F55FF` violet), 1920x1080 WebP, under 300 KB. A project can replace the
defaults with its own `ui.title` or `ui.backgroundImage` in `project/auth/tinyauth.yaml`.

Verified (2026-11-19) with the unmodified Tinyauth 5.2.0 binary: `/api/context/app`
returns the title and a background whose bytes are identical to this file,
`/resources/*` still answers 403, and a wrong password still answers 401.
