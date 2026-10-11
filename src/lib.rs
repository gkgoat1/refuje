use alloy::{
    primitives::{Address, Bytes, FixedBytes, U256, keccak256},
    sol_types::{SolCall, SolValue},
};

use crate::bindings::Refuje::{widthdrawErc20Call, widthdrawEthCall};

pub mod bindings;
pub struct PrivateKey(pub [u8; 32]);
#[derive(Debug, PartialEq, Eq)]
pub struct PubKey(pub [u8; 32]);
pub struct Sig(pub [u8; 32 * 512]);
impl PrivateKey {
    fn at(&self, i: u32) -> [u8; 32] {
        keccak256((FixedBytes(self.0), FixedBytes(i.to_be_bytes())).abi_encode_packed()).0
    }
    pub fn pubkey(&self) -> PubKey {
        let mut a = [0u8; 32 * 512];
        for i in 0..512 {
            let hash = keccak256(self.at(i as u32)).0;
            a[i * 32..][..32].copy_from_slice(&hash);
        }
        let mut b = [0u8; 32 * 64];
        for (i, k) in a.chunks(32 * 8).enumerate() {
            b[i * 32..][..32].copy_from_slice(&keccak256(k).0);
        }
        let mut c = [0u8; 32 * 8];
        for (i, k) in b.chunks(32 * 8).enumerate() {
            c[i * 32..][..32].copy_from_slice(&keccak256(k).0);
        }
        let a = keccak256(c).0;
        PubKey(a)
    }
    pub fn sign(&self, hash: [u8; 32]) -> Sig {
        let mut a = [0u8; 32 * 512];
        for i in 0..512 {
            let x = hash[i >> 4] >> ((i >> 1) & 7) & 1 == (i & 1) as u8;
            let hash = if x {
                self.at(i as u32)
            } else {
                keccak256(self.at(i as u32)).0
            };
            a[i * 32..i * 32 + 32].copy_from_slice(&hash);
        }
        Sig(a)
    }
}
impl Sig {
    pub fn recover(&self, hash: [u8; 32]) -> PubKey {
        let mut a = [0u8; 32 * 512];
        for i in 0..512 {
            let x = hash[(i >> 4) & 31] >> ((i >> 1) & 7) & 1 == (i & 1) as u8;
            if x {
                let hash = keccak256(&self.0[i * 32..i * 32 + 32]).0;
                for j in 0..32 {
                    a[i * 32 + j] = hash[j]
                }
            } else {
                for j in 0..32 {
                    a[i * 32 + j] = self.0[i * 32 + j]
                }
            }
        }
        let mut b = [0u8; 32 * 64];
        for (i, k) in a.chunks(32 * 8).enumerate() {
            b[i * 32..][..32].copy_from_slice(&keccak256(k).0);
        }
        let mut c = [0u8; 32 * 8];
        for (i, k) in b.chunks(32 * 8).enumerate() {
            c[i * 32..][..32].copy_from_slice(&keccak256(k).0);
        }
        let a = keccak256(c).0;
        PubKey(a)
    }
}
pub enum MerkleTree {
    None,
    Level([Box<MerkleTree>; 2]),
    PubKey(PubKey),
}
impl MerkleTree {
    pub fn hash(&self) -> [u8; 32] {
        match self {
            MerkleTree::None => [0u8; 32],
            MerkleTree::Level(a) => {
                let [a, b] = a;
                let [a, b] = [a, b].map(|a| a.hash());
                keccak256((FixedBytes(a), FixedBytes(b)).abi_encode_packed()).0
            }
            MerkleTree::PubKey(pub_key) => pub_key.0,
        }
    }
    pub fn insert(&mut self, mut i: impl Iterator<Item = bool>, key: PubKey) {
        match i.next() {
            Some(b) => {
                let l = loop {
                    match self {
                        MerkleTree::Level(a) => break a,
                        _ => {
                            *self = MerkleTree::Level([
                                Box::new(MerkleTree::None),
                                Box::new(MerkleTree::None),
                            ]);
                        }
                    }
                };
                l[if b { 1 } else { 0 }].insert(i, key)
            }
            None => *self = MerkleTree::PubKey(key),
        }
    }
    pub fn prove(&self, i: impl Iterator<Item = bool>) -> Option<Vec<[u8; 32]>> {
        let mut v = Vec::new();
        let mut t = self;
        for b in i {
            let MerkleTree::Level(a) = t else {
                return None;
            };
            t = &*a[if b { 1 } else { 0 }];
            v.push(a[if b { 0 } else { 1 }].hash());
        }
        assert!(!matches!(t, MerkleTree::None));
        v.reverse();
        Some(v)
    }
}
pub fn bools_bytes<T: AsRef<[u8]>>(t: &T) -> impl Iterator<Item = bool> {
    (0..8 * t.as_ref().len())
        .rev()
        .map(|i| (t.as_ref()[i >> 3] >> (i & 7)) & 1 != 0)
}
#[derive(Default)]
pub struct Targets(Vec<u8>, Vec<Vec<u8>>);
pub struct TargetsPushAddress<'a>(&'a mut Targets, u8, Vec<u8>);
impl Drop for TargetsPushAddress<'_> {
    fn drop(&mut self) {
        self.0
            .0
            .extend([self.1].into_iter().chain(self.2.drain(..)));
    }
}
impl TargetsPushAddress<'_> {
    pub fn approve(&mut self) {
        self.1 |= 0x1;
    }
    pub fn call(&mut self, contract: Address, call: impl SolCall, dispatch: bool) {
        if self.1 & 0x80 != 0 {
            return;
        }
        self.1 |= 0x80;
        let b = (
            contract,
            FixedBytes([if dispatch { 1u8 } else { 0u8 }]),
            call.abi_encode(),
        )
            .abi_encode_params();
        self.2.extend(keccak256(&b));
        self.0.1.push(b);
    }
    pub fn require_sender(&mut self) {
        self.1 |= 0x40;
    }
}
impl Targets {
    pub fn push_address(&mut self, amount: U256, addr: Address) -> TargetsPushAddress<'_> {
        self.0.extend(
            amount
                .to_be_bytes::<32>()
                .into_iter()
                .chain(addr.iter().cloned())
                .chain([0u8; 11]),
        );
        let bs = Vec::new();
        let flags = 0x0;
        TargetsPushAddress(self, flags, bs)
    }
    pub fn push_key(&mut self, amount: U256, addr: [u8; 32]) {
        self.0
            .extend(amount.to_be_bytes::<32>().into_iter().chain(addr));
    }
    fn pay(&self, payment: &Payment) -> Vec<u8> {
        match payment {
            Payment::Eth => {
                ("pay", "", Bytes::from_iter(self.0.iter().cloned())).abi_encode_params()
            }
            Payment::Erc20(address) => (
                "pay20",
                Bytes::from(address.to_vec()),
                Bytes::from_iter(self.0.iter().cloned()),
            )
                .abi_encode_params(),
        }
    }
}
pub enum Payment {
    Eth,
    Erc20(Address),
}
impl Payment {
    pub fn pay<'a>(
        &'a self,
        key: PrivateKey,
        path: [u8; 32],
        tree: &mut MerkleTree,
    ) -> PostPayment<'a> {
        let FixedBytes(tree_path) = keccak256(match self {
            Payment::Eth => ("pay", "", FixedBytes(path)).abi_encode_params(),
            Payment::Erc20(address) => {
                ("pay20", Bytes::from(address.to_vec()), FixedBytes(path)).abi_encode_params()
            }
        });
        tree.insert(bools_bytes(&tree_path), key.pubkey());
        PostPayment {
            pay: self,
            key,
            path,
            tree_path,
        }
    }
}
pub struct PostPayment<'a> {
    pay: &'a Payment,
    key: PrivateKey,
    path: [u8; 32],
    tree_path: [u8; 32],
}
pub enum PaymentCall {
    Eth(widthdrawEthCall),
    Erc20(widthdrawErc20Call),
}
impl PostPayment<'_> {
    pub fn finalize(self, targets: Targets, tree: &MerkleTree) -> PaymentCall {
        let PostPayment {
            pay,
            key,
            path,
            tree_path,
        } = self;
        let hash = keccak256(targets.pay(pay)).0;
        let x = key.sign(hash);
        let proof: alloy::primitives::Bytes =
            x.0.iter()
                .cloned()
                .chain(
                    tree.prove(bools_bytes(&tree_path))
                        .unwrap()
                        .into_iter()
                        .flatten(),
                )
                .collect();
        assert_eq!(proof.len(), 32 * (512 + 256));
        match pay {
            Payment::Eth => PaymentCall::Eth(widthdrawEthCall {
                path: FixedBytes(path),
                targets: targets.0.into(),
                blobs: targets.1.into_iter().map(Into::into).collect(),
                proof,
            }),
            Payment::Erc20(address) => PaymentCall::Erc20(widthdrawErc20Call {
                token: *address,
                path: FixedBytes(path),
                targets: targets.0.into(),
                blobs: targets.1.into_iter().map(Into::into).collect(),
                proof,
            }),
        }
    }
}
#[cfg(test)]
pub mod tests;
