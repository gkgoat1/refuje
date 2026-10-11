use std::array;

use alloy::{
    primitives::{Address, FixedBytes, U8, U256, keccak256},
    sol_types::{SolCall, SolValue},
};

use crate::bindings::Refuje::{widthdrawErc20Call, widthdrawEthCall};

pub mod bindings;
pub struct PrivateKey(pub [u8; 32]);
pub struct PubKey(pub [u8; 32]);
pub struct Sig(pub [[u8; 32]; 512]);
impl PrivateKey {
    pub fn pubkey(&self) -> PubKey {
        let mut a = [0u8; 32 * 512];
        for i in 0..512 {
            let hash = keccak256(keccak256(
                (FixedBytes(self.0), i as u32).abi_encode_packed(),
            ))
            .0;
            a[i * 32..][..32].copy_from_slice(&hash);
        }
        PubKey(keccak256(a).0)
    }
    pub fn sign(&self, hash: [u8; 32]) -> Sig {
        let mut a = [[0u8; 32]; 512];
        for i in 0..512 {
            let x = (hash[i >> 4] & (1 << ((i >> 1) & 7)) != 0) == (i & 1 != 0);
            if !x {
                let hash = keccak256(keccak256(
                    (FixedBytes(self.0), i as u32).abi_encode_packed(),
                ))
                .0;
                a[i] = hash;
            } else {
                let hash = keccak256((FixedBytes(self.0), i as u32).abi_encode_packed()).0;
                a[i] = hash;
            }
        }
        Sig(a)
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
                let a: [u8; 64] = array::from_fn(|i| if i < 32 { a[i] } else { b[i - 32] });
                keccak256(a).0
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
                return l[if b { 1 } else { 0 }].insert(i, key);
            }
            None => *self = MerkleTree::PubKey(key),
        }
    }
    pub fn prove(&self, mut i: impl Iterator<Item = bool>) -> Option<Vec<[u8; 32]>> {
        let mut v = Vec::new();
        let mut t = self;
        for b in i {
            let MerkleTree::Level(a) = t else {
                return None;
            };
            t = &*a[if b { 1 } else { 0 }];
            v.push(a[if b { 0 } else { 1 }].hash());
        }
        v.reverse();
        return Some(v);
    }
}
pub fn bools_bytes<T: AsRef<[u8]>>(t: &T) -> impl Iterator<Item = bool> {
    return t
        .as_ref()
        .iter()
        .rev()
        .cloned()
        .flat_map(|v| (0..8).rev().map(move |i| v & (1 << (i & 7)) != 0));
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
            FixedBytes([0u8 | if dispatch { 1u8 } else { 0u8 }]),
            call.abi_encode(),
        )
            .abi_encode();
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
        let mut bs = Vec::new();
        let mut flags = 0x0;
        TargetsPushAddress(self, flags, bs)
    }
    pub fn push_key(&mut self, amount: U256, addr: [u8; 32]) {
        self.0
            .extend(amount.to_be_bytes::<32>().into_iter().chain(addr));
    }
    fn pay(&self, payment: &Payment) -> Vec<u8> {
        match payment {
            Payment::Eth => ("pay", &self.0).abi_encode_packed(),
            Payment::Erc20(address) => ("pay20", address, &self.0).abi_encode_packed(),
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
        tree.insert(
            bools_bytes(&keccak256(match self {
                Payment::Eth => ("pay", FixedBytes(path)).abi_encode_packed(),
                Payment::Erc20(address) => ("pay20", address, FixedBytes(path)).abi_encode_packed(),
            })),
            key.pubkey(),
        );
        return PostPayment {
            pay: self,
            key,
            path,
        };
    }
}
pub struct PostPayment<'a> {
    pay: &'a Payment,
    key: PrivateKey,
    path: [u8; 32],
}
pub enum PaymentCall {
    Eth(widthdrawEthCall),
    Erc20(widthdrawErc20Call),
}
impl PostPayment<'_> {
    pub fn finalize(self, targets: Targets, tree: &MerkleTree) -> PaymentCall {
        let PostPayment { pay, key, path } = self;
        let proof = key
            .sign(keccak256(targets.pay(pay)).0)
            .0
            .iter()
            .cloned()
            .chain(
                tree.prove(bools_bytes(&keccak256(match pay {
                    Payment::Eth => ("pay", FixedBytes(path)).abi_encode_packed(),
                    Payment::Erc20(address) => {
                        ("pay20", address, FixedBytes(path)).abi_encode_packed()
                    }
                })))
                .unwrap()
                .into_iter(),
            )
            .flatten()
            .collect();
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
