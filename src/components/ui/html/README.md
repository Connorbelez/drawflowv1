# UI HTML Snippets

Composable HTML, CSS, and JavaScript artifacts for every component in `src/components/ui`.

Directory layout:

- `assets/ui.css`: the single stylesheet for component previews, snippets, and mockups.
- `assets/ui.js`: shared composable interaction behavior.
- `snippets/<component>.html`: raw HTML fragments for composing high-resolution mockups.
- `previews/<component>/index.html`: standalone inspection pages for each component.
- `mockups/*.html`: composed product mockups built from the same assets.
- `composed/*.html`: extracted fragments generated from existing React components.

Use `../assets/ui.css` and `../assets/ui.js` from mockups, or `../../assets/ui.css` and `../../assets/ui.js` from preview pages.

Extract an existing React component into a mockup-ready fragment:

```sh
bun run ui:html:extract path/to/Component.tsx --export ComponentName --out component-name
```

Use `--props props.json` for JSON-serializable props, `--fit false` for full-width/page components, and `--inline false` when you want to preserve project classes instead of inlining computed styles.
