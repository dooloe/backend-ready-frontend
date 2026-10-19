# Backend Ready Frontend

See [the specification](docs/spec.md) for the application requirements.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ed83b3b-7020-468a-9cd1-e86f39874079).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

The repository contains the frontend application in `frontend/`, project
documentation in `docs/`, and the initial FastAPI scaffold in `backend/`.
The frontend currently uses mocked backend calls.

For backend setup, its passing smoke test and Uvicorn startup commands, see
[backend/README.md](backend/README.md). Queue features and authentication are
still pending in the MVP backlog.

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
cd frontend
npm i
npm run dev
```

Run frontend verification from the repository root:

```sh
npm --prefix frontend test
npm --prefix frontend run build
```

Configure frontend build services to use `frontend/` as their working directory.

## MVP backlog and GitHub issues

See [the task backlog](_docs/tasks.md), [the GitHub issues](https://github.com/dooloe/backend-ready-frontend/issues?q=label%3Amvp)
and [the direct issue workflow](docs/issue-automation.md).

GitHub issue management uses approved outside-sandbox `gh` commands. Actual issue
numbers are recorded in `docs/issue-map.json`; verified implementation and check
results are recorded in `docs/process.md` and `docs/verification.json`.
