# React + Vite and Node.js demonstrations

## Node.js practical demonstrations

The `node-demos` folder contains small native Node.js examples for routing, callbacks, file operations, custom modules, and blocking versus non-blocking code.

Run the browser demonstration with:

```bash
npm run node-demo
```

Open <http://localhost:3000>. The server demonstrates:

- `GET /` for a plain HTML response
- `GET /about` for another routed HTML response
- `GET /api/student` for a JSON response
- `GET /file` to read and display a text file in the browser
- `GET /file-info` for permissions, existence, and line count
- `GET /math` for functions imported from a custom module
- `GET /blocking` and `GET /non-blocking` for timing comparison

The file, blocking, and non-blocking examples can also be run directly:

```bash
npm run node-file-demo
npm run node-blocking-demo
npm run node-non-blocking-demo
```

Stop the browser server with `Ctrl+C`.

---

## React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
