---
name: doctor
description: Check that this machine and project have everything mobile-kit needs (Node, git, Android SDK, Xcode, agent-device, Maestro, Java), that every installed third-party skill is present, that the device matrix config is valid, and that no skill names collide. Prints one fix per problem.
disable-model-invocation: true
---

# mobile-kit doctor

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs
```

Add `--json` when you need to process the result.

Then:
1. Show the output. `✖` is an error, `!` a warning, `·` skipped (for example iOS checks on Linux).
2. For each `✖`, explain it in one line and give its fix command.
3. Offer to run the fixes that only touch the project (for example a missing external: `/mobile-kit:update`, or `npx -y skills add …`). Ask before anything that installs system tools (Android SDK, Xcode, JDK, Maestro, agent-device) or edits shell profiles.
4. Collisions: never delete or rename a folder in `.claude/skills/` without the user's explicit consent.
5. After fixing, run the doctor again and report the final state.
