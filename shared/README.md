# shared/

JS modules used by **both** sites in the monorepo. Edit here, and the
change lands on `scottymassa.com` and `massatattoo.com` at once — no
copy/paste, no drift.

## What lives here

| File          | Purpose                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `js/main.js`     | Nav toggle, reveal-on-scroll, chip filter, active-nav marker. Safe no-op when the matching markup isn't present. |
| `js/mandala.js`  | Animated canvas mandala — dotwork → **lotus** → linework → shading phases. The lotus phase echoes Scotty's signature petal-arch ornament. |
| `js/includes.js` | HTML partial loader (`<div data-include="...">`) plus active-nav marking after partials hydrate. |

## How the sites load them

Both sites reference these via a relative path:

```html
<!-- scottymassa.com (root) -->
<script src="shared/js/includes.js"></script>
<script src="shared/js/mandala.js"></script>
<script src="shared/js/main.js"></script>

<!-- massatattoo.com (one level deep) -->
<script src="../shared/js/includes.js"></script>
<script src="../shared/js/mandala.js"></script>
<script src="../shared/js/main.js"></script>
```

For local serving with `python3 -m http.server` from the repo root, the
paths just work. For production, each site's deploy must include the
`shared/` directory above its own root — see the project `README.md`.

## Splitting the sites later

When the two sites diverge enough to live in separate repos, copy the
contents of `shared/js/` into the site that keeps using them and delete
the reference. The shared tree is a convenience, not a contract.
