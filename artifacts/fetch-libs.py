"""Fetch Chromium's missing shared libraries without root.

No apt lists and no sudo in this VM, so: read the noble Packages indexes for exact
.deb filenames, download only the packages Chromium needs, and extract them into a
private prefix that LD_LIBRARY_PATH points at. Re-runnable; skips existing files.
"""
import gzip
import os
import re
import subprocess
import sys
import urllib.request

ARCHIVE = "https://archive.ubuntu.com/ubuntu"
SR = "/tmp/sysroot"
DEBS = "/tmp/debs"
LIBDIR = f"{SR}/usr/lib/x86_64-linux-gnu"
CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell"
)

PACKAGES = [
    "libnspr4", "libnss3", "libasound2t64", "libatk1.0-0t64", "libatk-bridge2.0-0t64",
    "libatspi2.0-0t64", "libcairo2", "libcups2t64", "libdbus-1-3", "libdrm2", "libgbm1",
    "libglib2.0-0t64", "libpango-1.0-0", "libx11-6", "libx11-xcb1", "libxcb1",
    "libxcb-render0", "libxcb-shm0", "libxcomposite1", "libxdamage1", "libxext6",
    "libxfixes3", "libxkbcommon0", "libxrandr2", "libxrender1", "libxshmfence1",
    "libfontconfig1", "libfreetype6", "libpng16-16t64", "libexpat1", "libxi6",
    "libxtst6", "libwayland-client0", "libpixman-1-0", "libbsd0", "libmd0",
    "libbrotli1", "libgraphite2-3", "libharfbuzz0b", "libuuid1", "libselinux1",
    "libpcre2-8-0", "liblzma5", "libzstd1", "libbz2-1.0", "libffi8", "libgcrypt20",
    "libgpg-error0", "liblz4-1", "libsystemd0", "libcap2", "libmount1", "libblkid1",
    "libxau6", "libxdmcp6", "libxcb-glx0", "libxcb-dri3-0", "libxcb-present0",
    "libxcb-sync1", "libxcb-xfixes0", "libdrm-amdgpu1", "libdrm-intel1",
    "libdrm-nouveau2", "libdrm-radeon1", "libllvm17t64", "libsensors5",
    # Chromium dlopens these after start-up, so ldd never lists them.
    "libwayland-server0", "libegl1", "libgl1", "libglvnd0", "libglx0", "libvulkan1",
    "libxcb-randr0", "libxkbcommon-x11-0", "libpangoft2-1.0-0", "libudev1",
    "libdav1d7", "libxml2", "libjpeg-turbo8", "libwebp7", "libopus0", "libvpx9",
    "libsnappy1v5", "libx264-164", "libvdpau1", "libva2", "libzvbi0t64",
    # Skia needs a real fontconfig stack or it aborts on the first paint.
    "fontconfig", "fonts-dejavu-core", "fonts-liberation", "fonts-liberation2",
    "fonts-unifont", "libavahi-common3", "libavahi-client3", "libkrb5-3",
    "libk5crypto3", "libkrb5support0", "libcom-err2", "libkeyutils1",
    "libgssapi-krb5-2", "libnsl2", "libtirpc3t64", "libcairo-gobject2",
]

os.makedirs(SR, exist_ok=True)
os.makedirs(DEBS, exist_ok=True)


def load_index():
    """package name -> Filename for noble + noble-updates, main + universe."""
    files = {}
    for pocket in ("noble", "noble-updates"):
        for comp in ("main", "universe"):
            url = f"{ARCHIVE}/dists/{pocket}/{comp}/binary-amd64/Packages.gz"
            try:
                raw = urllib.request.urlopen(url, timeout=120).read()
            except Exception as exc:  # noqa: BLE001 - a missing pocket is not fatal
                print(f"  index {pocket}/{comp}: {exc}")
                continue
            text = gzip.decompress(raw).decode("utf-8", "replace")
            current = {}
            for line in text.splitlines():
                if not line.strip():
                    if current.get("Package") and current.get("Filename"):
                        files.setdefault(current["Package"], current["Filename"])
                    current = {}
                elif line.startswith("Package: "):
                    current["Package"] = line[9:].strip()
                elif line.startswith("Filename: "):
                    current["Filename"] = line[10:].strip()
            if current.get("Package") and current.get("Filename"):
                files.setdefault(current["Package"], current["Filename"])
            print(f"  index {pocket}/{comp}: {len(files)} packages known")
    return files


def missing_libs():
    env = {**os.environ, "LD_LIBRARY_PATH": f"{LIBDIR}:{SR}/lib/x86_64-linux-gnu"}
    out = subprocess.run(["ldd", CHROME], capture_output=True, text=True, env=env)
    blob = out.stdout + out.stderr
    found = set(re.findall(r"(\S+\.so[\w.\-]*): cannot open shared object file", blob))
    return sorted(found)


def runtime_missing():
    """The library Chromium names when it refuses to start, dlopens included."""
    env = {**os.environ, "LD_LIBRARY_PATH": f"{LIBDIR}:{SR}/lib/x86_64-linux-gnu"}
    try:
        proc = subprocess.run([CHROME, "--version"], capture_output=True, text=True, env=env, timeout=90)
    except subprocess.TimeoutExpired:
        return None
    match = re.search(r"error while loading shared libraries: ([\w.\-+]+):", proc.stderr)
    return match.group(1) if match else None


def package_for(lib, index):
    base = re.sub(r"\.so.*$", "", lib)
    guesses = [base, f"{base}0", f"{base}0t64", f"{base}1", f"{base}1t64", f"{base}2",
               f"{base}t64", f"{base}-0", f"{base}-0t64"]
    return next((g for g in guesses if g in index), None)


def fetch(pkg, filename):
    target = os.path.join(DEBS, os.path.basename(filename))
    if not os.path.exists(target):
        urllib.request.urlretrieve(f"{ARCHIVE}/{filename}", target)
    subprocess.run(["dpkg-deb", "-x", target, SR], check=True)
    print(f"  + {pkg}")


def main():
    print("index:")
    index = load_index()
    if not index:
        sys.exit("no package index reachable")
    print(f"installing {len(PACKAGES)} candidate packages")
    for pkg in PACKAGES:
        filename = index.get(pkg)
        if not filename:
            continue
        try:
            fetch(pkg, filename)
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print(f"  ! {pkg}: {exc}")

    for round_no in range(1, 4):
        left = missing_libs()
        print(f"round {round_no}: {len(left)} missing")
        if not left:
            print("all libraries resolved")
            break
        # Try to satisfy leftovers by package name guessed from the library name.
        for lib in left:
            picked = package_for(lib, index)
            if picked:
                fetch(picked, index[picked])
            else:
                print(f"  ? {lib}: no package guess")

    # ldd only sees DT_NEEDED. Chromium dlopens more (Wayland, GL, Vulkan), so
    # keep starting it and installing whatever it names until it runs.
    for round_no in range(1, 13):
        lib = runtime_missing()
        if not lib:
            print("chromium starts: no missing library reported")
            return
        print(f"launch round {round_no}: {lib}")
        picked = package_for(lib, index)
        if not picked:
            sys.exit(f"no package for {lib}")
        fetch(picked, index[picked])


if __name__ == "__main__":
    main()
