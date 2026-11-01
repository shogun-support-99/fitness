# Exercise media

This directory contains only exercise media whose in-app redistribution terms
have been checked, plus the documented slot for media a downstream user holds
rights to.

## RepDB free-tier stills

`repdb/` contains **1,147 unmodified 512×512 WebP illustrations** referenced by
the 650 RepDB records in `app/data/repdb-index.json`. They come from
[`RepDB/exercise-dataset`](https://github.com/RepDB/exercise-dataset); the exact
upstream commit is recorded in `app/data/repdb-meta.json`.

**Exercise data by [RepDB](https://repdb.co) (repdb.co).**

The RepDB Free Tier License permits personal and commercial **in-app use** with
visible attribution. It does not permit republishing the data as a standalone
dataset, dataset repository or API. The full terms are retained in
[`LICENSE-REPDB.md`](../../LICENSE-REPDB.md), and attribution is visible in
Settings and on illustrated exercise details.

Only referenced `images/flat/*.webp` files are copied. Upstream
`premium-samples/`, paid-tier animations, classic images and every GIF/video
are excluded. The images are not generatively edited, restyled or used as AI
reference material.

Regenerate from a local upstream checkout with:

```sh
node scripts/build-repdb-data.mjs --source /path/to/exercise-dataset
```

The generator fails if the expected license terms disappear, a media path is
outside the free flat-image directory, or a referenced asset is missing.
`tests/repdb.test.js` verifies all committed records, paths, WebP signatures,
instruction packs and attribution.

## Start, peak and single-pose illustrations

Most RepDB exercises have `start` and `peak` stills. The detail sheet shows the
start position with an accessible Start/Peak switch; this is a still-image
selector, not a copied or generated animation. Stretches and holds with one
`main` image render without empty controls. Every image has explicit dimensions
and lazy loading to avoid layout shifts.

Entries without a RepDB still retain the original movement and muscle diagrams
from `app/js/diagrams.js`.

## The dataset's GIFs

[`hasaneyldrm/exercises-dataset`](https://github.com/hasaneyldrm/exercises-dataset)
has an explicit **MEDIA EXCEPTION**: its images and videos are © Gym Visual and
cloning grants no license to them. The MIT grant covers that source's exercise
data and instruction text; the media is included here under a media licence
held by the app operator. The licensed 180×180 GIFs (and their static posters)
live in the `gymvisual/` subdirectory, with the required attribution retained on
every record and in [`NOTICE`](../../NOTICE).

## Supplying your own media

If you have media you are entitled to publish, place it directly in this
directory (not in `repdb/` or `gymvisual/`) named by exercise id:

```text
app/media/ds-0289.gif
app/media/ds-0289.webp
app/media/ds-0289.mp4
app/media/ds-0289.jpg
```

Then call `exerciseMedia(exercise, { mediaUrl, mediaCredit })` with the resolved
URL. An explicitly supplied file takes precedence over catalogue artwork. For
Gym Visual media, the credit `© Gym visual — https://gymvisual.com/` is not
optional.

## Guards

`tests/catalogue.test.js` asserts every dataset record carries local, licensed
Gym Visual media with attribution. `tests/repdb.test.js` checks the separate
RepDB free-tier grant and assets. The deploy workflow allows binary exercise
media only under `app/media/repdb/` and `app/media/gymvisual/` and rejects
unexpected images, videos, premium paths and missing attribution.
