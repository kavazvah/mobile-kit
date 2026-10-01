## Mobile development (mobile-kit {{kitVersion}})

This project uses the [mobile-kit](https://github.com/kavazvah/mobile-kit) Claude Code plugin. Enabled modules: {{modules}}.
Re-run `/mobile-kit:init` or `/mobile-kit:update` to change this section; edits between the markers are overwritten.

### Which skill for which task

| Task | Use |
|---|---|
{{routing}}

### Project paths

{{paths}}

### Rules

- UI code follows the mobile-kit layout rules: spacing/radius/type from tokens only, one `Screen` wrapper owns the safe-area insets, sizes come from flex (no fixed heights on text containers), touch targets ≥ 48dp, OS font scaling stays on.
- Fix causes, not devices: no per-device or per-platform spacing hacks.
- Never leave a simulator/emulator modified (screen size, font scale, dark mode, locale). Restore it.
- Judge animation and performance only on a release build.
- UI review findings and design scores come from the mobile-kit review agents, not from the agent that wrote the code.
