# Runtime secrets: frontend publication vs payout runtime

The signing keys used for sell payouts and Solana graduation are **server-only runtime
secrets**. They must never be placed in source, shell scripts, `VITE_*` variables,
client configuration, or generated assets.

## Frontend/static and testnet publication

`bun run publish` only installs dependencies, builds the frontend, and starts the
port-3000 server. It does **not** require any payout or Solana graduation private key.
This allows static/testnet UI changes (including the verified Base Sepolia factory
configuration) to be published without exposing or requesting unrelated credentials.

## Payout/graduation runtime

The protected API routes validate their route-specific secret at request time. If a
secret is absent or malformed, they return a safe `503` configuration error and do not
queue, simulate, sign, or send a transaction. Configure these protected runtime
variables before enabling those routes:

| Variable                         | Used by                    | Expected value                                         |
| -------------------------------- | -------------------------- | ------------------------------------------------------ |
| `SELL_POOL_SOLANA_PRIVATE_KEY`   | Solana sell-payout route   | JSON-encoded 64-byte Solana secret-key array           |
| `SELL_POOL_ETHEREUM_PRIVATE_KEY` | Ethereum sell-payout route | hexadecimal Ethereum private key, with or without `0x` |
| `SOLANA_POOL_PRIVATE_KEY`        | Solana graduation route    | JSON-encoded 64-byte Solana secret-key array           |

`publish.sh` does not validate these variables and never logs their values. The server
validates the route-specific variable at request time and returns a failure instead of
simulating a payout if it is absent. Solana routes reject a value that is not a
JSON-encoded 64-byte array.

## Required owner credential action

Literal pool private-key material was previously tracked in `publish.sh`; treat every
key value previously committed there as exposed. `server-db.ts` is the related
server-side signing path that now consumes runtime-only values and fails closed when
they are missing.

The owner must create replacement, test-only wallet/keypairs; move or revoke any
funds/permissions associated with each exposed wallet; and store the replacements in
the protected runtime secret manager under the variable names above. Do not reuse the
prior key material. Verify each replacement wallet address against the intended public
pool address before any test deployment.
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
