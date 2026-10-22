# 🔒 Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | ✅ |
| < 2.0 | ❌ |

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/pavnxet/YT-Video-Batch-Publisher/security/advisories/new),
or by email if you prefer.

Please include:

- a description of the issue and its impact,
- steps to reproduce,
- the browser and extension version,
- any suggested fix, if you have one.

You can expect an acknowledgement within a few days. Once a fix is ready, it will
be released and you will be credited unless you ask not to be.

## What is in scope

This extension runs in your browser and automates pages in your own YouTube Studio
account. The areas that matter most:

- **Permission scope.** It requests `storage`, `activeTab`, `scripting` and access
  to `studio.youtube.com` only. A change that broadens this is a security change.
- **Injection.** Content-script injection should stay scoped to
  `studio.youtube.com`.
- **Data handling.** The extension has no server, no analytics and no account. Any
  code that transmits data anywhere is a vulnerability, full stop.
- **Automation safety.** Anything that could publish a video with a visibility the
  user did not choose — or publish a video they did not select — is a security
  issue, not just a bug.

## Out of scope

- YouTube's own behaviour, policies or limits.
- Issues that require an already-compromised browser profile.
- The extension acting on pages it does not support.

## A note on automation risk

By design, this extension can publish videos to a real channel. Treat a change to
`src/core/publisher.js` as safety-critical: prefer failing loudly over guessing, and
never widen what a run will touch without the user explicitly asking for it.
