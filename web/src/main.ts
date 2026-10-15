import {
  BrowserProvider,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  formatEther,
  getAddress,
  isAddress,
  parseEther,
  parseUnits,
  toBeHex,
} from "ethers";
import { REFUJE_BYTECODE } from "./refujeArtifact";
import "./style.css";

const REFUJE_ABI = [
  "function registerPubKey(bytes32 key)",
  "function depositToKey(uint256 key) payable",
  "function depositErc20(address token, uint256 key, uint256 value, address src)",
  "function widthdrawEth(bytes32 path, bytes targets, bytes[] blobs, bytes proof)",
  "function widthdrawErc20(address token, bytes32 path, bytes targets, bytes[] blobs, bytes proof)",
] as const;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type WalletDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: Eip1193Provider;
};

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

const walletSelect = $<HTMLSelectElement>("wallet-select");
const connectButton = $<HTMLButtonElement>("connect-wallet");
const accountOutput = $<HTMLOutputElement>("account-output");
const instanceAddressInput = $<HTMLInputElement>("instance-address");
const rpcInput = $<HTMLInputElement>("rpc-url");
const instanceStatus = $<HTMLDivElement>("instance-status");
const activityLog = $<HTMLOListElement>("activity-log");
const withdrawAsset = $<HTMLSelectElement>("withdraw-asset");
const withdrawTokenWrap = $<HTMLLabelElement>("withdraw-token-wrap");

const wallets = new Map<string, WalletDetail>();
let selectedWallet: WalletDetail | undefined;
let browserProvider: BrowserProvider | undefined;
let signer: Awaited<ReturnType<BrowserProvider["getSigner"]>> | undefined;
let account: string | undefined;

function setStatus(message: string, kind: "normal" | "success" | "error" = "normal") {
  instanceStatus.textContent = message;
  instanceStatus.className = `status${kind === "normal" ? "" : ` ${kind}`}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function requireAddress(): string {
  const raw = instanceAddressInput.value.trim();
  if (!isAddress(raw)) throw new Error("Enter a valid Refuje contract address.");
  return getAddress(raw);
}

function requireWallet(): NonNullable<typeof signer> {
  if (!signer || !account) throw new Error("Connect a wallet first.");
  return signer;
}

function readProvider(): BrowserProvider | JsonRpcProvider {
  if (browserProvider) return browserProvider;
  const rpc = rpcInput.value.trim();
  if (!rpc) throw new Error("Connect a wallet or enter a read RPC URL.");
  return new JsonRpcProvider(rpc);
}

function contract(withSigner = false): Contract {
  const provider = withSigner ? requireWallet() : readProvider();
  return new Contract(requireAddress(), REFUJE_ABI, provider);
}

function bytes32(value: string): string {
  const raw = value.trim();
  try {
    if (raw.startsWith("0x")) return toBeHex(BigInt(raw), 32);
    if (/^[0-9]+$/.test(raw)) return toBeHex(BigInt(raw), 32);
  } catch {
    // Fall through to the useful validation error below.
  }
  throw new Error("Expected a bytes32 hex value or a uint256 decimal value.");
}

function uint256(value: string): bigint {
  return BigInt(bytes32(value));
}

function bytes(value: string, allowEmpty = false): string {
  const raw = value.trim() || (allowEmpty ? "0x" : "");
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(raw)) {
    throw new Error("Bytes values must be 0x-prefixed hex with an even number of digits.");
  }
  return raw;
}

function blobList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => bytes(line));
}

function addLog(message: string, hash?: string) {
  const empty = activityLog.querySelector("li:first-child");
  if (empty?.textContent === "No transactions yet.") empty.remove();
  const item = document.createElement("li");
  item.textContent = message;
  if (hash) {
    item.append(" ");
    const link = document.createElement("a");
    link.href = `https://etherscan.io/tx/${hash}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = hash;
    item.append(link);
  }
  activityLog.prepend(item);
}

async function runTransaction(label: string, action: () => Promise<{ wait(): Promise<unknown>; hash: string }>) {
  try {
    setStatus(`${label}: waiting for wallet…`);
    const tx = await action();
    addLog(`${label} submitted`, tx.hash);
    setStatus(`${label}: waiting for confirmation…`);
    await tx.wait();
    addLog(`${label} confirmed`, tx.hash);
    setStatus(`${label} confirmed.`, "success");
    await refreshInstance();
  } catch (error) {
    const message = errorMessage(error);
    addLog(`${label} failed: ${message}`);
    setStatus(message, "error");
  }
}

function renderWallets() {
  const previous = walletSelect.value;
  walletSelect.replaceChildren();
  if (wallets.size === 0) {
    walletSelect.add(new Option("No EIP-6963 wallets announced", ""));
    connectButton.disabled = true;
    return;
  }
  for (const wallet of wallets.values()) {
    const option = new Option(wallet.info.name, wallet.info.uuid);
    option.dataset.rdns = wallet.info.rdns;
    walletSelect.add(option);
  }
  walletSelect.value = wallets.has(previous) ? previous : wallets.keys().next().value ?? "";
  selectedWallet = wallets.get(walletSelect.value);
  connectButton.disabled = !selectedWallet;
}

async function connectWallet() {
  try {
    selectedWallet = wallets.get(walletSelect.value);
    if (!selectedWallet) throw new Error("Choose a discovered wallet first.");
    await selectedWallet.provider.request({ method: "eth_requestAccounts", params: [] });
    browserProvider = new BrowserProvider(selectedWallet.provider);
    signer = await browserProvider.getSigner();
    account = await signer.getAddress();
    accountOutput.textContent = account;
    $<HTMLInputElement>("erc20-source").value = account;
    connectButton.textContent = "Connected";
    connectButton.disabled = true;
    selectedWallet.provider.on?.("accountsChanged", () => void refreshConnection());
    selectedWallet.provider.on?.("chainChanged", () => void refreshInstance());
    await refreshInstance();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function refreshConnection() {
  if (!selectedWallet) return;
  try {
    browserProvider = new BrowserProvider(selectedWallet.provider);
    signer = await browserProvider.getSigner();
    account = await signer.getAddress();
    accountOutput.textContent = account;
    $<HTMLInputElement>("erc20-source").value = account;
    await refreshInstance();
  } catch (error) {
    signer = undefined;
    account = undefined;
    accountOutput.textContent = "Not connected";
    setStatus(errorMessage(error), "error");
  }
}

async function refreshInstance() {
  try {
    const address = requireAddress();
    const provider = readProvider();
    const [network, code, balance] = await Promise.all([
      provider.getNetwork(),
      provider.getCode(address),
      provider.getBalance(address),
    ]);
    const codeStatus = code === "0x" ? "no contract bytecode" : `${(code.length - 2) / 2} bytes of bytecode`;
    const accountBalance = account ? formatEther(await provider.getBalance(account)) : undefined;
    setStatus(
      `Chain ${network.chainId.toString()} · ${codeStatus} · contract balance ${formatEther(balance)} ETH${
        accountBalance === undefined ? "" : ` · wallet balance ${accountBalance} ETH`
      }`,
      code === "0x" ? "error" : "success",
    );
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function deployRefuje() {
  try {
    const deployer = requireWallet();
    if (!window.confirm("Deploy a new Refuje instance from the connected account?")) return;
    setStatus("Deploying Refuje: waiting for wallet…");
    const factory = new ContractFactory(REFUJE_ABI, REFUJE_BYTECODE, deployer);
    const deployed = await factory.deploy();
    const deployment = deployed.deploymentTransaction();
    if (!deployment) throw new Error("The wallet did not return a deployment transaction.");
    addLog("Refuje deployment submitted", deployment.hash);
    setStatus("Deployment submitted; waiting for confirmation…");
    await deployed.waitForDeployment();
    const address = await deployed.getAddress();
    instanceAddressInput.value = address;
    localStorage.setItem("refuje.address", address);
    addLog(`Refuje deployed at ${address}`, deployment.hash);
    setStatus(`Refuje deployed at ${address}.`, "success");
    await refreshInstance();
  } catch (error) {
    const message = errorMessage(error);
    addLog(`Refuje deployment failed: ${message}`);
    setStatus(message, "error");
  }
}

async function depositEth(event: SubmitEvent) {
  event.preventDefault();
  const amount = parseEther($<HTMLInputElement>("eth-amount").value.trim());
  const key = uint256($<HTMLInputElement>("eth-key").value);
  await runTransaction("Deposit ETH", () => contract(true).depositToKey(key, { value: amount }));
}

function tokenAddress(): string {
  const raw = $<HTMLInputElement>("token-address").value.trim();
  if (!isAddress(raw)) throw new Error("Enter a valid ERC-20 token address.");
  return getAddress(raw);
}

function tokenAmount(): bigint {
  const decimals = Number($<HTMLInputElement>("token-decimals").value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error("Token decimals must be 0–255.");
  return parseUnits($<HTMLInputElement>("erc20-amount").value.trim(), decimals);
}

async function approveToken() {
  const token = tokenAddress();
  const amount = tokenAmount();
  await runTransaction("Approve ERC-20", () => new Contract(token, ERC20_ABI, requireWallet()).approve(requireAddress(), amount));
}

async function depositErc20(event: SubmitEvent) {
  event.preventDefault();
  const token = tokenAddress();
  const key = uint256($<HTMLInputElement>("erc20-key").value);
  const amount = tokenAmount();
  const sourceInput = $<HTMLInputElement>("erc20-source");
  const source = sourceInput.value.trim() || account;
  if (!source || !isAddress(source)) throw new Error("Enter a valid ERC-20 source address.");
  await runTransaction("Deposit ERC-20", () => contract(true).depositErc20(token, key, amount, getAddress(source)));
}

async function withdraw(event: SubmitEvent) {
  event.preventDefault();
  const path = bytes32($<HTMLInputElement>("withdraw-path").value);
  const targets = bytes($<HTMLTextAreaElement>("withdraw-targets").value);
  const blobs = blobList($<HTMLTextAreaElement>("withdraw-blobs").value);
  const proof = bytes($<HTMLTextAreaElement>("withdraw-proof").value);
  if (withdrawAsset.value === "erc20") {
    const rawToken = $<HTMLInputElement>("withdraw-token").value.trim();
    if (!isAddress(rawToken)) throw new Error("Enter a valid withdrawal token address.");
    const token = getAddress(rawToken);
    await runTransaction("Withdraw ERC-20", () => contract(true).widthdrawErc20(token, path, targets, blobs, proof));
  } else {
    await runTransaction("Withdraw ETH", () => contract(true).widthdrawEth(path, targets, blobs, proof));
  }
}

window.addEventListener("eip6963:announceProvider", (event) => {
  const detail = (event as CustomEvent<WalletDetail>).detail;
  if (!detail?.info?.uuid || !detail.provider) return;
  wallets.set(detail.info.uuid, detail);
  renderWallets();
});

walletSelect.addEventListener("change", () => {
  selectedWallet = wallets.get(walletSelect.value);
  connectButton.disabled = !selectedWallet;
});
connectButton.addEventListener("click", () => void connectWallet());
$("deploy-refuje").addEventListener("click", () => void deployRefuje());
$("refresh-instance").addEventListener("click", () => void refreshInstance());
$("register-key").addEventListener("click", () => void runTransaction("Register public key", () => {
  const key = bytes32($<HTMLInputElement>("eth-key").value);
  return contract(true).registerPubKey(key);
}));
$("eth-deposit-form").addEventListener("submit", (event) => void depositEth(event as SubmitEvent));
$("approve-token").addEventListener("click", () => void approveToken());
$("erc20-deposit-form").addEventListener("submit", (event) => void depositErc20(event as SubmitEvent));
$("withdraw-form").addEventListener("submit", (event) => void withdraw(event as SubmitEvent));
$("clear-log").addEventListener("click", () => {
  activityLog.replaceChildren(Object.assign(document.createElement("li"), { className: "muted", textContent: "No transactions yet." }));
});
withdrawAsset.addEventListener("change", () => withdrawTokenWrap.classList.toggle("hidden", withdrawAsset.value !== "erc20"));

const params = new URLSearchParams(window.location.search);
instanceAddressInput.value = params.get("address") ?? localStorage.getItem("refuje.address") ?? "";
rpcInput.value = params.get("rpc") ?? localStorage.getItem("refuje.rpc") ?? "";
instanceAddressInput.addEventListener("change", () => localStorage.setItem("refuje.address", instanceAddressInput.value.trim()));
rpcInput.addEventListener("change", () => localStorage.setItem("refuje.rpc", rpcInput.value.trim()));

window.dispatchEvent(new Event("eip6963:requestProvider"));
setTimeout(() => {
  renderWallets();
  if (instanceAddressInput.value) void refreshInstance();
}, 250);
