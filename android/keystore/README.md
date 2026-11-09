# Android release signing

`ironlog-release.p12` is the self-signed personal release key for the APK. It is
committed because the app is distributed outside Google Play and updates must be
signed by the same key forever; Android rejects an update signed by a different
key.

| Field | Value |
| --- | --- |
| Store type | PKCS12 |
| Alias | `ironlog` |
| Store/key password | `IronLog-2026-Release-7f3c9a2e6b1d4c58` |
| Validity | 30 years |

The build workflow prefers these GitHub Actions secrets when they exist:

- `IRONLOG_KEYSTORE_BASE64` — base64 of a `.p12`
- `IRONLOG_KEYSTORE_PASSWORD`
- `IRONLOG_KEY_ALIAS`
- `IRONLOG_KEY_PASSWORD`

Without secrets it falls back to this committed key so a fresh clone can build a
compatible update. **This repository is public**, so treat the key as a personal
identity key rather than a high-security secret. If the app ever moves to Play
Store distribution, generate a new key in a private environment, store it in
GitHub Actions secrets, and keep the same key for every future release.

Never delete or regenerate this file after the first public APK is released:
existing installations would not be able to install the next build.

The keystore is intentionally outside the GitHub Pages staging directory, so it
is never served by the website.
