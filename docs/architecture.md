# Architecture Notes

## Runtime boundaries

- `apps/web` owns the interview workspace UI and browser interactions.
- `apps/api` owns repository analysis, interview state, persistence, and Agent tools.
- `packages/shared` contains contracts shared by the web and API packages.

## Agent contract

The Agent receives a project context, the current interview state, and the latest answer. It returns a next question, an evaluation, and citations to the relevant repository files. The current implementation uses a deterministic local mock so the product can be demonstrated before a model provider is configured.

## Public repository policy

The MVP accepts public GitHub repository URLs only. Repository content is read-only. Write actions, private repository access, and automatic code changes are intentionally outside the first release.

