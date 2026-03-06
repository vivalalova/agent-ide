---
title: "Bug: plugin.json 版本不同步"
created: 2026-03-06
priority: high
suggested_order: A2
---

# Bug: plugin.json 版本不同步

plugins/skills/agent-ide/plugin.json 的 version 為 0.13.5，package.json 為 0.13.6。版本不同步可能讓使用者安裝到錯誤版本。

需將 plugin.json 版本同步至 0.13.6，並確認 release 腳本（scripts/）是否需涵蓋 plugin.json 的版本更新。

## User Stories

- As a plugin user, I want the plugin version to match the package version, so that I can verify I'm using the correct version.

## 驗收條件

- Given plugin.json and package.json, when checking versions, then both show the same version number
- Given a version bump via `npm version`, when the release script runs, then plugin.json version is also updated automatically
