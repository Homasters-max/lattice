// The repositories a test builds once and copies for each case (S0-40). Git from 2.47 on ends a commit, a fetch and,
// on the remote, the receive-pack of a push with auto-maintenance detached from it: it holds objects/maintenance.lock
// and lets it go after git has returned, so a copy made then lists a file that is gone and fails with ENOENT of cp.
// `git -c` and GIT_CONFIG_* do not reach the receive-pack of a local remote, so each repository keeps it off in its config.

/** The arguments of git that turn auto-maintenance off in the repository git runs in. */
export const NO_MAINTENANCE: readonly string[] = ["config", "maintenance.auto", "false"];
