# Stitch design references

These files are **mobile design references, not shipping code**. Nothing here is
served by the site or bundled into the APK.

- **Source:** Google Stitch MCP, project `IronLog Mobile`
  (`projects/11113072897899893295`), design system **Field Notebook Heavy**
  (`GEIST` body font, light mode, `#0f2a1d` accent).
- **Regenerate:** `tools.stitch.generate_screen_from_text` against that project id,
  then `tools.stitch.download_file` on the returned `htmlCode.name`.

| File | Stitch screen | What it covers |
| --- | --- | --- |
| `home-dashboard.html` | `screens/00cb70570b764dc4b55631b01d14d21d` — *IronLog Home Dashboard* | Start-workout hero, weekly volume card, recent sessions, bottom nav |
| `active-workout-logger.html` | `screens/9f00c92680e6472d982dcf769f5c1690` — *Active Workout Logger* | In-session metrics strip, rest timer, per-exercise set table with tick boxes |

Both are standalone documents openable directly in a browser. They pull Google
Fonts and the Tailwind CDN over the network, so view them online — that is the one
reason they are not copied into the offline app.

The PNG renders Stitch produced are deliberately **not** committed: the CI media
guard only permits binary artwork under `assets/img/`, `app/icons/` and
`app/media/gymvisual/`, and these are reference screenshots rather than site
artwork. Fetch them with `download_file` on
`projects/11113072897899893295/files/f54e96cda6ea4e32ba7ee644dd76dead`
(home dashboard) and
`projects/11113072897899893295/files/c342c96f09144a68bbd6dc73d709bd28`
(active logger).

## How they relate to the shipped app

The Android APK is **not** this Stitch frontend. It is the production web app in
`app/`/`assets/`/`fonts/` — the same build the browser and PWA use — served by a
native WebView shell, because that build is already fully verified against every
screen, button and workout flow, works offline, and stores data in one
`ironlog.v1` local-storage key that survives APK updates. These screens record the
mobile design language to draw on if the native shell is ever given its own
purpose-built UI.
