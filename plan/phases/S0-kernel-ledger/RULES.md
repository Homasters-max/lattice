# S0 · правила → задачи

Генерируется командой `node plan/tools/plan-check.mjs --rules` из frontmatter задач и таблицы SL-Z04; руками не правится.

Правил фазы — 191: полностью — 177, частично — 14. Частичность здесь — по SL-Z04; что в S0 делается частично сверх неё, — в PLAN.md, раздел 2.

## 00-glossary.md

| Правило | В фазе | Задачи |
|---|---|---|
| GL-01 | полностью | [S0-08](tasks/S0-08-std-types-s0.md), [S0-26](tasks/S0-26-codec-import.md) |
| GL-02 | полностью | [S0-26](tasks/S0-26-codec-import.md) |
| GL-03 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| GL-04 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| GL-05 | полностью | [S0-12](tasks/S0-12-fold-view.md), [S0-13](tasks/S0-13-apply-core.md) |
| GL-06 | полностью | [S0-22](tasks/S0-22-libraries-visible-set.md) |
| GL-07 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| GL-08 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| GL-09 | полностью | [S0-20](tasks/S0-20-git-landing.md) |

## 01-principles.md

| Правило | В фазе | Задачи |
|---|---|---|
| PR-01 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| PR-02 | полностью | [S0-13](tasks/S0-13-apply-core.md) |
| PR-03 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-04 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| PR-05 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-06 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-07 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-08 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-09 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-10 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-11 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-12 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| PR-13 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-22](tasks/S0-22-libraries-visible-set.md) |
| PR-14 | полностью | [S0-26](tasks/S0-26-codec-import.md), [S0-31](tasks/S0-31-bench-questions.md) |
| PR-15 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |
| PR-16 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |
| PR-17 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |
| PR-18 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |
| PR-19 | полностью | [S0-17](tasks/S0-17-phase5-authority.md) |

## 02-kernel.md

| Правило | В фазе | Задачи |
|---|---|---|
| KR-01 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md) |
| KR-02 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md) |
| KR-03 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-23](tasks/S0-23-genesis-init.md) |
| KR-04 | полностью | [S0-05](tasks/S0-05-record-ref.md), [S0-35](tasks/S0-35-closed-form.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-05 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-06 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-07 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-08 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-09 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-10 | полностью | [S0-04](tasks/S0-04-canon-hash.md), [S0-26](tasks/S0-26-codec-import.md), [S0-33](tasks/S0-33-landing-checks.md) |
| KR-11 | полностью | [S0-04](tasks/S0-04-canon-hash.md) |
| KR-12 | полностью | [S0-04](tasks/S0-04-canon-hash.md) |
| KR-13 | полностью | [S0-04](tasks/S0-04-canon-hash.md) |
| KR-14 | полностью | [S0-07](tasks/S0-07-type-compare.md), [S0-35](tasks/S0-35-closed-form.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-15 | полностью | [S0-07](tasks/S0-07-type-compare.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-16 | полностью | [S0-07](tasks/S0-07-type-compare.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-17 | полностью | [S0-07](tasks/S0-07-type-compare.md) |
| KR-18 | полностью | [S0-06](tasks/S0-06-schema-validate.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-19 | полностью | [S0-06](tasks/S0-06-schema-validate.md), [S0-07](tasks/S0-07-type-compare.md), [S0-15](tasks/S0-15-phase4-references.md), [S0-35](tasks/S0-35-closed-form.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-20 | полностью | [S0-06](tasks/S0-06-schema-validate.md) |
| KR-21 | полностью | [S0-06](tasks/S0-06-schema-validate.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-22 | полностью | [S0-07](tasks/S0-07-type-compare.md), [S0-36](tasks/S0-36-record-against-type.md) |
| KR-23 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-24 | полностью | [S0-05](tasks/S0-05-record-ref.md) |
| KR-25 | полностью | [S0-05](tasks/S0-05-record-ref.md) |

## 03-types.md

| Правило | В фазе | Задачи |
|---|---|---|
| TY-01 | полностью | [S0-08](tasks/S0-08-std-types-s0.md), [S0-23](tasks/S0-23-genesis-init.md), [S0-24](tasks/S0-24-std-ledger.md) |
| TY-02 | полностью | [S0-08](tasks/S0-08-std-types-s0.md), [S0-09](tasks/S0-09-std-schemas-drafts.md), [S0-24](tasks/S0-24-std-ledger.md) |
| TY-03 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-05 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-06 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-07 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-08 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| TY-09 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| TY-10 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| TY-11 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-12 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-13 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-14 | полностью | [S0-08](tasks/S0-08-std-types-s0.md), [S0-09](tasks/S0-09-std-schemas-drafts.md) |
| TY-15 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |
| TY-16 | полностью | [S0-08](tasks/S0-08-std-types-s0.md) |

## 04-references.md

| Правило | В фазе | Задачи |
|---|---|---|
| RF-01 | полностью | [S0-15](tasks/S0-15-phase4-references.md), [S0-22](tasks/S0-22-libraries-visible-set.md) |
| RF-02 | полностью | [S0-15](tasks/S0-15-phase4-references.md), [S0-22](tasks/S0-22-libraries-visible-set.md) |
| RF-03 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| RF-04 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| RF-05 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| RF-06 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| RF-07 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| RF-08 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| RF-09 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| RF-12 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-13 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-14 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-15 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-16 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-17 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-18 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-19 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| RF-22 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |

## 05-ledger.md

| Правило | В фазе | Задачи |
|---|---|---|
| LG-01 | полностью | [S0-11](tasks/S0-11-store-port.md) |
| LG-02 | частично; остальное — S1 | [S0-11](tasks/S0-11-store-port.md), [S0-32](tasks/S0-32-open-tail.md) |
| LG-03 | частично; остальное — S1 | [S0-11](tasks/S0-11-store-port.md) |
| LG-04 | полностью | [S0-10](tasks/S0-10-proposal-commit.md) |
| LG-05 | полностью | [S0-10](tasks/S0-10-proposal-commit.md), [S0-11](tasks/S0-11-store-port.md) |
| LG-06 | полностью | [S0-10](tasks/S0-10-proposal-commit.md), [S0-35](tasks/S0-35-closed-form.md) |
| LG-09 | полностью | [S0-10](tasks/S0-10-proposal-commit.md), [S0-21](tasks/S0-21-draft-command.md), [S0-33](tasks/S0-33-landing-checks.md), [S0-35](tasks/S0-35-closed-form.md) |
| LG-10 | полностью | [S0-10](tasks/S0-10-proposal-commit.md), [S0-35](tasks/S0-35-closed-form.md) |
| LG-11 | полностью | [S0-13](tasks/S0-13-apply-core.md) |
| LG-12 | полностью | [S0-13](tasks/S0-13-apply-core.md) |
| LG-13 | полностью | [S0-13](tasks/S0-13-apply-core.md) |
| LG-54 | полностью | [S0-10](tasks/S0-10-proposal-commit.md), [S0-21](tasks/S0-21-draft-command.md), [S0-33](tasks/S0-33-landing-checks.md) |
| LG-14 | полностью | [S0-13](tasks/S0-13-apply-core.md), [S0-32](tasks/S0-32-open-tail.md) |
| LG-15 | полностью | [S0-13](tasks/S0-13-apply-core.md) |
| LG-16 | полностью | [S0-13](tasks/S0-13-apply-core.md), [S0-36](tasks/S0-36-record-against-type.md) |
| LG-17 | полностью | [S0-02](tasks/S0-02-code-conventions.md), [S0-13](tasks/S0-13-apply-core.md), [S0-33](tasks/S0-33-landing-checks.md), [S0-35](tasks/S0-35-closed-form.md), [S0-37](tasks/S0-37-check-result.md) |
| LG-18 | полностью | [S0-13](tasks/S0-13-apply-core.md), [S0-23](tasks/S0-23-genesis-init.md) |
| LG-19 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| LG-20 | полностью | [S0-20](tasks/S0-20-git-landing.md) |
| LG-22 | частично; остальное — SW | [S0-20](tasks/S0-20-git-landing.md) |
| LG-23 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-20](tasks/S0-20-git-landing.md), [S0-32](tasks/S0-32-open-tail.md), [S0-33](tasks/S0-33-landing-checks.md), [S0-34](tasks/S0-34-worktree-release.md) |
| LG-24 | полностью | [S0-20](tasks/S0-20-git-landing.md), [S0-33](tasks/S0-33-landing-checks.md) |
| LG-25 | полностью | [S0-20](tasks/S0-20-git-landing.md) |
| LG-26 | полностью | [S0-20](tasks/S0-20-git-landing.md) |
| LG-28 | частично; остальное — S1 | [S0-20](tasks/S0-20-git-landing.md) |
| LG-29 | полностью | [S0-20](tasks/S0-20-git-landing.md) |
| LG-53 | полностью | [S0-20](tasks/S0-20-git-landing.md) |
| LG-34 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| LG-35 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| LG-36 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| LG-37 | полностью | [S0-12](tasks/S0-12-fold-view.md), [S0-29](tasks/S0-29-e2e-acceptance.md) |
| LG-38 | частично; остальное — S1 | [S0-12](tasks/S0-12-fold-view.md), [S0-32](tasks/S0-32-open-tail.md) |
| LG-39 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| LG-41 | полностью | [S0-12](tasks/S0-12-fold-view.md) |
| LG-42 | полностью | [S0-25](tasks/S0-25-codec-md-model.md), [S0-26](tasks/S0-26-codec-import.md), [S0-27](tasks/S0-27-codec-export.md), [S0-38](tasks/S0-38-md-model-tables.md) |
| LG-44 | полностью | [S0-22](tasks/S0-22-libraries-visible-set.md), [S0-24](tasks/S0-24-std-ledger.md) |
| LG-45 | полностью | [S0-22](tasks/S0-22-libraries-visible-set.md) |
| LG-47 | полностью | [S0-23](tasks/S0-23-genesis-init.md) |
| LG-48 | полностью | [S0-22](tasks/S0-22-libraries-visible-set.md), [S0-24](tasks/S0-24-std-ledger.md) |
| LG-50 | полностью | [S0-23](tasks/S0-23-genesis-init.md) |
| LG-51 | частично; остальное — S3, SW | [S0-29](tasks/S0-29-e2e-acceptance.md) |

## 06-trust.md

| Правило | В фазе | Задачи |
|---|---|---|
| TR-01 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-02 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-03 | полностью | [S0-15](tasks/S0-15-phase4-references.md) |
| TR-04 | полностью | [S0-17](tasks/S0-17-phase5-authority.md) |
| TR-05 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-06 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-44 | полностью | [S0-18](tasks/S0-18-phase6-evolution.md) |
| TR-07 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-08 | полностью | [S0-17](tasks/S0-17-phase5-authority.md) |
| TR-09 | полностью | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-10 | частично; остальное — S3 | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-11 | частично; остальное — S1 | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-12 | частично; остальное — S3 | [S0-16](tasks/S0-16-namespace-sessions.md) |
| TR-14 | частично; остальное — S1 | [S0-17](tasks/S0-17-phase5-authority.md), [S0-19](tasks/S0-19-acts-port.md) |
| TR-15 | полностью | [S0-17](tasks/S0-17-phase5-authority.md), [S0-19](tasks/S0-19-acts-port.md) |
| TR-16 | полностью | [S0-19](tasks/S0-19-acts-port.md) |
| TR-17 | полностью | [S0-17](tasks/S0-17-phase5-authority.md) |
| TR-42 | частично; остальное — S1 | [S0-17](tasks/S0-17-phase5-authority.md) |
| TR-19 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-20 | частично; остальное — S1, S3 | [S0-14](tasks/S0-14-standing.md) |
| TR-22 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-23 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-24 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-25 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-26 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-27 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-28 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-29 | полностью | [S0-08](tasks/S0-08-std-types-s0.md), [S0-14](tasks/S0-14-standing.md), [S0-15](tasks/S0-15-phase4-references.md) |
| TR-31 | полностью | [S0-14](tasks/S0-14-standing.md) |
| TR-40 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |

## 07-runtime.md

| Правило | В фазе | Задачи |
|---|---|---|
| RT-10 | частично; остальное — S1 | [S0-08](tasks/S0-08-std-types-s0.md) |
| RT-32 | частично; остальное — S1, S3, SW | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-12](tasks/S0-12-fold-view.md), [S0-16](tasks/S0-16-namespace-sessions.md), [S0-18](tasks/S0-18-phase6-evolution.md), [S0-20](tasks/S0-20-git-landing.md), [S0-21](tasks/S0-21-draft-command.md), [S0-23](tasks/S0-23-genesis-init.md), [S0-27](tasks/S0-27-codec-export.md), [S0-28](tasks/S0-28-generate.md) |

## 13-structure.md

| Правило | В фазе | Задачи |
|---|---|---|
| ST-01 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-32](tasks/S0-32-open-tail.md) |
| ST-02 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-30](tasks/S0-30-architecture-audit.md) |
| ST-03 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |
| ST-04 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md) |
| ST-05 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md) |
| ST-06 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md) |
| ST-07 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md), [S0-11](tasks/S0-11-store-port.md), [S0-34](tasks/S0-34-worktree-release.md) |
| ST-08 | полностью | [S0-28](tasks/S0-28-generate.md) |
| ST-09 | полностью | [S0-28](tasks/S0-28-generate.md) |
| ST-11 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| ST-12 | полностью | [S0-29](tasks/S0-29-e2e-acceptance.md) |
| ST-17 | полностью | [S0-02](tasks/S0-02-code-conventions.md), [S0-33](tasks/S0-33-landing-checks.md), [S0-35](tasks/S0-35-closed-form.md), [S0-36](tasks/S0-36-record-against-type.md), [S0-37](tasks/S0-37-check-result.md) |
| ST-13 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| ST-14 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| ST-15 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| ST-16 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |

## 14-slices.md

| Правило | В фазе | Задачи |
|---|---|---|
| SL-01 | полностью | [S0-29](tasks/S0-29-e2e-acceptance.md) |
| SL-02 | полностью | [S0-26](tasks/S0-26-codec-import.md), [S0-29](tasks/S0-29-e2e-acceptance.md) |
| SL-03 | полностью | [S0-29](tasks/S0-29-e2e-acceptance.md) |
| SL-04 | полностью | [S0-23](tasks/S0-23-genesis-init.md), [S0-29](tasks/S0-29-e2e-acceptance.md) |
| SL-05 | полностью | [S0-03](tasks/S0-03-walking-skeleton.md) |
| SL-06 | полностью | [S0-02](tasks/S0-02-code-conventions.md) |
| SL-07 | полностью | [S0-29](tasks/S0-29-e2e-acceptance.md) |
| SL-08 | полностью | [S0-31](tasks/S0-31-bench-questions.md) |

## README.md

| Правило | В фазе | Задачи |
|---|---|---|
| RM-01 | полностью | [S0-01](tasks/S0-01-repo-toolchain-ci.md), [S0-25](tasks/S0-25-codec-md-model.md), [S0-38](tasks/S0-38-md-model-tables.md) |
| RM-02 | полностью | [S0-01](tasks/S0-01-repo-toolchain-ci.md), [S0-25](tasks/S0-25-codec-md-model.md), [S0-37](tasks/S0-37-check-result.md), [S0-38](tasks/S0-38-md-model-tables.md) |
| RM-03 | полностью | [S0-26](tasks/S0-26-codec-import.md) |
| RM-04 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| RM-05 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
| RM-06 | полностью | [S0-27](tasks/S0-27-codec-export.md), [S0-29](tasks/S0-29-e2e-acceptance.md) |
| RM-07 | полностью | [S0-25](tasks/S0-25-codec-md-model.md), [S0-26](tasks/S0-26-codec-import.md), [S0-27](tasks/S0-27-codec-export.md), [S0-38](tasks/S0-38-md-model-tables.md) |
| RM-08 | полностью | [S0-30](tasks/S0-30-architecture-audit.md) |
