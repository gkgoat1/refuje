import type { Contract, ContractTransaction } from "ethers";
import { AbiCoder, getBytes, keccak256 } from "ethers";
export class Privatekey {
  readonly #array: Uint8Array;
  constructor({ array }: { array: Uint8Array }) {
    this.#array = array;
  }
  get array() {
    return this.#array;
  }
  #at(i: number): Uint8Array {
    return getBytes(
      keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint32"],
          [this.#array, i],
        ),
      ),
    );
  }
  pubkey() {
    const a = new Uint8Array(32 * 512);
    for (let i = 0; i < 512; i++) {
      const hash = getBytes(keccak256(this.#at(i)));
      for (let j = 0; j < 32; j++) a[i * 32 + j] = hash[j];
    }
    const b = new Uint8Array(32 * 64);
    for (let i = 0; i < 64; i++) {
      const hash: Uint8Array = getBytes(
        keccak256(a.slice(i * 32 * 8, (i + 1) * 32 * 8)),
      );
      for (let j = 0; j < 32; j++) b[i * 32 + j] = hash[j];
    }
    const c = new Uint8Array(32 * 8);
    for (let i = 0; i < 8; i++) {
      const hash: Uint8Array = getBytes(
        keccak256(b.slice(i * 32 * 8, (i + 1) * 32 * 8)),
      );
      for (let j = 0; j < 32; j++) c[i * 32 + j] = hash[j];
    }
    return new Publickey({ array: getBytes(keccak256(c)) });
  }
  sign(hash: Uint8Array) {
    let a = new Uint8Array(32 * 512);
    for (let i = 0; i < 512; i++) {
      const x = ((hash[i >> 4] >> ((i >> 1) & 7)) & 1) == (i & 1);
      let b = this.#at(i);
      if (!x) b = getBytes(keccak256(b));
      for (let j = 0; j < 32; j++) a[i * 32 + j] = b[j];
    }
    return new Sig({ array: a });
  }
}
export class Publickey {
  readonly #array: Uint8Array;
  constructor({ array }: { array: Uint8Array }) {
    this.#array = array;
  }
  get array() {
    return this.#array;
  }
}
export class Sig {
  readonly #array: Uint8Array;
  constructor({ array }: { array: Uint8Array }) {
    this.#array = array;
  }
  get array() {
    return this.#array;
  }
  recover(hash: Uint8Array) {
    const a = new Uint8Array(32 * 512);
    for (let i = 0; i < 512; i++) {
      const x = ((hash[i >> 4] >> ((i >> 1) & 7)) & 1) == (i & 1);
      let b = this.#array.slice(i * 32, i * 32 + 32);
      if (x) b = new Uint8Array(getBytes(keccak256(b)));
      for (let j = 0; j < 32; j++) a[i * 32 + j] = b[j];
    }
    const b = new Uint8Array(32 * 64);
    for (let i = 0; i < 64; i++) {
      const hash: Uint8Array = getBytes(
        keccak256(a.slice(i * 32 * 8, (i + 1) * 32 * 8)),
      );
      for (let j = 0; j < 32; j++) b[i * 32 + j] = hash[j];
    }
    const c = new Uint8Array(32 * 8);
    for (let i = 0; i < 8; i++) {
      const hash: Uint8Array = getBytes(
        keccak256(b.slice(i * 32 * 8, (i + 1) * 32 * 8)),
      );
      for (let j = 0; j < 32; j++) c[i * 32 + j] = hash[j];
    }
    return new Publickey({ array: getBytes(keccak256(c)) });
  }
}
export class MerkleTree {
  #inner: undefined | Publickey | [MerkleTree, MerkleTree];
  get inner() {
    return this.#inner;
  }
  set inner(v) {
    this.#inner = v;
  }
  constructor({
    inner,
  }: { inner?: Publickey | [MerkleTree, MerkleTree] } = {}) {
    this.#inner = inner;
  }
  hash(): Uint8Array {
    if (!this.#inner)
      return new Uint8Array(Array.from({ length: 32 }, () => 0));
    if (this.#inner instanceof Publickey) return this.#inner.array;
    const [a, b] = this.#inner.map((v) => v.hash());
    const c = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      if (i < 32) {
        c[i] = a[i];
      } else {
        c[i] = b[i - 32];
      }
    }
    return getBytes(keccak256(c));
  }
  insert(i: boolean[], key: Publickey) {
    let x: MerkleTree = this;
    for (const j of i) {
      x.inner ??= [new MerkleTree(), new MerkleTree()];
      if (Array.isArray(x.inner)) {
        x = x.inner[j ? 1 : 0];
      } else {
        throw new TypeError("not an array");
      }
    }
    x.inner = key;
  }
  prove(i: boolean[]): Uint8Array[] {
    let v: Uint8Array[] = [];
    let t: MerkleTree = this;
    for (const b of i) {
      if (!Array.isArray(t.inner)) throw new TypeError("not an array");
      const a = t.inner;
      t = a[b ? 1 : 0];
      v.push(a[b ? 0 : 1].hash());
    }
    v.reverse();
    return v;
  }
}
export function bools_bytes(a: Uint8Array): boolean[] {
  let b: boolean[] = [];
  for (let i = a.length * 8 - 1; i >= 0; i--) {
    b.push(((a[i >> 3] >> (i & 7)) & 1) != 0);
  }
  return b;
}
export function bigintToUint8Array(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError("value must be non-negative");
  const hex = value.toString(16);
  const len = Math.max(1, Math.ceil(hex.length / 2));
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8[i] = parseInt(hex.slice(i * 2, (i + 1) * 2), 16);
  }
  return u8;
}

function uint256ToUint8Array(value: bigint): Uint8Array {
  const bytes = bigintToUint8Array(value);
  if (bytes.length > 32) throw new RangeError("value does not fit in uint256");
  return new Uint8Array([...new Uint8Array(32 - bytes.length), ...bytes]);
}

export class Targets {
  #array: Uint8Array = new Uint8Array([]);
  get array() {
    return this.#array;
  }
  #blobs: Uint8Array[] = [];
  get blobs() {
    return [...this.#blobs];
  }
  push_key(amount: bigint, key: Uint8Array) {
    this.#array = new Uint8Array([
      ...this.#array,
      ...uint256ToUint8Array(amount),
      ...key,
    ]);
  }
  pushAddress(amount: bigint, addr: string) {
    this.#array = new Uint8Array([
      ...this.#array,
      ...uint256ToUint8Array(amount),
      ...getBytes(addr),
      ...Array.from({ length: 11 }, () => 0),
    ]);
    const self = this;
    let bytes = [0];
    return {
      [Symbol.dispose]() {
        self.#array = new Uint8Array([...self.#array, ...bytes]);
      },
      approve() {
        bytes[0] |= 0x1;
      },
      requireSender() {
        bytes[0] |= 0x40;
      },
      call(
        contract: string,
        call: ContractTransaction,
      ) {
        if (bytes[0] & 0x80) return;
        bytes[0] |= 0x80;
        const b = AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes1", "bytes"],
          [contract, new Uint8Array([0]), call.data],
        );
        self.#blobs.push(getBytes(b));
        bytes = [...bytes, ...getBytes(keccak256(b))];
      },
    };
  }
}
export interface payment {
  pay(key: Privatekey, path: Uint8Array, tree: MerkleTree): Finalizer;
  encodeTargets(targets: Targets): Uint8Array;
}
export interface Finalizer {
  finalize(
    c: Contract,
    targets: Targets,
    tree: MerkleTree,
  ): Promise<ContractTransaction>;
}
function makeFinzlizer(
  pay: payment,
  key: Privatekey,
  path: Uint8Array,
  treePath: string,
  call: (
    c: Contract,
    targets: Targets,
    proof: Uint8Array,
  ) => Promise<ContractTransaction>,
): Finalizer {
  return {
    finalize(c, targets, tree) {
      let hash = keccak256(pay.encodeTargets(targets));
      let x = key.sign(getBytes(hash));
      let p = tree.prove(bools_bytes(getBytes(treePath)));
      let x2 = new Uint8Array([...x.array, ...p.flatMap((a) => [...a])]);
      return call(c, targets, x2);
    },
  };
}
export class payEth implements payment {
  pay(key: Privatekey, path: Uint8Array, tree: MerkleTree) {
    const treePath = keccak256(
      new Uint8Array([
        ...new TextEncoder().encode("pay"),
        ...new TextEncoder().encode(""),
        ...path,
      ]),
    );
    tree.insert(
      bools_bytes(getBytes(treePath)),
      key.pubkey(),
    );
    return makeFinzlizer(this, key, path, treePath, (c, targets, proof) =>
      c.widthdrawEth.populateTransaction(path, targets.array, targets.blobs, proof),
    );
  }
  encodeTargets(targets: Targets): Uint8Array {
    return new Uint8Array([
      ...new TextEncoder().encode("pay"),
      ...new TextEncoder().encode(""),
      ...targets.array,
    ]);
  }
}
export class payAddress implements payment {
  readonly #addr: string;
  get addr() {
    return this.#addr;
  }
  constructor({ addr }: { addr: string }) {
    this.#addr = addr;
  }
  pay(key: Privatekey, path: Uint8Array, tree: MerkleTree) {
    const treePath = keccak256(
      new Uint8Array([
        ...new TextEncoder().encode("pay20"),
        ...getBytes(this.#addr),
        ...path,
      ]),
    );
    tree.insert(
      bools_bytes(getBytes(treePath)),
      key.pubkey(),
    );
    return makeFinzlizer(this, key, path, treePath, (c, targets, proof) =>
      c.widthdrawErc20.populateTransaction(this.#addr, path, targets.array, targets.blobs, proof),
    );
  }
  encodeTargets(targets: Targets): Uint8Array {
    return new Uint8Array([
      ...new TextEncoder().encode("pay20"),
      ...getBytes(this.#addr),
      ...targets.array,
    ]);
  }
}
