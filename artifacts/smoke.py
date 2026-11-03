from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://127.0.0.1:3000/app/")
    page.wait_for_load_state("networkidle")
    print("title:", page.title())
    print("h1:", page.locator("h1").first.inner_text())
    browser.close()
