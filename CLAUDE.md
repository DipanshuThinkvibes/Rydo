## Project Brain

This project keeps persistent memory in `project-brain/`. At the START of every session, before other work: `git pull`, then read `project-brain/03-progress.md`, `project-brain/04-tasks.md` and the newest files in `project-brain/journal/`, then give a 2-line "where we left off" summary. After completing meaningful work, update the brain (journal + progress + tasks; decisions with reasons into 02-decisions.md). If the user forgets, proactively suggest `/brain log`.

## Team rules (several developers work on RYDO)

1. **Branch per task, never push to `main`.** Start from an up-to-date `main` (`git pull`), create a branch named after the task (e.g. `mobile-find-ride`), and open a Pull Request on GitHub when done. Someone else reviews before it is merged.
2. **Ask before committing or pushing.** Show the person what changed and get a clear yes first. Only push to `karanjain-tv/TV-RYDO`.
3. **Tests before every push:** `npm test -w @rydo/api`; for web changes also `npx tsc --noEmit` and `npx eslint src` in `apps/web`. Add or update e2e tests for every API change, including a cross-company test for new company routes.
4. **No secrets in git.** API keys and passwords live only in `.env` files (ignored by git). Never print a key in chat, code, docs or commit messages.
5. **Journal per person:** write the session log to `project-brain/journal/YYYY-MM-DD-<name>.md` (your own file, so two people never edit the same journal). Update `03-progress.md` and `04-tasks.md` in the same Pull Request.
6. **Follow the architecture:** company wall (`@OrgScoped`, filter by organization), vendors only through `services/api/src/adapters`, shared schemas in `packages/shared`, few database round trips per screen (smooth for ~500 users). Details: "How to build on it" in the RYDO Team Handbook and `README.md`.
7. **Code, UI, emails and docs in English.** Chat may be in any language.
8. **Only the change that was asked.** No unrelated refactors or features in the same Pull Request.
