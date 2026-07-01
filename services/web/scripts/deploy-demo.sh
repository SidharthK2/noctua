#!/usr/bin/env bash
# Deploys the demo contracts to a local anvil instance in a fixed order so their addresses match
# the deterministic defaults baked into services/web/src/lib/addresses.ts:
#   1. Noctua       -> 0x5FbDB2315678afecb367f032d93F642f64180aa3
#   2. Mock DAI      -> 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
#   3. Mock WETH     -> 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
#   4. OracleMock    -> 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
# Run this against a freshly started `anvil` (account #0 must be at nonce 0) from the repo root:
#   ./services/web/scripts/deploy-demo.sh
set -euo pipefail

RPC_URL="${RPC_URL:-http://localhost:8545}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"

# Deterministic anvil default accounts.
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # account #0 (maker)
MAKER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
BORROWER_ADDRESS="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

echo "==> Building contracts"
forge build --root "$CONTRACTS_DIR"

deploy() {
  local contract="$1"
  shift
  forge create "$contract" \
    --root "$CONTRACTS_DIR" \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_KEY" \
    --broadcast \
    "$@" \
    --json | tee /dev/stderr | python3 -c 'import json,sys; print(json.load(sys.stdin)["deployedTo"])'
}

echo "==> Deploying Noctua"
NOCTUA=$(deploy src/Noctua.sol:Noctua)

echo "==> Deploying Mock DAI"
DAI=$(deploy test/mocks/ERC20Mock.sol:ERC20Mock --constructor-args "Mock DAI" "DAI")

echo "==> Deploying Mock WETH"
WETH=$(deploy test/mocks/ERC20Mock.sol:ERC20Mock --constructor-args "Mock WETH" "WETH")

echo "==> Deploying OracleMock (price 2000e36)"
ORACLE=$(deploy test/mocks/OracleMock.sol:OracleMock --constructor-args 2000000000000000000000000000000000000)

echo "==> Minting starter balances"
cast send "$DAI" "mint(address,uint256)" "$MAKER_ADDRESS" 100000000000000000000000 \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" >/dev/null
cast send "$WETH" "mint(address,uint256)" "$BORROWER_ADDRESS" 100000000000000000000 \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" >/dev/null
cast send "$DAI" "mint(address,uint256)" "$BORROWER_ADDRESS" 5000000000000000000000 \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" >/dev/null

echo
echo "==> Deployed addresses"
echo "NOCTUA=$NOCTUA"
echo "DAI=$DAI"
echo "WETH=$WETH"
echo "ORACLE=$ORACLE"
echo
echo "These should match the defaults in services/web/src/lib/addresses.ts. If they don't"
echo "(e.g. anvil account #0 wasn't at nonce 0), export VITE_NOCTUA_ADDRESS / VITE_LOAN_ADDRESS /"
echo "VITE_COLLATERAL_ADDRESS / VITE_ORACLE_ADDRESS before running the web app."
