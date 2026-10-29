# Locale packs

One file per language, each a `MessagesPatch` over `defaultMessages` in
`../core/messages.ts`. The set of languages is the embed's built-in list,
so both surfaces cover the same locales. Empty catalog strings (offer CTAs,
the immediate period-end notice) are left out; they stay empty by design.

These files are generated: `scripts/generate-locales.ts` copies any string
whose English matches an embed string from the embed's catalog and translates
the rest with the same model and prompt the API uses for blueprint
translations, then validates every pack (every key present, placeholders
intact, right script). `en.json` is the English the packs were translated
from; the generator translates only strings a pack lacks or whose English
changed since, drops strings the catalog no longer has, and a test fails
while `en.json` is behind `defaultMessages`. After adding or changing a
catalog string:

```bash
OPENAI_API_KEY=... npx tsx scripts/generate-locales.ts
OPENAI_API_KEY=... npx tsx scripts/generate-locales.ts --force --only=es,tr   # redo whole packs
```

`--provider=bedrock` uses Claude through the `aws` CLI instead, for when the
OpenAI account can't be used. Review the diff before committing; a model can
rephrase a string that didn't need to change. Hand edits to a translation are
fine and survive later runs, since only stale strings are regenerated. A
string with a date after it (`offer.pauseEyebrow`) carries the date as a
placeholder so the model can put it where the grammar wants it.

`index.ts` maps each tag to a dynamic import of its file, so a bundler ships one
chunk per language; add a line there when adding a language.
