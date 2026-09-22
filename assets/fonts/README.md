# Vendored web fonts

Self-hosted rather than loaded from Google Fonts. The hosted version cost a
render-blocking stylesheet on `fonts.googleapis.com` before the browser could
even discover the font files on `fonts.gstatic.com` — two third-party origins
in front of first paint. These are same-origin, discoverable from our own CSS,
and served `immutable`.

Refresh them with:

    npm run build:fonts      # python3 tools/fetch-fonts.py
    npm run build            # regenerates the @font-face rules into the bundle

`fonts.json` is the manifest the build reads. Do not hand-edit it or the
`@font-face` rules — they are generated from these files.

## What is here, and why these weights

| Family | Subsets | Weights | Notes |
| --- | --- | --- | --- |
| Cinzel | latin, latin-ext | 400–900 (variable) | display face |
| Inter | latin, latin-ext | 100–900 (variable) | body face |
| Tangerine | latin | 700 (static) | `.script` accents only |

Both variable faces declare their whole axis in one `@font-face`, so every
weight the site renders is a real instance. The previous hosted request asked
for the wrong set: Cinzel 400, Inter 700 and Tangerine 400 were all being
synthesised by the browser because they were never requested.

`latin-ext` is included because two pages use `ā` and `ō`. `unicode-range`
means a page without those characters never downloads it.

## Licensing

All three are under the SIL Open Font License 1.1, which requires the licence
to travel with the files — hence `OFL-*.txt` beside them.

- Cinzel — Copyright 2020 The Cinzel Project Authors, https://github.com/NDISCOVER/Cinzel
- Inter — Copyright 2020 The Inter Project Authors, https://github.com/rsms/inter
- Tangerine — Copyright 2010 Toshi Omagari

Fetched from https://github.com/google/fonts.
