# Exercise media

This directory contains only exercise media whose in-app redistribution terms
have been checked, plus the documented slot for media a downstream user holds
rights to.

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
directory (not in `gymvisual/`) named by exercise id:

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
Gym Visual media with attribution. The deploy workflow allows binary exercise
media only under `app/media/gymvisual/` and rejects unexpected images, videos,
premium paths and missing attribution.
