# Deepavali Habba – Bangalore photo album

A static photo album built with plain HTML, CSS and JavaScript (no frameworks).
Visitors enter the album password on the landing page, then browse all photographs.
Photos can be opened in a lightbox and downloaded individually or as a ZIP.

## Repository layout

```
index.html        Landing page and album
css/styles.css    Styling (festive theme)
js/app.js         Application logic
manifest.json     Event details and the photo list
images/           All photographs (referenced from manifest.json)
```

## Adding photos

1. Copy the image files into the `images/` folder.
2. Add an entry for each photo to the `photos` list in `manifest.json`:

```json
{ "file": "images/habba-0001.jpg", "title": "Opening moments" }
```

- `file` is the path to the image, relative to the site root.
- `title` is optional. If omitted, a readable name is generated from the file name.

Photos that are missing from the manifest do not appear on the site, so every image needs an entry.

## Album password

The password is checked in the browser against a salted SHA-256 hash stored in `js/app.js`
(`ACCESS_SALT` and `ACCESS_HASH`). This keeps the password out of the page source, but it is a
client-side gate only. Image files are public URLs on GitHub Pages, so this does not fully protect
the photographs.

## Running locally

Open the folder with any static web server. Opening `index.html` straight from the file system will not load `manifest.json`.

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Hosting on GitHub Pages

1. Go to **Settings → Pages** in the repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then save.
