---
name: example-skill
description: "Demonstrates a registered skill. Use to understand how to invoke skills via this MCP server. Trigger with 'run example skill' or 'show example'."
when_to_use: "run example skill, show example, demo skill"
argument-hint: "[name]"
---

# Example Skill

This is a registered skill exposed through the skills-mcp server.

## Process

1. Greet the person by name if provided.
2. Explain that skills can be loaded via the `skill` tool.
3. Use `list-skill-files` to show what supporting files are available.
4. Use `read-skill-file` to show the contents of `references/sample.md`.
