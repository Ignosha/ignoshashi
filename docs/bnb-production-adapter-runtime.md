# BNB production/adapter runtime CI

The **BNB production adapter runtime** workflow is a clean `ubuntu-latest` runner for local-runtime validation. It can be started from the GitHub Actions tab with **Run workflow** (`workflow_dispatch`), and also runs for changes under `contracts/` and this document.

The job installs only the EVM harness tooling declared for these checks, provisions Foundry/Anvil, compiles the BNB production and Pancake adapter contracts, then runs the production V1 harness, BNB mock runtime tests, and Pancake adapter runtime tests. Each runtime command has a bounded timeout; Anvil is isolated to the job and its process is cleaned up even after failure. Anvil logs and generated artifacts are retained as workflow artifacts for 14 days when available.

This workflow references no production credentials, wallet keys, RPC endpoints, or GitHub secrets. It does not deploy to BNB or any public network and does not send transactions outside the local Anvil process.

A green run means only that the checked-in compilation and local runtime assertions passed on the hosted runner. It is **not** evidence of BNB Mainnet readiness, production deployment approval, security/economic review, verified DEX graduation, monitoring/reconciliation, or real revenue.
