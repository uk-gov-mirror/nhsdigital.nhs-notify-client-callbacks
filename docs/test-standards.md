---
description: "Test standards and AI guardrails for producing tests and test artifacts"
status: "INITIAL TEMPLATE - REPO LEVEL"
owners:
  - "Test Lead"
  - "Test Manager"
last_reviewed: "2026-03-10"
next_review_due: "2026-03-26"
---

# Test Standards (AI Guardrails)

> **Purpose**: This document defines the testing standards for this repository and the guardrails that AI assistants must follow when creating or changing tests and test artifacts.
>
> **How to use**:
> - Humans: agree the standards, then keep this document current.
> - AI: treat this as a **hard constraint**. If anything conflicts with this standard, stop and ask.
>

## 1) Scope and Audience

### 1.1 In scope

- Unit tests
- Integration tests
- Contract/schema validation tests
- Performance / load tests (where applicable)
- Test fixtures, test data generators, and test utilities
- Test documentation and test evidence artifacts (where applicable)


### 1.2 Out of scope

- End-user documentation (unless it is test runbook documentation)
- Operational monitoring (unless tests validate observability requirements)


---

## 2) Definitions

- **Test artifact**: any test file, fixture, data sample, runbook, report, or evidence output that supports test execution or auditability.
- **Deterministic test**: a test that produces the same result on repeated runs.


---

## 3) AI Guardrails (Non‑Negotiable Rules)

### 3.1 No guessing / no invention

AI must not:

- invent APIs, file paths, contracts, schemas, environment variables, AWS resources, or behaviours.
- claim tests are passing without actually running them (when tooling is available). If specified tooling is not available, stop and ask the user.
- fabricate evidence (screenshots, logs, metrics) or results.

AI must:

- reference the source of truth in-repo (schemas under `specs/.../contracts/`, docs, existing code) before encoding assumptions.
- ask clarifying questions when requirements are ambiguous.
- notify the user of anything unclear and do not proceed without consent of user

### 3.2 Small, reviewable changes

- Prefer minimal diffs.
- Don’t refactor unrelated code as part of test changes.
- Keep naming consistent with existing tests.


### 3.3 Security and privacy

- Do not add real secrets, tokens, endpoints, credentials, or identifiable personal data to tests or fixtures.
- Use placeholders and mocks.
- Treat logs and fixtures as potentially user-visible.


### 3.4 Accessibility and stakeholder readability

- Test outputs (names, descriptions) must be understandable to non-developers.
- Prefer clear “Given/When/Then” naming for scenarios.

### 3.5 Strict "Anti-Hallucination" Protocols

1. **The "Package.json" Rule**:
   - You must NEVER import a library or package that is not already explicitly defined in `package.json`. If you need a new library, you must ask the user for permission to add it first.

2. **The "Read-First" Mandate**:
   - Before writing a test for a function, you must invoke a tool to read the actual source code of that function. Do not rely on function names alone to infer signatures.

3. **Strict Path Verification**:
   - Do not generate a file path string based on patterns alone. You must verify the directory exists using `list_dir` or similar tools before creating a file.

4. **The "Import Verification" Rule**:
   - Before writing any import statement (internal or external), you must verify the imported file/module exists using file_search or read_file.
   - For internal imports, verify the exact export exists in the target file.
   - Never assume import paths; verify relative paths resolve correctly from the test file location.

5. **The "Pattern Matching" Mandate**:
   - Before creating a new test file, you must read at least one existing test file in the same area to match:
     - File naming conventions (`.test.ts` vs `.spec.ts`, etc.)
     - Test structure and helper usage
     - Mock/setup patterns
     - Import patterns and path aliases

6. **The "Mock Verification" Rule**:
   - Before mocking any method or function, verify it exists in the actual implementation or library documentation.
   - Never assume AWS SDK method signatures; check the installed SDK version and its types.
   - Verify mock return types match the actual function return types.

7. **The "Test Execution" Mandate**:
   - After creating or modifying a test, you MUST run it using the repo's test command.
   - If the test fails due to incorrect imports, paths, or signatures, fix and re-run.
   - Only report completion when the test passes (exit code 0).
   - See section 6.2 for the full self-correction loop requirements.

8. **The "Configuration First" Rule**:
   - Before assuming test framework capabilities, read the relevant config files:
     - `jest.config.js` / `package.json` jest config
     - `tsconfig.json` for path aliases and compiler options
     - `.eslintrc` for test-specific rules
   - Do not assume transform, preset, or setup capabilities without verification.

9. **The "Schema Validation" Mandate**:
   - When creating test fixtures that represent schema-validated data, you must:
     - Read the actual schema file from `specs/.../contracts/`
     - Create a validation test that explicitly validates the fixture against the schema
     - Never assume schema structure from naming alone

10. **The "No Assumptions" Principle**:
    - If you are less than 100% confident about ANY detail (file location, function signature, config setting, method name, environment variable), you MUST verify it with a tool before proceeding.
    - Confidence based on patterns alone is insufficient—verification is mandatory.
    - When uncertain, read the source file, check the config, or ask the user.

11. **The "Environment Variable Verification" Rule**:
    - Before referencing environment variables in tests, verify they are:
      - Documented in the codebase (README, .env.example, or config files)
      - Used in the actual implementation code
    - Never invent environment variable names or assume their existence.

---

## 4) Test Strategy and Levels


### 4.1 What belongs at each level

#### Unit tests

- Validate pure logic: transformers, validators, filters, mappers.
- Mock I/O (AWS SDK, network).

#### Integration tests

- Validate components working together.
- Define whether integration tests hit real AWS services, or mocks.  Ask for confirmation from user.


#### Contract/schema tests

- Validate payloads against JSON Schemas.


#### Performance tests

- Validate agreed NFRs (latency, throughput) in a controlled environment.


---

## 5) Standards for Test Design


### 5.1 Arrange–Act–Assert / Given–When–Then

- Use a consistent structure.
- One primary assertion per test where possible.

### 5.2 Determinism and isolation

- Tests must not depend on execution order.
- Avoid time-based flakiness; use fake timers if needed.

### 5.3 Data and fixtures

- Prefer minimal fixtures.
- Keep fixtures close to the tests that use them.
- Avoid over-general “god fixtures”.


### 5.4 Boundary and negative testing

- Every validator/transformer must have:
  - at least one “valid” test
  - at least one “invalid / missing required field” test
  - at least one “unexpected additional field / unknown enum” test (if relevant)


---


## 6) CI / Quality Gates


### 6.1 AI verification requirements

When AI changes tests, it must:

- run the narrowest relevant test command(s) locally/CI where possible.
- report exactly what it ran and whether it passed.

### 6.2 AI Self-Correction Loop

Before confirming a task is complete, the AI must:
1. Run the test it just created.
2. If the test fails, analyze the error.
3. If the error is due to a hallucinated import or incorrect path, fix it immediately.
4. Only report "success" if the test command exits with code 0.


---



## 7) AI Prompting Guidance (For Humans)

Use this snippet when asking AI to write tests:

```text
You must follow docs/test-standards-ai.md.
Do not guess missing details. Ask clarifying questions.
Add tests first, make them fail, then implement.
Report commands executed and results.
```

---


## Appendix A: Checklist for AI-Authored Tests

**Before starting:**
- [ ] I read at least one existing test file in the same area to understand patterns.
- [ ] I verified the test framework configuration (jest.config.js, tsconfig.json).
- [ ] I identified the canonical test location for this type of test.

**During implementation:**
- [ ] I used only existing contracts/schemas/code as sources of truth.
- [ ] I did not invent APIs, paths, commands, or behaviour.
- [ ] I verified all import paths exist using file_search or read_file.
- [ ] I verified all external packages exist in package.json.
- [ ] I read the source code of functions being tested before writing tests.
- [ ] I verified directory paths exist before creating files.
- [ ] I verified all mocked methods exist in the actual implementation.
- [ ] For schema-related fixtures, I read the actual schema file.

**Test quality:**
- [ ] Tests are deterministic and isolated.
- [ ] No secrets or sensitive data were added.
- [ ] Tests follow naming and structure conventions from existing tests.
- [ ] Test descriptions are clear and follow Given/When/Then or similar patterns.

**Verification:**
- [ ] I ran the test command and it passed (exit code 0).
- [ ] I recorded the exact command(s) executed and results.
- [ ] If tests failed, I fixed hallucinated imports/paths and re-ran until passing.
