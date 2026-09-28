# Security policy

## Supported versions

Only the [latest release](https://github.com/ericthai-labs/lanternote/releases/latest) receives fixes.

## Reporting a vulnerability

Please report security problems **privately** through [GitHub's private vulnerability reporting](https://github.com/ericthai-labs/lanternote/security/advisories/new), not in a public issue.

Include the version, what an attacker could do, and the steps to reproduce. You should get a first reply within a week. Once a fix is released, the advisory is published with credit to you unless you prefer otherwise.

## What counts

Lanternote reads and writes files on your PC, so these are in scope:

- a note, canvas or attachment that makes the app run code, read files outside the opened folder, or write where it should not;
- the `vault://` protocol serving files outside the opened folder;
- the AI connection (MCP) writing when writing is turned off, or reaching folders it was not allowed to use;
- anything that sends data over the network without the user turning it on.
