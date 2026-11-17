---
name: Git push verification
description: Verify a remote branch after a Replit Git safety error reports during local tracking-ref updates.
---

After `git push` reports an error updating a local `refs/remotes/...` tracking ref, the remote push may still have succeeded.

**Why:** Retrying a push based only on the exit code can cause unnecessary or unsafe Git operations when Railway has already started deploying the commit.

**How to apply:** Check `git ls-remote <remote> refs/heads/<branch>` and the Railway deployment status before retrying. If the remote points to the intended commit, treat the push as complete and do not force-push.
