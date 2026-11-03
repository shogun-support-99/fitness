"""Find a Chromium launch configuration that survives loading the app."""
from playwright.sync_api import sync_playwright

CONFIGS = [
    ("headless-shell", {}, {}),
    ("headless-shell + swiftshader off", {}, {"args": ["--disable-gpu", "--disable-software-rasterizer"]}),
    ("full chromium channel", {}, {"channel": "chromium"}),
    ("full chromium + no gpu", {}, {"channel": "chromium", "args": ["--disable-gpu"]}),
]

with sync_playwright() as p:
    for name, ctx_kwargs, launch_kwargs in CONFIGS:
        browser = None
        try:
            browser = p.chromium.launch(headless=True, **launch_kwargs)
            page = browser.new_page()
            logs = []
            page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
            page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
            page.goto("http://127.0.0.1:3000/app/", wait_until="load", timeout=30000)
            page.wait_for_timeout(1500)
            print(f"[ok] {name}: title={page.title()!r} h1={page.locator('h1').count()}")
            print("     logs:", logs[:4])
            page.screenshot(path=f"artifacts/shots/boot-{name.split()[0]}.png")
        except Exception as exc:  # noqa: BLE001 - this script exists to report failures
            print(f"[fail] {name}: {type(exc).__name__}: {str(exc).splitlines()[0]}")
        finally:
            if browser:
                browser.close()
