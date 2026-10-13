# EDMS Webview

This repository serves a static EDMS UI through Nginx. The codebase uses TypeScript for modular scripting and Tailwind CSS for styling.

## What is in this repo

- `webview.html` is the default page for Endpoint Cards.
- `Dashboard.html` is the analytics dashboard view.
- `listview.html` is the list-based endpoint view.
- `Single-EQP.html` is the single endpoint/detail view.
- `assets/` contains static UI assets such as styles, icons, and images.
- `data/` & `data-new-2/` contains the JSON datasets loaded by the UI.
- `TypeScripts/` contains the modern TypeScript source files (the current standard for UI logic).
- `new-Scripts/` contains the compiled JS modules generated from TypeScript.
- `Scripts/` contains the legacy vanilla JavaScript files (retained for reference).
- `nginx.conf` is the Nginx configuration used by the Docker container.
- `tailwind.config.js` is the Tailwind CSS configuration.
- `package.json` & `tsconfig.json` manage TypeScript dependencies and build configurations.

## Building the Code

Before starting the server, you need to compile the TypeScript files into JavaScript:

```bash
npm install
npm run build
```
*(This generates the modular JS files into the `new-Scripts/` directory which the HTML pages rely on).*

## Run the server with Docker

Run the Docker command from the repository root, the same folder that contains `nginx.conf` and `webview.html`.

Open a terminal in that folder, then run:

```bash
docker run --name EDMS-nginx -p 8080:80 -v "$(pwd)":/usr/share/nginx/html:ro -v "$(pwd)/nginx.conf":/etc/nginx/nginx.conf:ro -d nginx
```

## How it works

1. Docker starts an Nginx container.
2. The current folder is mounted into the container as read-only content.
3. Nginx uses `nginx.conf` from this repo.
4. Nginx serves the files directly from the mounted folder.
5. The app is available at `http://localhost:8080`.

## Open the pages

After the container is running, open these in your browser:

- `http://localhost:8080/webview.html`
- `http://localhost:8080/Dashboard.html`
- `http://localhost:8080/listview.html`
- `http://localhost:8080/Single-EQP.html`

If you want the container to start again later, run the same command from the repository root.

## Stop the container

To stop and remove the container:

```bash
docker stop EDMS-nginx
docker rm EDMS-nginx
```