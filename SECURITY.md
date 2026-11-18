# Security policy

## Supported versions

Security fixes go into the latest minor release on npm. Upgrade to it to get them.

| Version | Supported |
| --- | --- |
| latest 0.x | yes |
| older | no |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub:
[Report a vulnerability](https://github.com/harendra-singh-negi/formlift/security/advisories/new).

Include the formlift version, what an attacker can do, and the steps or a file (PDF, form JSON or lesson JSON)
that shows it. You get a first reply within 7 days. Once a fix is released, the advisory is published with credit
to you, unless you ask not to be named.

## Scope

In scope: code in this repository and the `formlift` package on npm, for example a crafted PDF, form or lesson
that runs code, bypasses `validateFields` / `validateAnswers` / `validateLesson`, or makes formlift send data
anywhere on its own.

Out of scope: bugs in pdf.js or pdf-lib themselves (report those upstream), and checks your app skips on its
server. The [Security section of the README](./README.md#security) lists what your server must run.
